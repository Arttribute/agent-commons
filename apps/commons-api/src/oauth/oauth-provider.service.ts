import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { EncryptionService } from '../modules/encryption';
import * as oauthSchema from '../../models/oauth-schema';

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
export class OAuthProviderService {
  private readonly logger = new Logger(OAuthProviderService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

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
    const provider = await this.db.query.oauthProvider.findFirst({
      where: (p: any) => eq(p.providerKey, providerKey),
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
      conditions.push(eq(oauthSchema.oauthProvider.isPlatform, filters.isPlatform));
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(oauthSchema.oauthProvider.isActive, filters.isActive));
    }

    if (filters?.ownerId) {
      conditions.push(eq(oauthSchema.oauthProvider.ownerId, filters.ownerId));
    }

    if (filters?.ownerType) {
      conditions.push(eq(oauthSchema.oauthProvider.ownerType, filters.ownerType));
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
      where: (p: any) => and(eq(p.providerId, providerId), eq(p.isActive, true)),
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
