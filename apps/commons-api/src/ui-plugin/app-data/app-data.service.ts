import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption';
import { isCollectionName, UiPluginService } from '../ui-plugin.service';
import { assertPublicHostname } from '../app-network/network-guard';
import {
  isPlainObject,
  isRecordId,
  parseAppQuery,
  sanitizeDocument,
  type AppDataStore,
} from './app-data.types';
import { CommonsAppDataStore } from './commons-store';
import { SupabaseAppDataStore } from './supabase-store';
import {
  closeMongoClient,
  MongoAppDataStore,
  validateMongoUri,
} from './mongodb-store';

type Plugin = typeof schema.uiPlugin.$inferSelect;
export type AppDataProvider = 'commons' | 'supabase' | 'mongodb';

export type AppStorageInput = {
  provider: AppDataProvider;
  url?: string;
  database?: string;
  tablePrefix?: string;
  /** Supabase key or MongoDB connection string. Omit to keep the saved one. */
  secret?: string;
};

export type AppDataOperation =
  | { op: 'collections' }
  | { op: 'get'; collection: string; id: string }
  | { op: 'query'; collection: string; query?: unknown }
  | { op: 'insert'; collection: string; data: unknown }
  | {
      op: 'update';
      collection: string;
      id: string;
      data: unknown;
      replace?: boolean;
    }
  | { op: 'delete'; collection: string; id: string };

/**
 * `commons.data` for apps and agents. Every call is scoped to one app and its
 * owner, validated against the collections the app declared, and routed to
 * the storage the owner chose.
 */
