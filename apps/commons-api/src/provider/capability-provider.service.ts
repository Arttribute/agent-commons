import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption/encryption.service';
import { capabilityProvider as capabilityProviderTable } from '#/models/schema';

export type CapabilityName = 'web_search' | 'computer' | 'wallet';

export type CapabilityProviderInput = {
  provider: string;
  displayName?: string;
  endpointUrl?: string;
  settings?: Record<string, unknown>;
  credentials?: Record<string, string>;
  status?: 'active' | 'disabled';
};

export type ResolvedCapabilityProvider = {
  provider: string;
  endpointUrl?: string;
  settings: Record<string, unknown>;
  credentials: Record<string, string>;
  source: 'account' | 'platform';
};

const CATALOG = {
  web_search: [
    { id: 'platform', name: 'Commons Search', credentialFields: [] },
    { id: 'brave', name: 'Brave Search', credentialFields: ['apiKey'] },
    { id: 'tavily', name: 'Tavily', credentialFields: ['apiKey'] },
    {
      id: 'searxng',
      name: 'SearXNG',
      credentialFields: ['apiKey'],
      endpoint: true,
    },
    {
      id: 'custom',
      name: 'Custom search API',
      credentialFields: ['apiKey'],
      endpoint: true,
    },
  ],
  computer: [
    { id: 'commonos', name: 'CommonOS', credentialFields: [] },
    {
      id: 'custom',
      name: 'Custom computer adapter',
      credentialFields: ['apiKey'],
      endpoint: true,
    },
  ],
  wallet: [
    { id: 'commons_mpc', name: 'Commons managed wallet', credentialFields: [] },
    { id: 'external', name: 'Owner-connected wallet', credentialFields: [] },
    {
      id: 'custom',
      name: 'Custom wallet adapter',
      credentialFields: ['apiKey'],
      endpoint: true,
    },
  ],
} as const;

@Injectable()
export class CapabilityProviderService {
  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  catalog() {
    return CATALOG;
  }

  async list(ownerId: string) {
    const rows = await this.db
      .select()
      .from(capabilityProviderTable)
      .where(
        sql<boolean>`lower(${capabilityProviderTable.ownerId}) = lower(${ownerId})`,
      )
      .orderBy(capabilityProviderTable.capability);
    return {
      catalog: CATALOG,
      configurations: rows.map((row) => this.publicConfiguration(row)),
    };
  }

