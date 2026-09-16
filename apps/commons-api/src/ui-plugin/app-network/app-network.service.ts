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
import { guardedHttpsRequest } from './network-guard';

type Plugin = typeof schema.uiPlugin.$inferSelect;
type ManifestConnection = NonNullable<
  Plugin['manifest']['connections']
>[number];

export type AppHttpRequest = {
  connection: string;
  method?: string;
  path?: string;
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  body?: unknown;
};

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_BODY_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 20_000;
const REQUESTS_PER_MINUTE = 120;
const FORWARDED_REQUEST_HEADERS = new Set([
  'accept',
  'accept-language',
  'content-type',
  'if-match',
  'if-none-match',
  'idempotency-key',
]);
const RETURNED_RESPONSE_HEADERS = [
  'content-type',
  'etag',
  'last-modified',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
];

/**
 * External API access for Commons apps. The app names a connection it
 * declared; Commons adds the owner's secret server-side, keeps requests inside
 * the declared base URL, methods and path prefixes, and only ever connects to
 * public addresses. Secrets are never returned to the app or the browser.
 */
@Injectable()
export class AppNetworkService {
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  async listConnections(ownerId: string, plugin: Plugin) {
    const rows = await this.rows(ownerId, plugin.pluginId);
    return (plugin.manifest.connections ?? []).map((connection) => {
      const row = rows.find((candidate) => candidate.key === connection.key);
      return {
        ...connection,
        configured:
          connection.auth.type === 'none' || Boolean(row?.encryptedSecret),
        enabled: row ? row.enabled : true,
        secretHint: row?.secretHint ?? null,
      };
    });
  }

  async saveConnection(
    ownerId: string,
    plugin: Plugin,
    key: string,
    input: { secret?: string | null; enabled?: boolean },
  ) {
    const declared = this.declared(plugin, key);
    const values: Partial<typeof schema.uiPluginConnection.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (typeof input.enabled === 'boolean') values.enabled = input.enabled;
    if (input.secret === null) {
      values.encryptedSecret = null;
      values.secretHint = null;
    } else if (typeof input.secret === 'string') {
      const secret = input.secret.trim();
      if (declared.auth.type === 'none') {
        throw new BadRequestException(`${declared.name} does not use a key`);
      }
      if (!secret || secret.length > 8_000 || /[\r\n]/.test(secret)) {
        throw new BadRequestException('Enter a valid key');
      }
      if (declared.auth.type === 'basic' && !secret.includes(':')) {
        throw new BadRequestException(
          'Basic auth keys use the form username:password',
        );
      }
      const encrypted = this.encryption.encrypt(secret);
      values.encryptedSecret = `enc:${encrypted.iv}:${encrypted.tag}:${encrypted.encryptedValue}`;
      values.secretHint = secret.length > 8 ? `…${secret.slice(-4)}` : '••••';
    }
    await this.db
      .insert(schema.uiPluginConnection)
      .values({
        pluginId: plugin.pluginId,
        ownerUserId: ownerId,
        key,
        enabled: values.enabled ?? true,
        encryptedSecret: values.encryptedSecret ?? null,
        secretHint: values.secretHint ?? null,
      })
      .onConflictDoUpdate({
        target: [
          schema.uiPluginConnection.pluginId,
          schema.uiPluginConnection.key,
        ],
        set: values,
      });
    return this.listConnections(ownerId, plugin);
  }

  async request(ownerId: string, plugin: Plugin, input: AppHttpRequest) {
    const connection = this.declared(plugin, String(input?.connection ?? ''));
    const [row] = await this.rows(ownerId, plugin.pluginId, connection.key);
    if (row && !row.enabled) {
      throw new ForbiddenException(`${connection.name} is turned off`);
    }
    if (connection.auth.type !== 'none' && !row?.encryptedSecret) {
      throw new ForbiddenException(
        `${connection.name} is not connected yet. Add its key in the app settings.`,
      );
    }
    this.consumeRate(plugin.pluginId);

    const method = String(input.method ?? 'GET').toUpperCase();
    if (!connection.methods.includes(method)) {
      throw new ForbiddenException(
        `${connection.name} does not allow ${method} requests`,
      );
    }
    const url = buildTargetUrl(connection, input.path, input.query);
    const headers: Record<string, string> = {
      'user-agent': 'AgentCommons-Apps/1.0',
      accept: 'application/json, text/plain;q=0.9, */*;q=0.5',
    };
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      const lower = name.toLowerCase();
      if (
        FORWARDED_REQUEST_HEADERS.has(lower) &&
        typeof value === 'string' &&
        value.length <= 500 &&
        !/[\r\n]/.test(value)
      ) {
        headers[lower] = value;
      }
    }