@Injectable()
export class AppDataService {
  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
    private readonly plugins: UiPluginService,
  ) {}

  /** Agent tool access to an app's data, governed by the owner's agent grant. */
  async executeForAgent(
    agentId: string,
    app: string,
    operation: AppDataOperation,
  ) {
    const { ownerId, plugin } = await this.plugins.resolveActiveForAgent(
      agentId,
      app,
    );
    const access = plugin.grants?.agentDataAccess ?? 'none';
    const write = !['collections', 'get', 'query'].includes(operation.op);
    if (access === 'none' || (write && access !== 'readwrite')) {
      throw new ForbiddenException(
        `${plugin.name} does not allow agents to ${write ? 'write' : 'read'} its data. The owner can change this in the app settings.`,
      );
    }
    return this.execute(ownerId, plugin, operation);
  }

  async execute(
    ownerId: string,
    plugin: Plugin,
    operation: AppDataOperation,
    allowedCollections?: string[],
  ) {
    const store = await this.storeFor(ownerId, plugin);
    if (operation.op === 'collections') {
      const declared = plugin.manifest.data?.collections ?? [];
      const existing = await store.collections().catch(() => []);
      const names = new Set([
        ...declared.map((collection) => collection.name),
        ...existing.map((collection) => collection.name),
      ]);
      return {
        provider: await this.providerFor(plugin.pluginId),
        collections: [...names]
          .filter(
            (name) => !allowedCollections || allowedCollections.includes(name),
          )
          .map((name) => ({
            name,
            description: declared.find((entry) => entry.name === name)
              ?.description,
            fields: declared.find((entry) => entry.name === name)?.fields,
            count: existing.find((entry) => entry.name === name)?.count,
          })),
      };
    }

    const collection = this.collection(plugin, operation.collection);
    if (allowedCollections && !allowedCollections.includes(collection)) {
      throw new BadRequestException(
        `This app was not granted access to the ${collection} collection`,
      );
    }
    switch (operation.op) {
      case 'get': {
        const record = await store.get(collection, recordId(operation.id));
        if (!record) throw new NotFoundException('Record not found');
        return record;
      }
      case 'query':
        return store.query(collection, parseAppQuery(operation.query));
      case 'insert': {
        const data = sanitizeDocument(operation.data);
        validateFields(plugin, collection, data, false);
        return store.insert(collection, data);
      }
      case 'update': {
        const data = sanitizeDocument(operation.data);
        validateFields(plugin, collection, data, !operation.replace);
        const record = await store.update(
          collection,
          recordId(operation.id),
          data,
          Boolean(operation.replace),
        );
        if (!record) throw new NotFoundException('Record not found');
        return record;
      }
      case 'delete':
        return {
          deleted: await store.delete(collection, recordId(operation.id)),
        };
      default:
        throw new BadRequestException('Unsupported data operation');
    }
  }

  async getStorage(ownerId: string, plugin: Plugin) {
    const binding = await this.binding(ownerId, plugin.pluginId);
    return {
      provider: (binding?.provider ?? 'commons') as AppDataProvider,
      url: binding?.config?.url ?? null,
      database: binding?.config?.database ?? null,
      tablePrefix: binding?.config?.tablePrefix ?? '',
      secretHint: binding?.secretHint ?? null,
      lastCheckedAt: binding?.lastCheckedAt ?? null,
      lastError: binding?.lastError ?? null,
      collections: plugin.manifest.data?.collections ?? [],
    };
  }

  /** Validates the connection before it is saved, so apps never see a half-configured store. */
  async setStorage(ownerId: string, plugin: Plugin, input: AppStorageInput) {
    const provider = input?.provider;
    if (!['commons', 'supabase', 'mongodb'].includes(provider)) {
      throw new BadRequestException(
        'Choose Commons, Supabase or MongoDB storage',
      );
    }
    const existing = await this.binding(ownerId, plugin.pluginId);
    closeMongoClient(plugin.pluginId);

    if (provider === 'commons') {
      await this.db
        .delete(schema.uiPluginStorage)
        .where(eq(schema.uiPluginStorage.pluginId, plugin.pluginId));
      return this.getStorage(ownerId, plugin);
    }

    const tablePrefix = (input.tablePrefix ?? '').trim();
    if (!/^[a-z0-9_]{0,40}$/.test(tablePrefix)) {
      throw new BadRequestException(
        'The prefix may contain lowercase letters, numbers and underscores',
      );
    }
    const secret =
      input.secret?.trim() ||
      (existing?.provider === provider && existing.encryptedSecret
        ? this.decrypt(existing.encryptedSecret)
        : '');
    if (!secret) {
      throw new BadRequestException(
        provider === 'supabase'
          ? 'Enter a Supabase key'
          : 'Enter a MongoDB connection string',
      );
    }

    const config: { url?: string; database?: string; tablePrefix: string } = {
      tablePrefix,
    };
    let store: AppDataStore;
    if (provider === 'supabase') {
      const url = normalizeSupabaseUrl(input.url);
      await assertPublicHostname(new URL(url).hostname);
      config.url = url;
      store = new SupabaseAppDataStore(url, secret, tablePrefix);
    } else {
      validateMongoUri(secret);
      const database = (input.database ?? '').trim();
      if (!/^[A-Za-z0-9_-]{1,63}$/.test(database)) {
        throw new BadRequestException('Enter the MongoDB database name');
      }
      config.database = database;
      store = new MongoAppDataStore(
        `check:${plugin.pluginId}`,
        secret,
        database,
        tablePrefix,
      );
    }
    try {
      await store.check();
    } finally {
      closeMongoClient(`check:${plugin.pluginId}`);
    }

    const encrypted = this.encryption.encrypt(secret);
    const values = {
      pluginId: plugin.pluginId,
      ownerUserId: ownerId,
      provider,
      config,
      encryptedSecret: `enc:${encrypted.iv}:${encrypted.tag}:${encrypted.encryptedValue}`,
      secretHint:
        provider === 'supabase' ? `…${secret.slice(-4)}` : maskMongoUri(secret),
      lastCheckedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    };
    await this.db
      .insert(schema.uiPluginStorage)
      .values(values)
      .onConflictDoUpdate({
        target: schema.uiPluginStorage.pluginId,
        set: values,
      });
    return this.getStorage(ownerId, plugin);
  }

  private async providerFor(pluginId: string) {
    const [binding] = await this.db
      .select({ provider: schema.uiPluginStorage.provider })
      .from(schema.uiPluginStorage)
      .where(eq(schema.uiPluginStorage.pluginId, pluginId))
      .limit(1);
    return (binding?.provider ?? 'commons') as AppDataProvider;
  }

  private async storeFor(
    ownerId: string,
    plugin: Plugin,
  ): Promise<AppDataStore> {
    const binding = await this.binding(ownerId, plugin.pluginId);
    if (
      !binding ||
      binding.provider === 'commons' ||
      !binding.encryptedSecret
    ) {
      return new CommonsAppDataStore(
        this.db,
        plugin.pluginId,
        plugin.ownerUserId,
      );
    }
    const secret = this.decrypt(binding.encryptedSecret);
    if (binding.provider === 'supabase' && binding.config?.url) {
      return new SupabaseAppDataStore(
        binding.config.url,
        secret,
        binding.config.tablePrefix ?? '',
      );
    }
    if (binding.provider === 'mongodb' && binding.config?.database) {
      return new MongoAppDataStore(
        plugin.pluginId,
        secret,
        binding.config.database,
        binding.config.tablePrefix ?? '',
      );
    }
    throw new BadRequestException(
      'This app storage connection is incomplete. Update it in the app settings.',
    );
  }

  private async binding(ownerId: string, pluginId: string) {
    const [binding] = await this.db
      .select()
      .from(schema.uiPluginStorage)
      .where(
        and(
          eq(schema.uiPluginStorage.pluginId, pluginId),
          sql<boolean>`lower(${schema.uiPluginStorage.ownerUserId}) = lower(${ownerId})`,
        ),
      )
      .limit(1);
    return binding;
  }

  private collection(plugin: Plugin, value: unknown) {
    const name = String(value ?? '').trim();
    if (!isCollectionName(name)) {
      throw new BadRequestException(
        'collection must be a lowercase identifier such as "notes"',
      );
    }
    const declared = plugin.manifest.data?.collections;
    if (declared?.length && !declared.some((entry) => entry.name === name)) {
      throw new BadRequestException(
        `This app did not declare a ${name} collection`,
      );
    }
    return name;
  }

  private decrypt(stored: string) {
    const [, iv, tag, value] = stored.split(':');
    return this.encryption.decrypt(value, iv, tag);
  }
}