  async upsert(
    ownerId: string,
    workspaceId: string | null | undefined,
    capability: CapabilityName,
    input: CapabilityProviderInput,
  ) {
    this.assertCapability(capability);
    const definition = this.definition(capability, input.provider);
    const endpointUrl = input.endpointUrl?.trim() || null;
    if ('endpoint' in definition && definition.endpoint && !endpointUrl) {
      throw new BadRequestException(
        `${definition.name} requires an endpoint URL`,
      );
    }
    if (endpointUrl) validateEndpoint(endpointUrl);
    const settings = sanitizeSettings(input.settings ?? {});
    const existing = await this.find(ownerId, capability);
    let encrypted = existing
      ? {
          encryptedCredentials: existing.encryptedCredentials,
          credentialsIv: existing.credentialsIv,
          credentialsTag: existing.credentialsTag,
        }
      : {
          encryptedCredentials: null as string | null,
          credentialsIv: null as string | null,
          credentialsTag: null as string | null,
        };
    if (input.credentials && Object.keys(input.credentials).length) {
      const credentials = cleanCredentials(input.credentials);
      const sealed = this.encryption.encrypt(JSON.stringify(credentials));
      encrypted = {
        encryptedCredentials: sealed.encryptedValue,
        credentialsIv: sealed.iv,
        credentialsTag: sealed.tag,
      };
    }
    const values = {
      ownerId,
      workspaceId: workspaceId ?? null,
      capability,
      provider: input.provider,
      displayName: input.displayName?.trim() || definition.name,
      endpointUrl,
      settings,
      ...encrypted,
      status: input.status ?? 'active',
      updatedAt: new Date(),
    };
    const [saved] = await this.db
      .insert(capabilityProviderTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          capabilityProviderTable.ownerId,
          capabilityProviderTable.capability,
        ],
        set: values,
      })
      .returning();
    return this.publicConfiguration(saved);
  }

  async remove(ownerId: string, capability: CapabilityName) {
    this.assertCapability(capability);
    const removed = await this.db
      .delete(capabilityProviderTable)
      .where(
        and(
          sql<boolean>`lower(${capabilityProviderTable.ownerId}) = lower(${ownerId})`,
          eq(capabilityProviderTable.capability, capability),
        ),
      )
      .returning({ id: capabilityProviderTable.id });
    if (!removed.length)
      throw new NotFoundException('Provider configuration not found');
    return { deleted: true };
  }

  async resolve(
    ownerId: string,
    capability: CapabilityName,
  ): Promise<ResolvedCapabilityProvider | null> {
    this.assertCapability(capability);
    const row = await this.find(ownerId, capability);
    if (!row || row.status !== 'active' || row.provider === 'platform')
      return null;
    let credentials: Record<string, string> = {};
    if (row.encryptedCredentials && row.credentialsIv && row.credentialsTag) {
      const plaintext = this.encryption.decrypt(
        row.encryptedCredentials,
        row.credentialsIv,
        row.credentialsTag,
      );
      credentials = JSON.parse(plaintext);
    }
    return {
      provider: row.provider,
      endpointUrl: row.endpointUrl ?? undefined,
      settings: (row.settings ?? {}) as Record<string, unknown>,
      credentials,
      source: 'account',
    };
  }

  private definition(capability: CapabilityName, provider: string) {
    const definition = CATALOG[capability].find((item) => item.id === provider);
    if (!definition) {
      throw new BadRequestException(
        `Unsupported ${capability} provider "${provider}"`,
      );
    }
    return definition;
  }

  private assertCapability(capability: CapabilityName) {
    if (!Object.prototype.hasOwnProperty.call(CATALOG, capability)) {
      throw new BadRequestException(`Unsupported capability "${capability}"`);
    }
  }

  private find(ownerId: string, capability: CapabilityName) {
    return this.db.query.capabilityProvider.findFirst({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerId}) = lower(${ownerId})`,
          eq(table.capability, capability),
        ),
    });
  }

  private publicConfiguration(
    row: typeof capabilityProviderTable.$inferSelect,
  ) {
    return {
      id: row.id,
      capability: row.capability,
      provider: row.provider,
      displayName: row.displayName,
      endpointUrl: row.endpointUrl,
      settings: row.settings ?? {},
      status: row.status,
      hasCredentials: Boolean(row.encryptedCredentials),
      updatedAt: row.updatedAt,
    };
  }
}

function cleanCredentials(credentials: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(credentials)
      .map(([key, value]) => [key.trim(), value.trim()])
      .filter(([key, value]) => Boolean(key && value)),
  );
}

function sanitizeSettings(settings: Record<string, unknown>) {
  for (const key of Object.keys(settings)) {
    if (/(secret|token|password|api.?key|private.?key|credential)/i.test(key)) {
      throw new BadRequestException(
        `Store ${key} in credentials, not settings`,
      );
    }
  }
  return settings;
}

function validateEndpoint(value: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new BadRequestException('Provider endpoint must be a valid URL');
  }
  if (endpoint.protocol !== 'https:') {
    throw new BadRequestException(
      'User-provided provider endpoints must use HTTPS',
    );
  }
  if (!endpoint.hostname || isPrivateHostname(endpoint.hostname)) {
    throw new BadRequestException(
      'Provider endpoint must use a public hostname',
    );
  }
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.local') ||
    normalized === '::1' ||
    /^127\./.test(normalized) ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^169\.254\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  );
}
