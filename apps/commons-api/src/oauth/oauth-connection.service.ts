import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, or, sql as drizzleSql } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { EncryptionService } from '../modules/encryption';
import { OAuthProviderService } from './oauth-provider.service';
import * as oauthSchema from '../../models/oauth-schema';

/**
 * OAuthConnectionService
 *
 * Manages user OAuth connections with encrypted token storage.
 * Handles token lifecycle, connection resolution, and usage tracking.
 *
 * Key features:
 * - Encrypted token storage (access, refresh, ID tokens)
 * - Connection resolution with priority (initiator → owner)
 * - Usage tracking and error recording
 * - Connection status management
 */
@Injectable()
export class OAuthConnectionService {
  private readonly logger = new Logger(OAuthConnectionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
    private readonly providerService: OAuthProviderService,
  ) {}

  /**
   * Create a new OAuth connection
   *
   * @param params - Connection parameters
   * @returns Created connection (without decrypted tokens)
   */
  async createConnection(params: {
    ownerId: string;
    ownerType: oauthSchema.OAuthOwnerType;
    providerId: string;
    accessToken: string;
    accessTokenExpiresAt?: Date;
    refreshToken: string;
    idToken?: string;
    scopes: string[];
    providerUserId?: string;
    providerUserEmail?: string;
    providerUserName?: string;
    providerMetadata?: Record<string, any>;
    displayName?: string;
    description?: string;
  }) {
    try {
      // Encrypt tokens
      const accessTokenEnc = this.encryption.encrypt(params.accessToken);
      const refreshTokenEnc = this.encryption.encrypt(params.refreshToken);
      const idTokenEnc = params.idToken
        ? this.encryption.encrypt(params.idToken)
        : null;

      // Check if connection already exists
      const existing = await this.db.query.oauthConnection.findFirst({
        where: (c: any) =>
          and(
            eq(c.ownerId, params.ownerId),
            eq(c.ownerType, params.ownerType),
            eq(c.providerId, params.providerId),
          ),
      });

      if (existing) {
        // Update existing connection
        return this.updateConnectionTokens(existing.connectionId, {
          accessToken: params.accessToken,
          accessTokenExpiresAt: params.accessTokenExpiresAt,
          refreshToken: params.refreshToken,
          idToken: params.idToken,
          scopes: params.scopes,
          providerUserId: params.providerUserId,
          providerUserEmail: params.providerUserEmail,
          providerUserName: params.providerUserName,
          providerMetadata: params.providerMetadata,
        });
      }

      // Insert new connection
      const [connection] = await this.db
        .insert(oauthSchema.oauthConnection)
        .values({
          ownerId: params.ownerId,
          ownerType: params.ownerType,
          providerId: params.providerId,
          encryptedAccessToken: accessTokenEnc.encryptedValue,
          accessTokenIv: accessTokenEnc.iv,
          accessTokenTag: accessTokenEnc.tag,
          accessTokenExpiresAt: params.accessTokenExpiresAt,
          encryptedRefreshToken: refreshTokenEnc.encryptedValue,
          refreshTokenIv: refreshTokenEnc.iv,
          refreshTokenTag: refreshTokenEnc.tag,
          encryptedIdToken: idTokenEnc?.encryptedValue,
          idTokenIv: idTokenEnc?.iv,
          idTokenTag: idTokenEnc?.tag,
          scopes: params.scopes,
          providerUserId: params.providerUserId,
          providerUserEmail: params.providerUserEmail,
          providerUserName: params.providerUserName,
          providerMetadata: params.providerMetadata,
          displayName: params.displayName,
          description: params.description,
          status: 'active',
          usageCount: 0,
        })
        .returning();

      this.logger.log(
        `Created OAuth connection ${connection.connectionId} for ${params.ownerType} ${params.ownerId}`,
      );

      return this.sanitizeConnection(connection);
    } catch (error: any) {
      this.logger.error(`Failed to create connection: ${error.message}`);
      throw new Error(`Failed to create connection: ${error.message}`);
    }
  }

  /**
   * Get connection by ID
   *
   * @param connectionId - Connection UUID
   * @returns Connection (without decrypted tokens)
   */
  async getConnection(connectionId: string) {
    const connection = await this.db.query.oauthConnection.findFirst({
      where: (c: any) => eq(c.connectionId, connectionId),
      with: {
        provider: true,
      },
    });

    if (!connection) {
      throw new NotFoundException(`Connection ${connectionId} not found`);
    }

    return this.sanitizeConnection(connection);
  }

