import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { EncryptionService } from '../modules/encryption';
import * as oauthSchema from '../../models/oauth-schema';

type PlatformProviderDefinition = Omit<
  oauthSchema.OAuthProviderConfig,
  'clientId' | 'clientSecret'
> & {
  clientIdEnv: string;
  clientSecretEnv: string;
};

const PLATFORM_PROVIDER_DEFINITIONS: PlatformProviderDefinition[] = [
  {
    providerKey: 'google_workspace',
    displayName: 'Google Workspace',
    description:
      'Connect Google Workspace for Gmail, Drive, Calendar, Docs, Sheets, Classroom, and related tools.',
    logoUrl:
      'https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['openid', 'email', 'profile'],
      classroom: [
        'https://www.googleapis.com/auth/classroom.courses.readonly',
        'https://www.googleapis.com/auth/classroom.announcements',
        'https://www.googleapis.com/auth/classroom.coursework.students',
        'https://www.googleapis.com/auth/classroom.coursework.me',
        'https://www.googleapis.com/auth/classroom.rosters.readonly',
      ],
      drive: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
      ],
      calendar: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      gmail: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      docs: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive.file',
      ],
      sheets: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
      slides: [
        'https://www.googleapis.com/auth/presentations',
        'https://www.googleapis.com/auth/drive.file',
      ],
    },
    authorizationParams: {
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    },
    tokenParams: {},
    isPlatform: true,
  },
  {
    providerKey: 'github',
    displayName: 'GitHub',
    description:
      'Connect GitHub for repository access, issues, pull requests, code context, and project exports.',
    logoUrl:
      'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    revokeUrl: 'https://api.github.com/applications/{client_id}/token',
    userInfoUrl: 'https://api.github.com/user',
    clientIdEnv: 'GITHUB_OAUTH_CLIENT_ID',
    clientSecretEnv: 'GITHUB_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['read:user', 'user:email'],
      repo: ['repo'],
      issues: ['repo'],
      pull_requests: ['repo'],
      workflow: ['workflow'],
      org: ['read:org'],
      gist: ['gist'],
      packages: ['read:packages', 'write:packages'],
    },
    authorizationParams: {},
    tokenParams: {},
    isPlatform: true,
  },
  {
    providerKey: 'slack',
    displayName: 'Slack',
    description:
      'Connect Slack for workspace messages, channels, files, and team updates.',
    logoUrl:
      'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    revokeUrl: 'https://slack.com/api/auth.revoke',
    userInfoUrl: 'https://slack.com/api/auth.test',
    clientIdEnv: 'SLACK_OAUTH_CLIENT_ID',
    clientSecretEnv: 'SLACK_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['channels:read', 'chat:write'],
      messages: [
        'channels:history',
        'groups:history',
        'im:history',
        'mpim:history',
      ],
      files: ['files:read', 'files:write'],
      users: ['users:read', 'users:read.email'],
      commands: ['commands'],
    },
    authorizationParams: {},
    tokenParams: {},
    isPlatform: true,
  },
  {
    providerKey: 'canva',
    displayName: 'Canva',
    description:
      'Connect Canva to create, read, and export designs through Canva Connect APIs.',
    logoUrl: 'https://static.canva.com/static/images/favicon-1.ico',
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    revokeUrl: 'https://api.canva.com/rest/v1/oauth/revoke',
    userInfoUrl: 'https://api.canva.com/rest/v1/users/me/profile',
    clientIdEnv: 'CANVA_OAUTH_CLIENT_ID',
    clientSecretEnv: 'CANVA_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['profile:read', 'design:meta:read'],
      designs: [
        'profile:read',
        'design:meta:read',
        'design:content:read',
        'design:content:write',
      ],
      assets: ['asset:read', 'asset:write'],
      folders: ['folder:read', 'folder:write'],
    },
    authorizationParams: {},
    tokenParams: {},
    isPlatform: true,
  },
  {
    providerKey: 'x',
    displayName: 'X (Twitter)',
    description:
      'Connect an X account so approved agents can read, search, publish, reply to, and delete posts.',
    logoUrl: 'https://abs.twimg.com/favicons/twitter.3.ico',
    authUrl: 'https://x.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    revokeUrl: 'https://api.x.com/2/oauth2/revoke',
    userInfoUrl:
      'https://api.x.com/2/users/me?user.fields=id,name,username,profile_image_url',
    clientIdEnv: 'X_OAUTH_CLIENT_ID',
    clientSecretEnv: 'X_OAUTH_CLIENT_SECRET',
    scopes: {
      default: ['tweet.read', 'users.read', 'offline.access'],
      publish: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    },
    authorizationParams: {},
    tokenParams: {},
    isPlatform: true,
  },
];