    let body: Buffer | undefined;
    if (input.body !== undefined && method !== 'GET') {
      if (typeof input.body === 'string') {
        body = Buffer.from(input.body);
      } else {
        body = Buffer.from(JSON.stringify(input.body));
        headers['content-type'] ??= 'application/json';
      }
      if (body.byteLength > MAX_BODY_BYTES) {
        throw new BadRequestException('Request body is too large');
      }
      headers['content-length'] = String(body.byteLength);
    }

    if (row?.encryptedSecret) {
      const secret = this.decrypt(row.encryptedSecret);
      applyAuth(connection, secret, headers, url);
    }

    const response = await guardedHttpsRequest(url, method, headers, body, {
      maxResponseBytes: MAX_RESPONSE_BYTES,
      timeoutMs: REQUEST_TIMEOUT_MS,
      returnHeaders: RETURNED_RESPONSE_HEADERS,
    });
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers: response.headers,
      body: response.body,
    };
  }

  private declared(plugin: Plugin, key: string) {
    const connection = plugin.manifest.connections?.find(
      (candidate) => candidate.key === key,
    );
    if (!connection) {
      throw new NotFoundException(
        `This app did not declare a connection named "${key}"`,
      );
    }
    return connection;
  }

  private rows(ownerId: string, pluginId: string, key?: string) {
    return this.db
      .select()
      .from(schema.uiPluginConnection)
      .where(
        and(
          eq(schema.uiPluginConnection.pluginId, pluginId),
          sql<boolean>`lower(${schema.uiPluginConnection.ownerUserId}) = lower(${ownerId})`,
          ...(key ? [eq(schema.uiPluginConnection.key, key)] : []),
        ),
      );
  }

  private decrypt(stored: string) {
    const [, iv, tag, value] = stored.split(':');
    return this.encryption.decrypt(value, iv, tag);
  }

  private consumeRate(pluginId: string) {
    const now = Date.now();
    const recent = (this.recent.get(pluginId) ?? []).filter(
      (timestamp) => now - timestamp < 60_000,
    );
    if (recent.length >= REQUESTS_PER_MINUTE) {
      throw new ForbiddenException(
        'This app reached its external request limit. Try again in a minute.',
      );
    }
    recent.push(now);
    this.recent.set(pluginId, recent);
  }
}

export function buildTargetUrl(
  connection: Pick<ManifestConnection, 'baseUrl' | 'pathPrefixes' | 'name'>,
  path: unknown,
  query: unknown,
) {
  const rawPath = typeof path === 'string' && path ? path : '/';
  if (
    !rawPath.startsWith('/') ||
    rawPath.startsWith('//') ||
    rawPath.length > 2_000 ||
    /[ -\\#]/.test(rawPath)
  ) {
    throw new BadRequestException(
      'path must be a relative path starting with /',
    );
  }
  const base = new URL(connection.baseUrl);
  const target = new URL(
    `${base.pathname.replace(/\/+$/, '')}${rawPath}`,
    base.origin,
  );
  // URL parsing resolves dot segments; the result must stay under the base.
  const relative =
    target.pathname.slice(base.pathname.replace(/\/+$/, '').length) || '/';
  if (
    target.origin !== base.origin ||
    !target.pathname.startsWith(base.pathname.replace(/\/+$/, '')) ||
    !relative.startsWith('/')
  ) {
    throw new ForbiddenException('The request left the connection base URL');
  }
  if (
    !connection.pathPrefixes.some((prefix) => {
      if (prefix === '/') return true;
      const bare = prefix.replace(/\/+$/, '');
      return relative === bare || relative.startsWith(`${bare}/`);
    })
  ) {
    throw new ForbiddenException(
      `${connection.name} does not allow requests to ${relative}`,
    );
  }
  if (query !== undefined && query !== null) {
    if (typeof query !== 'object' || Array.isArray(query)) {
      throw new BadRequestException('query must be an object');
    }
    const entries = Object.entries(query as Record<string, unknown>);
    if (entries.length > 50)
      throw new BadRequestException('Too many query parameters');
    for (const [name, value] of entries) {
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new BadRequestException(
          `Query parameter ${name} must be a scalar`,
        );
      }
      target.searchParams.set(name, String(value));
    }
  }
  return target;
}

function applyAuth(
  connection: ManifestConnection,
  secret: string,
  headers: Record<string, string>,
  url: URL,
) {
  switch (connection.auth.type) {
    case 'bearer':
      headers.authorization = `Bearer ${secret}`;
      break;
    case 'basic':
      headers.authorization = `Basic ${Buffer.from(secret).toString('base64')}`;
      break;
    case 'header':
      headers[connection.auth.name!.toLowerCase()] = secret;
      break;
    case 'query':
      url.searchParams.set(connection.auth.name!, secret);
      break;
  }
}
