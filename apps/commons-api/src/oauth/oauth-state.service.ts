import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, lt, gt } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../modules/database';
import * as oauthSchema from '../../models/oauth-schema';

/**
 * OAuthStateService
 *
 * Manages temporary OAuth state tokens for CSRF protection.
 * States are short-lived (10 minutes) and single-use.
 *
 * Key features:
 * - CSRF protection via random state tokens
 * - Short expiry (10 minutes)
 * - One-time use (deleted after validation)
 * - Automatic cleanup of expired states
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);
  private readonly STATE_EXPIRY_MINUTES = 10;

  constructor(private readonly db: DatabaseService) {
    // Run cleanup on service initialization
    this.cleanupExpiredStates().catch((err) =>
      this.logger.error(`Initial cleanup failed: ${err.message}`),
    );
  }

  /**
   * Create a new OAuth state token
   *
   * @param params - State parameters
   * @returns Created state with state ID
   */
  async createState(params: {
    ownerId: string;
    providerId: string;
    redirectUri: string;
    requestedScopes: string[];
    codeVerifier?: string;
    userAgent?: string;
    ipAddress?: string;
  }) {
    try {
      // Generate random state ID (UUID v4 format)
      const stateId = this.generateStateId();

      // Calculate expiry (10 minutes from now)
      const expiresAt = new Date(
        Date.now() + this.STATE_EXPIRY_MINUTES * 60 * 1000,
      );

      // Insert into database
      const [state] = await this.db
        .insert(oauthSchema.oauthState)
        .values({
          stateId,
          ownerId: params.ownerId,
          providerId: params.providerId,
          redirectUri: params.redirectUri,
          requestedScopes: params.requestedScopes,
          codeVerifier: params.codeVerifier,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
          expiresAt,
        })
        .returning();

      this.logger.debug(`Created OAuth state ${stateId} for user ${params.ownerId}`);

      return state;
    } catch (error: any) {
      this.logger.error(`Failed to create state: ${error.message}`);
      throw new Error(`Failed to create state: ${error.message}`);
    }
  }

  /**
   * Get and validate OAuth state
   *
   * @param stateId - State ID from OAuth callback
   * @returns State data
   * @throws NotFoundException if state not found or expired
   */
  async getState(stateId: string) {
    const state = await this.db.query.oauthState.findFirst({
      where: (s: any) => eq(s.stateId, stateId),
      with: {
        provider: true,
      },
    });

    if (!state) {
      throw new NotFoundException(`State ${stateId} not found`);
    }

    // Check if expired
    if (new Date() > state.expiresAt) {
      this.logger.warn(`State ${stateId} has expired`);
      // Delete expired state
      await this.deleteState(stateId);
      throw new Error('State has expired');
    }

    return state;
  }

  /**
   * Delete OAuth state (after successful validation)
   * States are one-time use only
   *
   * @param stateId - State ID to delete
   */
  async deleteState(stateId: string) {
    try {
      await this.db
        .delete(oauthSchema.oauthState)
        .where(eq(oauthSchema.oauthState.stateId, stateId));

      this.logger.debug(`Deleted OAuth state ${stateId}`);
    } catch (error: any) {
      this.logger.error(`Failed to delete state ${stateId}: ${error.message}`);
      // Don't throw - deletion failure shouldn't break the flow
    }
  }

  /**
   * Cleanup expired states (periodic maintenance)
   * Should be called periodically via cron job or on-demand
   *
   * @returns Number of states deleted
   */
  async cleanupExpiredStates(): Promise<number> {
    try {
      const now = new Date();

      // Delete all states where expires_at < now
      const result = await this.db
        .delete(oauthSchema.oauthState)
        .where(lt(oauthSchema.oauthState.expiresAt, now))
        .returning();

      if (result.length > 0) {
        this.logger.log(`Cleaned up ${result.length} expired OAuth states`);
      }

      return result.length;
    } catch (error: any) {
      this.logger.error(`Failed to cleanup expired states: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get all states for a user (debugging purposes)
   *
   * @param ownerId - User ID
   * @returns List of states
   */
  async getStatesByOwner(ownerId: string) {
    const states = await this.db.query.oauthState.findMany({
      where: (s: any) => eq(s.ownerId, ownerId),
      with: {
        provider: true,
      },
      orderBy: (s: any, { desc }) => [desc(s.createdAt)],
    });

    return states;
  }

  /**
   * Count active states for a user
   * Useful for rate limiting
   *
   * @param ownerId - User ID
   * @returns Number of active states
   */
  async countActiveStates(ownerId: string): Promise<number> {
    const now = new Date();

    const states = await this.db.query.oauthState.findMany({
      where: (s: any) =>
        and(eq(s.ownerId, ownerId), gt(s.expiresAt, now)),
    });

    return states.length;
  }

  /**
   * Delete all states for a user
   * Useful for security (e.g., on logout)
   *
   * @param ownerId - User ID
   * @returns Number of states deleted
   */
  async deleteStatesByOwner(ownerId: string): Promise<number> {
    try {
      const result = await this.db
        .delete(oauthSchema.oauthState)
        .where(eq(oauthSchema.oauthState.ownerId, ownerId))
        .returning();

      this.logger.log(`Deleted ${result.length} states for user ${ownerId}`);

      return result.length;
    } catch (error: any) {
      this.logger.error(
        `Failed to delete states for user ${ownerId}: ${error.message}`,
      );
      return 0;
    }
  }

  /**
   * Generate cryptographically secure random state ID
   *
   * @returns Random UUID-like string
   */
  private generateStateId(): string {
    // Generate 16 random bytes (128 bits)
    const bytes = randomBytes(16);

    // Format as UUID v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant

    return [
      bytes.toString('hex', 0, 4),
      bytes.toString('hex', 4, 6),
      bytes.toString('hex', 6, 8),
      bytes.toString('hex', 8, 10),
      bytes.toString('hex', 10, 16),
    ].join('-');
  }

  /**
   * Generate PKCE code verifier (for public clients)
   *
   * @returns Random code verifier string
   */
  generateCodeVerifier(): string {
    // Generate 32 random bytes (256 bits)
    const bytes = randomBytes(32);
    // Base64url encode
    return bytes
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate PKCE code challenge from verifier
   *
   * @param verifier - Code verifier
   * @returns Code challenge (SHA-256 hash, base64url encoded)
   */
  async generateCodeChallenge(verifier: string): Promise<string> {
    const { createHash } = await import('crypto');
    const hash = createHash('sha256').update(verifier).digest('base64');
    // Base64url encode
    return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