function recordId(value: unknown) {
  if (!isRecordId(value))
    throw new BadRequestException('A valid record id is required');
  return value;
}

/** Enforces declared field types. Undeclared fields are allowed. */
export function validateFields(
  plugin: Pick<Plugin, 'manifest'>,
  collection: string,
  data: Record<string, unknown>,
  partial: boolean,
) {
  const fields = plugin.manifest.data?.collections?.find(
    (entry) => entry.name === collection,
  )?.fields;
  if (!fields) return;
  for (const [name, definition] of Object.entries(fields)) {
    const value = data[name];
    if (value === undefined || value === null) {
      if (definition.required && !partial) {
        throw new BadRequestException(`${collection}.${name} is required`);
      }
      continue;
    }
    const actual = Array.isArray(value)
      ? 'array'
      : isPlainObject(value)
        ? 'object'
        : typeof value;
    if (actual !== definition.type) {
      throw new BadRequestException(
        `${collection}.${name} must be ${definition.type === 'array' || definition.type === 'object' ? 'an' : 'a'} ${definition.type}`,
      );
    }
  }
}

function normalizeSupabaseUrl(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new BadRequestException('Enter your Supabase project URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new BadRequestException('The Supabase URL must use https');
  }
  return url.origin;
}

function maskMongoUri(uri: string) {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return 'mongodb://…';
  }
}