  /**
   * Get connection by owner and provider
   *
   * @param ownerId - Owner ID (wallet address or agent ID)
   * @param providerKey - Provider key (e.g., 'google_workspace')
   * @returns Connection (without decrypted tokens)
   */
  async getConnectionByOwner(
    ownerId: string,
    providerKey: string,
    ownerType?: oauthSchema.OAuthOwnerType,
  ) {
    const provider = await this.providerService.getProvider(providerKey);

    const conditions: any[] = [
      eq(oauthSchema.oauthConnection.ownerId, ownerId),
      eq(oauthSchema.oauthConnection.providerId, provider.providerId),
    ];

    if (ownerType) {
      conditions.push(eq(oauthSchema.oauthConnection.ownerType, ownerType));
    }

    const connection = await this.db.query.oauthConnection.findFirst({
      where: (c: any) => and(...conditions),
      with: {
        provider: true,
      },
    });

    if (!connection) {
      return null;
    }

    return this.sanitizeConnection(connection);
  }

  /**
   * List connections for an owner
   *
   * @param filters - Optional filters
   * @returns List of connections
   */
  async listConnections(filters?: {
    ownerId?: string;
    ownerType?: oauthSchema.OAuthOwnerType;
    providerId?: string;
    providerKey?: string;
    status?: oauthSchema.OAuthConnectionStatus;
  }) {
    const conditions: any[] = [];

    if (filters?.ownerId) {
      conditions.push(eq(oauthSchema.oauthConnection.ownerId, filters.ownerId));
    }

    if (filters?.ownerType) {
      conditions.push(
        eq(oauthSchema.oauthConnection.ownerType, filters.ownerType),
      );
    }

    if (filters?.providerId) {
      conditions.push(
        eq(oauthSchema.oauthConnection.providerId, filters.providerId),
      );
    }

    if (filters?.status) {
      conditions.push(eq(oauthSchema.oauthConnection.status, filters.status));
    }

    // If providerKey is specified, get provider ID first
    if (filters?.providerKey) {
      const provider = await this.providerService.getProvider(
        filters.providerKey,
      );
      conditions.push(
        eq(oauthSchema.oauthConnection.providerId, provider.providerId),
      );
    }

    const connections = await this.db.query.oauthConnection.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        provider: true,
      },
      orderBy: (c: any, { desc }) => [desc(c.createdAt)],
    });

    return connections.map((c) => this.sanitizeConnection(c));
  }

  /**
   * Update connection metadata
   *
   * @param connectionId - Connection UUID
   * @param updates - Fields to update
   * @returns Updated connection
   */
  async updateConnection(
    connectionId: string,
    updates: {
      displayName?: string;
      description?: string;
      status?: oauthSchema.OAuthConnectionStatus;
    },
  ) {
    try {
      const connection = await this.getConnection(connectionId);

      const updateData: any = {
        displayName: updates.displayName,
        description: updates.description,
        status: updates.status,
        updatedAt: new Date(),
      };

      // Remove undefined fields
      Object.keys(updateData).forEach(
        (key) => updateData[key] === undefined && delete updateData[key],
      );

      const [updated] = await this.db
        .update(oauthSchema.oauthConnection)
        .set(updateData)
        .where(
          eq(oauthSchema.oauthConnection.connectionId, connection.connectionId),
        )
        .returning();

      this.logger.log(`Updated connection ${connectionId}`);

      return this.sanitizeConnection(updated);
    } catch (error: any) {
      this.logger.error(
        `Failed to update connection ${connectionId}: ${error.message}`,
      );
      throw new Error(`Failed to update connection: ${error.message}`);
    }
  }

  /**
   * Update connection tokens (after refresh)
   *
   * @param connectionId - Connection UUID
   * @param tokens - New tokens
   * @returns Updated connection
   */
  async updateConnectionTokens(
    connectionId: string,
    tokens: {
      accessToken: string;
      accessTokenExpiresAt?: Date;
      refreshToken?: string;
      idToken?: string;
      scopes?: string[];
      providerUserId?: string;
      providerUserEmail?: string;
      providerUserName?: string;
      providerMetadata?: Record<string, any>;
    },
  ) {
    try {
      const connection = await this.getConnection(connectionId);

      // Encrypt new tokens
      const accessTokenEnc = this.encryption.encrypt(tokens.accessToken);
      const refreshTokenEnc = tokens.refreshToken
        ? this.encryption.encrypt(tokens.refreshToken)
        : null;
      const idTokenEnc = tokens.idToken
        ? this.encryption.encrypt(tokens.idToken)
        : null;

      const updateData: any = {
        encryptedAccessToken: accessTokenEnc.encryptedValue,
        accessTokenIv: accessTokenEnc.iv,
        accessTokenTag: accessTokenEnc.tag,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
        status: 'active', // Reset status to active on successful refresh
        lastError: null, // Clear previous errors
      };

      // Update refresh token if provided
      if (refreshTokenEnc) {
        updateData.encryptedRefreshToken = refreshTokenEnc.encryptedValue;
        updateData.refreshTokenIv = refreshTokenEnc.iv;
        updateData.refreshTokenTag = refreshTokenEnc.tag;
      }

      // Update ID token if provided
      if (idTokenEnc) {
        updateData.encryptedIdToken = idTokenEnc.encryptedValue;
        updateData.idTokenIv = idTokenEnc.iv;
        updateData.idTokenTag = idTokenEnc.tag;
      }

      // Update scopes if provided
      if (tokens.scopes) {
        updateData.scopes = tokens.scopes;
      }

      // Update provider user info if provided
      if (tokens.providerUserId) {
        updateData.providerUserId = tokens.providerUserId;
      }
      if (tokens.providerUserEmail) {
        updateData.providerUserEmail = tokens.providerUserEmail;
      }
      if (tokens.providerUserName) {
        updateData.providerUserName = tokens.providerUserName;
      }
      if (tokens.providerMetadata) {
        updateData.providerMetadata = tokens.providerMetadata;
      }

      const [updated] = await this.db
        .update(oauthSchema.oauthConnection)
        .set(updateData)
        .where(
          eq(oauthSchema.oauthConnection.connectionId, connection.connectionId),
        )
        .returning();

      this.logger.log(`Updated tokens for connection ${connectionId}`);

      return this.sanitizeConnection(updated);
    } catch (error: any) {
      this.logger.error(
        `Failed to update connection tokens ${connectionId}: ${error.message}`,
      );
      throw new Error(`Failed to update connection tokens: ${error.message}`);
    }
  }

  /**
   * Delete (revoke) connection
   *
   * @param connectionId - Connection UUID
   */
  async deleteConnection(connectionId: string) {
    try {
      const connection = await this.getConnection(connectionId);

      await this.db
        .delete(oauthSchema.oauthConnection)
        .where(
          eq(oauthSchema.oauthConnection.connectionId, connection.connectionId),
        );

      this.logger.log(`Deleted connection ${connectionId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to delete connection ${connectionId}: ${error.message}`,
      );
      throw new Error(`Failed to delete connection: ${error.message}`);
    }
  }

  /**
   * Get decrypted tokens for a connection
   *
   * @param connectionId - Connection UUID
   * @returns Decrypted token set
   */
  async getDecryptedTokens(
    connectionId: string,
  ): Promise<oauthSchema.OAuthTokenSet> {
    const connection = await this.db.query.oauthConnection.findFirst({
      where: (c: any) => eq(c.connectionId, connectionId),
    });

    if (!connection) {
      throw new NotFoundException(`Connection ${connectionId} not found`);
    }

    // Check if connection is active
    if (connection.status !== 'active') {
      this.logger.warn(
        `Connection ${connectionId} is not active (status: ${connection.status})`,
      );
      throw new Error(
        `Connection is not active (status: ${connection.status})`,
      );
    }

    try {
      // Decrypt access token
      const accessToken = this.encryption.decrypt(
        connection.encryptedAccessToken,
        connection.accessTokenIv,
        connection.accessTokenTag,
      );

      // Decrypt refresh token
      const refreshToken = this.encryption.decrypt(
        connection.encryptedRefreshToken,
        connection.refreshTokenIv,
        connection.refreshTokenTag,
      );

      // Decrypt ID token if present
      let idToken: string | undefined;
      if (
        connection.encryptedIdToken &&
        connection.idTokenIv &&
        connection.idTokenTag
      ) {
        idToken = this.encryption.decrypt(
          connection.encryptedIdToken,
          connection.idTokenIv,
          connection.idTokenTag,
        );
      }

      return {
        accessToken,
        refreshToken,
        idToken,
        expiresAt: connection.accessTokenExpiresAt || undefined,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to decrypt tokens for connection ${connectionId}: ${error.message}`,
      );
      throw new Error('Failed to decrypt tokens');
    }
  }

  /**
   * Increment usage count and update last used timestamp
   *
   * @param connectionId - Connection UUID
   */
  async incrementUsage(connectionId: string) {
    try {
      await this.db.execute(drizzleSql`
        UPDATE oauth_connection
        SET
          usage_count = usage_count + 1,
          last_used_at = timezone('utc', now())
        WHERE connection_id = ${connectionId}
      `);
    } catch (error: any) {
      this.logger.error(
        `Failed to increment usage for connection ${connectionId}: ${error.message}`,
      );
      // Don't throw - usage tracking shouldn't break the flow
    }
  }

  /**
   * Record an error for a connection
   *
   * @param connectionId - Connection UUID
   * @param error - Error message
   */
  async recordError(connectionId: string, error: string) {
    try {
      await this.db
        .update(oauthSchema.oauthConnection)
        .set({
          lastError: error,
          lastErrorAt: new Date(),
          status: 'error',
        })
        .where(eq(oauthSchema.oauthConnection.connectionId, connectionId));

      this.logger.warn(
        `Recorded error for connection ${connectionId}: ${error}`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to record error for connection ${connectionId}: ${err.message}`,
      );
    }
  }

  /**
   * Resolve OAuth connection for a tool execution
   * Priority: session initiator → agent owner
   *
   * @param params - Resolution parameters
   * @returns Connection or null if not found
   */
  async resolveConnectionForTool(params: {
    providerKey: string;
    sessionInitiator?: string; // Wallet address
    agentOwnerId?: string; // Agent owner wallet address
  }) {
    const provider = await this.providerService.getProvider(params.providerKey);

    // Priority 1: Session initiator's connection
    if (params.sessionInitiator) {
      const initiatorConnection = await this.db.query.oauthConnection.findFirst(
        {
          where: (c: any) =>
            and(
              eq(c.ownerId, params.sessionInitiator),
              eq(c.ownerType, 'user'),
              eq(c.providerId, provider.providerId),
              eq(c.status, 'active'),
            ),
          with: {
            provider: true,
          },
        },
      );

      if (initiatorConnection) {
        this.logger.debug(
          `Resolved connection via session initiator: ${params.sessionInitiator}`,
        );
        return this.sanitizeConnection(initiatorConnection);
      }
    }

    // Priority 2: Agent owner's connection
    if (params.agentOwnerId) {
      const ownerConnection = await this.db.query.oauthConnection.findFirst({
        where: (c: any) =>
          and(
            eq(c.ownerId, params.agentOwnerId),
            eq(c.ownerType, 'user'),
            eq(c.providerId, provider.providerId),
            eq(c.status, 'active'),
          ),
        with: {
          provider: true,
        },
      });

      if (ownerConnection) {
        this.logger.debug(
          `Resolved connection via agent owner: ${params.agentOwnerId}`,
        );
        return this.sanitizeConnection(ownerConnection);
      }
    }

    this.logger.debug(
      `No active connection found for provider: ${params.providerKey}`,
    );
    return null;
  }

  /**
   * Check if access token needs refresh (within 5-minute buffer)
   *
   * @param connectionId - Connection UUID
   * @returns True if token needs refresh
   */
  async needsRefresh(connectionId: string): Promise<boolean> {
    const connection = await this.getConnection(connectionId);

    if (!connection.accessTokenExpiresAt) {
      // No expiry info - assume it doesn't expire (or handle differently)
      return false;
    }

    const now = new Date();
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    const expiresAt = new Date(connection.accessTokenExpiresAt);

    return expiresAt.getTime() - now.getTime() < bufferMs;
  }

  /**
   * Remove sensitive fields from connection object
   *
   * @param connection - Connection object
   * @returns Sanitized connection
   */
  private sanitizeConnection(connection: any) {
    return {
      ...connection,
      encryptedAccessToken: undefined,
      accessTokenIv: undefined,
      accessTokenTag: undefined,
      encryptedRefreshToken: undefined,
      refreshTokenIv: undefined,
      refreshTokenTag: undefined,
      encryptedIdToken: undefined,
      idTokenIv: undefined,
      idTokenTag: undefined,
    };
  }
}
