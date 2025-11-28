import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { EncryptionService } from '../modules/encryption';
import * as schema from '../../models/schema';

/**
 * ToolKeyService
 *
 * Manages encrypted API keys and secrets for tools.
 * All keys are encrypted at rest using AES-256-GCM.
 *
 * Key features:
 * - Secure storage with encryption
 * - User-level and agent-level keys
 * - Tool-specific or global keys
 * - Usage tracking
 * - Key masking for display
 */
@Injectable()
export class ToolKeyService {
  private readonly logger = new Logger(ToolKeyService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Create a new encrypted key
   *
   * @param params - Key creation parameters
   * @returns Created key (with masked value)
   */
  async createKey(params: {
    keyName: string;
    value: string;
    ownerId: string;
    ownerType: 'user' | 'agent';
    toolId?: string;
    displayName?: string;
    description?: string;
    keyType?: 'api-key' | 'bearer-token' | 'oauth-token' | 'secret';
    expiresAt?: Date;
  }) {
    try {
      // Encrypt the value
      const encrypted = this.encryption.encrypt(params.value);
      const maskedValue = this.encryption.maskValue(params.value);

      // Insert into database
      const [key] = await this.db
        .insert(schema.toolKey)
        .values({
          keyName: params.keyName,
          displayName: params.displayName,
          description: params.description,
          encryptedValue: encrypted.encryptedValue,
          encryptionIV: encrypted.iv,
          encryptionTag: encrypted.tag,
          ownerId: params.ownerId,
          ownerType: params.ownerType,
          toolId: params.toolId,
          keyType: params.keyType || 'api-key',
          maskedValue,
          isActive: true,
          usageCount: 0,
          expiresAt: params.expiresAt,
        })
        .returning();

      this.logger.log(
        `Created key ${key.keyId} for ${params.ownerType} ${params.ownerId}`,
      );

      // Return without sensitive data
      return {
        ...key,
        encryptedValue: undefined,
        encryptionIV: undefined,
        encryptionTag: undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to create key: ${error.message}`);
      throw new Error('Failed to create key');
    }
  }

  /**
   * Get a decrypted key value (use sparingly, only when needed for tool execution)
   *
   * @param keyId - The key ID
   * @returns Decrypted key value
   */
  async getDecryptedKey(keyId: string): Promise<string> {
    const key = await this.db.query.toolKey.findFirst({
      where: (k: any) => and(eq(k.keyId, keyId), eq(k.isActive, true)),
    });

    if (!key) {
      throw new NotFoundException(`Key ${keyId} not found or inactive`);
    }

    // Check expiration
    if (key.expiresAt && new Date() > key.expiresAt) {
      this.logger.warn(`Key ${keyId} has expired`);
      throw new Error('Key has expired');
    }

    try {
      // Decrypt
      const decrypted = this.encryption.decrypt(
        key.encryptedValue,
        key.encryptionIV,
        key.encryptionTag,
      );

      // Track usage
      await this.db
        .update(schema.toolKey)
        .set({
          lastUsedAt: new Date(),
          usageCount: (key.usageCount || 0) + 1,
        })
        .where(eq(schema.toolKey.keyId, keyId));

      return decrypted;
    } catch (error: any) {
      this.logger.error(`Failed to decrypt key ${keyId}: ${error.message}`);
      throw new Error('Failed to decrypt key');
    }
  }

  /**
   * Get key metadata (without decrypted value)
   *
   * @param keyId - The key ID
   * @returns Key metadata
   */
  async getKeyMetadata(keyId: string) {
    const key = await this.db.query.toolKey.findFirst({
      where: (k: any) => eq(k.keyId, keyId),
    });

    if (!key) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    // Return without sensitive data
    return {
      ...key,
      encryptedValue: undefined,
      encryptionIV: undefined,
      encryptionTag: undefined,
    };
  }

  /**
   * List all keys for a specific owner (user or agent)
   *
   * @param ownerId - User ID or Agent ID
   * @param ownerType - 'user' or 'agent'
   * @returns List of keys (masked)
   */
  async listKeys(ownerId: string, ownerType: 'user' | 'agent') {
    const keys = await this.db.query.toolKey.findMany({
      where: (k: any) =>
        and(eq(k.ownerId, ownerId), eq(k.ownerType, ownerType)),
    });

    // Return without sensitive data
    return keys.map((key) => ({
      ...key,
      encryptedValue: undefined,
      encryptionIV: undefined,
      encryptionTag: undefined,
    }));
  }

  /**
   * Update a key's metadata (not the value itself)
   *
   * @param keyId - The key ID
   * @param updates - Fields to update
   * @returns Updated key metadata
   */
  async updateKeyMetadata(
    keyId: string,
    updates: {
      displayName?: string;
      description?: string;
      isActive?: boolean;
      expiresAt?: Date;
    },
  ) {
    const [updated] = await this.db
      .update(schema.toolKey)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(schema.toolKey.keyId, keyId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    this.logger.log(`Updated key ${keyId}`);

    return {
      ...updated,
      encryptedValue: undefined,
      encryptionIV: undefined,
      encryptionTag: undefined,
    };
  }

  /**
   * Rotate a key's encryption (re-encrypt with new IV)
   *
   * @param keyId - The key ID
   * @returns Success indicator
   */
  async rotateKeyEncryption(keyId: string) {
    const key = await this.db.query.toolKey.findFirst({
      where: (k: any) => eq(k.keyId, keyId),
    });

    if (!key) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    try {
      // Rotate encryption
      const rotated = this.encryption.rotateEncryption(
        key.encryptedValue,
        key.encryptionIV,
        key.encryptionTag,
      );

      // Update in database
      await this.db
        .update(schema.toolKey)
        .set({
          encryptedValue: rotated.encryptedValue,
          encryptionIV: rotated.iv,
          encryptionTag: rotated.tag,
          updatedAt: new Date(),
        })
        .where(eq(schema.toolKey.keyId, keyId));

      this.logger.log(`Rotated encryption for key ${keyId}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error(
        `Failed to rotate encryption for key ${keyId}: ${error.message}`,
      );
      throw new Error('Failed to rotate key encryption');
    }
  }

  /**
   * Update a key's value (decrypt old, encrypt new)
   *
   * @param keyId - The key ID
   * @param newValue - New plaintext value
   * @returns Success indicator
   */
  async updateKeyValue(keyId: string, newValue: string) {
    const key = await this.db.query.toolKey.findFirst({
      where: (k: any) => eq(k.keyId, keyId),
    });

    if (!key) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    try {
      // Encrypt new value
      const encrypted = this.encryption.encrypt(newValue);
      const maskedValue = this.encryption.maskValue(newValue);

      // Update in database
      await this.db
        .update(schema.toolKey)
        .set({
          encryptedValue: encrypted.encryptedValue,
          encryptionIV: encrypted.iv,
          encryptionTag: encrypted.tag,
          maskedValue,
          updatedAt: new Date(),
        })
        .where(eq(schema.toolKey.keyId, keyId));

      this.logger.log(`Updated value for key ${keyId}`);

      return { success: true, maskedValue };
    } catch (error: any) {
      this.logger.error(
        `Failed to update key ${keyId} value: ${error.message}`,
      );
      throw new Error('Failed to update key value');
    }
  }

  /**
   * Delete a key
   *
   * @param keyId - The key ID
   * @returns Success indicator
   */
  async deleteKey(keyId: string) {
    const result = await this.db
      .delete(schema.toolKey)
      .where(eq(schema.toolKey.keyId, keyId))
      .returning();

    if (!result.length) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    this.logger.log(`Deleted key ${keyId}`);

    return { success: true };
  }

  /**
   * Map a key to a tool for a specific context (user or agent)
   *
   * @param params - Mapping parameters
   * @returns Created mapping
   */
  async mapKeyToTool(params: {
    toolId: string;
    keyId: string;
    contextId: string;
    contextType: 'user' | 'agent' | 'global';
    priority?: number;
  }) {
    const [mapping] = await this.db
      .insert(schema.toolKeyMapping)
      .values({
        toolId: params.toolId,
        keyId: params.keyId,
        contextId: params.contextId,
        contextType: params.contextType,
        priority: params.priority || 0,
      })
      .returning();

    this.logger.log(
      `Mapped key ${params.keyId} to tool ${params.toolId} for ${params.contextType} ${params.contextId}`,
    );

    return mapping;
  }

  /**
   * Get the appropriate key for a tool execution
   * Checks in order: agent-specific → user-specific → global
   *
   * @param toolId - The tool ID
   * @param agentId - The agent executing the tool
   * @param userId - The user who owns the agent (optional)
   * @returns Decrypted key value or null
   */
  async resolveKeyForTool(
    toolId: string,
    agentId: string,
    userId?: string,
  ): Promise<string | null> {
    // Build priority query: agent → user → global
    const mappings = await this.db.query.toolKeyMapping.findMany({
      where: (m) =>
        and(
          eq(m.toolId, toolId),
          or(
            and(eq(m.contextType, 'agent'), eq(m.contextId, agentId)),
            userId
              ? and(eq(m.contextType, 'user'), eq(m.contextId, userId))
              : undefined,
            eq(m.contextType, 'global'),
          ),
        ),
      with: {
        key: true,
      },
      orderBy: (m, { desc }) => [desc(m.priority)],
    });

    if (!mappings.length) {
      return null;
    }

    // Find first active, non-expired key
    for (const mapping of mappings) {
      const key = mapping.key;
      if (
        key &&
        key.isActive &&
        (!key.expiresAt || new Date() <= key.expiresAt)
      ) {
        try {
          return await this.getDecryptedKey(key.keyId);
        } catch (error: any) {
          this.logger.warn(
            `Failed to decrypt key ${key.keyId}, trying next: ${error.message}`,
          );
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Remove a key mapping
   *
   * @param mappingId - The mapping ID
   * @returns Success indicator
   */
  async removeKeyMapping(mappingId: string) {
    const result = await this.db
      .delete(schema.toolKeyMapping)
      .where(eq(schema.toolKeyMapping.id, mappingId))
      .returning();

    if (!result.length) {
      throw new NotFoundException(`Mapping ${mappingId} not found`);
    }

    this.logger.log(`Removed key mapping ${mappingId}`);

    return { success: true };
  }

  /**
   * Test if a key is valid (can be decrypted and used)
   *
   * @param keyId - The key ID
   * @returns Validation result
   */
  async testKey(keyId: string): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      const decrypted = await this.getDecryptedKey(keyId);
      return { valid: !!decrypted };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}