/**
 * OAuthProviderService
 *
 * Manages OAuth 2.0 provider configurations (Google, GitHub, Slack, etc.)
 * Handles secure storage of client secrets and provider metadata.
 *
 * Key features:
 * - Provider registration and configuration
 * - Encrypted client secret storage
 * - Scope management
 * - Provider discovery
 */
@Injectable()
export class OAuthProviderService implements OnModuleInit {
  private readonly logger = new Logger(OAuthProviderService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  async onModuleInit() {
    await this.syncPlatformProvidersFromEnvironment();
  }

  /**
   * Platform connections use centrally managed OAuth apps. Operators provide
   * each app's credentials through runtime secrets; startup upserts the
   * encrypted provider record so deploys do not depend on a legacy, ad-hoc
   * database seed command.
   */
  private async syncPlatformProvidersFromEnvironment() {
    for (const definition of PLATFORM_PROVIDER_DEFINITIONS) {
      let clientId = process.env[definition.clientIdEnv];
      let clientSecret = process.env[definition.clientSecretEnv];
      if (definition.providerKey === 'x') {
        clientId ??= process.env.TWITTER_OAUTH_CLIENT_ID;
        clientSecret ??= process.env.TWITTER_OAUTH_CLIENT_SECRET;
      }

      if (!clientId && !clientSecret) continue;
      if (!clientId || !clientSecret) {
        this.logger.warn(
          `${definition.displayName} OAuth is disabled because ${definition.clientIdEnv} and ${definition.clientSecretEnv} must both be set`,
        );
        continue;
      }

      const {
        clientIdEnv: _clientIdEnv,
        clientSecretEnv: _clientSecretEnv,
        ...providerDefinition
      } = definition;
      const config: oauthSchema.OAuthProviderConfig = {
        ...providerDefinition,
        clientId,
        clientSecret,
      };

      try {
        const aliases = providerAliases(definition.providerKey);
        const existing = await this.db.query.oauthProvider.findFirst({
          where: (provider: any) =>
            aliases.length > 1
              ? or(...aliases.map((key) => eq(provider.providerKey, key)))
              : eq(provider.providerKey, definition.providerKey),
        });
        if (existing) {
          await this.updateProvider(definition.providerKey, config);
          await this.setProviderActive(definition.providerKey, true);
        } else {
          await this.createProvider(config);
        }
        this.logger.log(`${definition.displayName} OAuth is configured`);
      } catch (error: any) {
        // One provider's configuration must not prevent the API or the other
        // providers from starting.
        this.logger.error(
          `Could not configure ${definition.displayName} OAuth: ${error.message}`,
        );
      }
    }
  }

  /**
   * Create a new OAuth provider
   *
   * @param config - Provider configuration
   * @returns Created provider (without decrypted secret)
   */
  async createProvider(config: oauthSchema.OAuthProviderConfig) {
    try {
      // Encrypt client secret
      const encrypted = this.encryption.encrypt(config.clientSecret);

      // Insert into database
      const [provider] = await this.db
        .insert(oauthSchema.oauthProvider)
        .values({
          providerKey: config.providerKey,
          displayName: config.displayName,
          description: config.description,
          logoUrl: config.logoUrl,
          authUrl: config.authUrl,
          tokenUrl: config.tokenUrl,
          revokeUrl: config.revokeUrl,
          userInfoUrl: config.userInfoUrl,
          clientId: config.clientId,
          encryptedClientSecret: encrypted.encryptedValue,
          secretIv: encrypted.iv,
          secretTag: encrypted.tag,
          scopes: config.scopes,
          authorizationParams: config.authorizationParams,
          tokenParams: config.tokenParams,
          isActive: true,
          isPlatform: config.isPlatform ?? true,
          ownerId: config.ownerId,
          ownerType: config.ownerType,
        })
        .returning();

      this.logger.log(`Created OAuth provider: ${provider.providerKey}`);

      // Return without sensitive data
      return this.sanitizeProvider(provider);
    } catch (error: any) {
      this.logger.error(
        `Failed to create provider ${config.providerKey}: ${error.message}`,
      );
      throw new Error(`Failed to create provider: ${error.message}`);
    }
  }

  /**
   * Get provider by provider key
   *
   * @param providerKey - Provider key (e.g., 'google_workspace', 'github')
   * @returns Provider configuration
   */
  async getProvider(providerKey: string) {
    const exactProvider = await this.db.query.oauthProvider.findFirst({
      where: (p: any) => eq(p.providerKey, providerKey),
    });
    if (exactProvider) return this.sanitizeProvider(exactProvider);

    const providerKeys = providerAliases(providerKey);
    const provider = await this.db.query.oauthProvider.findFirst({
      where: (p: any) =>
        or(...providerKeys.map((key) => eq(p.providerKey, key))),
    });

    if (!provider) {
      throw new NotFoundException(`Provider ${providerKey} not found`);
    }

    return this.sanitizeProvider(provider);
  }

  /**
   * Get provider by ID
   *
   * @param providerId - Provider UUID
   * @returns Provider configuration
   */
  async getProviderById(providerId: string) {
    const provider = await this.db.query.oauthProvider.findFirst({
      where: (p: any) => eq(p.providerId, providerId),
    });

    if (!provider) {
      throw new NotFoundException(`Provider ${providerId} not found`);
    }

    return this.sanitizeProvider(provider);
  }

  /**
   * List all providers (optionally filtered)
   *
   * @param filters - Optional filters
   * @returns List of providers
   */
  async listProviders(filters?: {
    isPlatform?: boolean;
    isActive?: boolean;
    ownerId?: string;
    ownerType?: string;
  }) {
    const conditions: any[] = [];

    if (filters?.isPlatform !== undefined) {
      conditions.push(
        eq(oauthSchema.oauthProvider.isPlatform, filters.isPlatform),
      );
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(oauthSchema.oauthProvider.isActive, filters.isActive));
    }

    if (filters?.ownerId) {
      conditions.push(eq(oauthSchema.oauthProvider.ownerId, filters.ownerId));
    }

    if (filters?.ownerType) {
      conditions.push(
        eq(oauthSchema.oauthProvider.ownerType, filters.ownerType),
      );
    }

    const providers = await this.db.query.oauthProvider.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (p: any, { asc }) => [asc(p.displayName)],
    });

    return providers.map((p) => this.sanitizeProvider(p));
  }

  /**
   * Update provider configuration
   *
   * @param providerKey - Provider key
   * @param updates - Fields to update
   * @returns Updated provider
   */
  async updateProvider(
    providerKey: string,
    updates: Partial<oauthSchema.OAuthProviderConfig>,
  ) {
    try {
      const provider = await this.getProvider(providerKey);

      const updateData: any = {
        displayName: updates.displayName,
        description: updates.description,
        logoUrl: updates.logoUrl,
        authUrl: updates.authUrl,
        tokenUrl: updates.tokenUrl,
        revokeUrl: updates.revokeUrl,
        userInfoUrl: updates.userInfoUrl,
        clientId: updates.clientId,
        scopes: updates.scopes,
        authorizationParams: updates.authorizationParams,
        tokenParams: updates.tokenParams,
        isPlatform: updates.isPlatform,
        ownerId: updates.ownerId,
        ownerType: updates.ownerType,
        updatedAt: new Date(),
      };

      // If updating client secret, encrypt it
      if (updates.clientSecret) {
        const encrypted = this.encryption.encrypt(updates.clientSecret);
        updateData.encryptedClientSecret = encrypted.encryptedValue;
        updateData.secretIv = encrypted.iv;
        updateData.secretTag = encrypted.tag;
      }

      // Remove undefined fields
      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key],
      );

      const [updated] = await this.db
        .update(oauthSchema.oauthProvider)
        .set(updateData)
        .where(eq(oauthSchema.oauthProvider.providerId, provider.providerId))
        .returning();

      this.logger.log(`Updated OAuth provider: ${providerKey}`);

      return this.sanitizeProvider(updated);
    } catch (error: any) {
      this.logger.error(
        `Failed to update provider ${providerKey}: ${error.message}`,
      );
      throw new Error(`Failed to update provider: ${error.message}`);
    }
  }

  /**
   * Delete provider
   *
   * @param providerKey - Provider key
   */
  async deleteProvider(providerKey: string) {
    try {
      const provider = await this.getProvider(providerKey);

      await this.db
        .delete(oauthSchema.oauthProvider)
        .where(eq(oauthSchema.oauthProvider.providerId, provider.providerId));

      this.logger.log(`Deleted OAuth provider: ${providerKey}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to delete provider ${providerKey}: ${error.message}`,
      );
      throw new Error(`Failed to delete provider: ${error.message}`);
    }
  }

  /**
   * Activate or deactivate a provider
   *
   * @param providerKey - Provider key
   * @param isActive - Active status
   */
  async setProviderActive(providerKey: string, isActive: boolean) {
    try {
      const provider = await this.getProvider(providerKey);

      await this.db
        .update(oauthSchema.oauthProvider)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(oauthSchema.oauthProvider.providerId, provider.providerId));

      this.logger.log(
        `Set OAuth provider ${providerKey} active status to: ${isActive}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to update provider ${providerKey} status: ${error.message}`,
      );
      throw new Error(`Failed to update provider status: ${error.message}`);
    }
  }

  /**
   * Get decrypted client secret (use sparingly, only for OAuth flows)
   *
   * @param providerId - Provider UUID
   * @returns Decrypted client secret
   */
  async getDecryptedClientSecret(providerId: string): Promise<string> {
    const provider = await this.db.query.oauthProvider.findFirst({
      where: (p: any) =>
        and(eq(p.providerId, providerId), eq(p.isActive, true)),
    });

    if (!provider) {
      throw new NotFoundException(
        `Provider ${providerId} not found or inactive`,
      );
    }

    try {
      const decrypted = this.encryption.decrypt(
        provider.encryptedClientSecret,
        provider.secretIv,
        provider.secretTag,
      );

      return decrypted;
    } catch (error: any) {
      this.logger.error(
        `Failed to decrypt client secret for provider ${providerId}: ${error.message}`,
      );
      throw new Error('Failed to decrypt client secret');
    }
  }

  /**
   * Get all scopes for a provider (flattened from scope groups)
   *
   * @param providerKey - Provider key
   * @param scopeGroups - Optional specific scope groups to include
   * @returns Array of scope strings
   */
  async getProviderScopes(
    providerKey: string,
    scopeGroups?: string[],
  ): Promise<string[]> {
    const provider = await this.getProvider(providerKey);
    const scopes = provider.scopes as Record<string, string[]>;

    if (!scopeGroups || scopeGroups.length === 0) {
      // Return all scopes from all groups
      return Object.values(scopes).flat();
    }

    // Return scopes from specified groups
    const selectedScopes: string[] = [];
    for (const group of scopeGroups) {
      if (scopes[group]) {
        selectedScopes.push(...scopes[group]);
      }
    }

    // Remove duplicates
    return Array.from(new Set(selectedScopes));
  }

  /**
   * Validate provider configuration
   *
   * @param config - Provider configuration
   * @returns Validation result
   */
  validateProviderConfig(config: oauthSchema.OAuthProviderConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!config.providerKey || !/^[a-z0-9_]+$/.test(config.providerKey)) {
      errors.push(
        'providerKey must contain only lowercase letters, numbers, and underscores',
      );
    }

    if (!config.displayName) {
      errors.push('displayName is required');
    }

    if (!config.authUrl || !this.isValidUrl(config.authUrl)) {
      errors.push('authUrl must be a valid URL');
    }

    if (!config.tokenUrl || !this.isValidUrl(config.tokenUrl)) {
      errors.push('tokenUrl must be a valid URL');
    }

    if (config.revokeUrl && !this.isValidUrl(config.revokeUrl)) {
      errors.push('revokeUrl must be a valid URL');
    }

    if (config.userInfoUrl && !this.isValidUrl(config.userInfoUrl)) {
      errors.push('userInfoUrl must be a valid URL');
    }

    if (!config.clientId) {
      errors.push('clientId is required');
    }

    if (!config.clientSecret) {
      errors.push('clientSecret is required');
    }

    if (!config.scopes || Object.keys(config.scopes).length === 0) {
      errors.push('scopes must contain at least one scope group');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Remove sensitive fields from provider object
   *
   * @param provider - Provider object
   * @returns Sanitized provider
   */
  private sanitizeProvider(provider: any) {
    return {
      ...provider,
      encryptedClientSecret: undefined,
      secretIv: undefined,
      secretTag: undefined,
    };
  }

  /**
   * Validate URL format
   *
   * @param url - URL string
   * @returns True if valid
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

function providerAliases(providerKey: string) {
  if (providerKey === 'google_workspace' || providerKey === 'google') {
    return ['google_workspace', 'google', 'google_oauth'];
  }
  if (providerKey === 'x' || providerKey === 'twitter') {
    return ['x', 'twitter'];
  }
  return [providerKey];
}
