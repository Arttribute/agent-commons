import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * EncryptionService
 *
 * Provides AES-256-GCM encryption/decryption for sensitive data like API keys.
 * Inspired by Vercel's approach to environment variable management.
 *
 * Security features:
 * - AES-256-GCM authenticated encryption
 * - Random IV per encryption
 * - Authentication tag verification on decryption
 * - Master key from environment variable
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly masterKey: Buffer;

  constructor() {
    const masterKeyEnv = process.env.TOOL_KEY_ENCRYPTION_MASTER;

    if (!masterKeyEnv) {
      throw new Error(
        'TOOL_KEY_ENCRYPTION_MASTER environment variable is required for key encryption',
      );
    }

    // Convert hex string to buffer or use directly if base64
    try {
      // Try as hex first
      this.masterKey = Buffer.from(masterKeyEnv, 'hex');
      if (this.masterKey.length !== this.keyLength) {
        // Try as base64
        this.masterKey = Buffer.from(masterKeyEnv, 'base64');
      }

      if (this.masterKey.length !== this.keyLength) {
        throw new Error(
          `Master key must be ${this.keyLength} bytes (${this.keyLength * 8} bits)`,
        );
      }

      this.logger.log('Encryption service initialized successfully');
    } catch (error: any) {
      throw new Error(
        `Invalid TOOL_KEY_ENCRYPTION_MASTER format: ${error.message}`,
      );
    }
  }

  /**
   * Encrypt a plaintext value
   *
   * @param plaintext - The value to encrypt (e.g., API key)
   * @returns Object containing encrypted value, IV, and auth tag
   */
  encrypt(plaintext: string): {
    encryptedValue: string;
    iv: string;
    tag: string;
  } {
    try {
      // Generate random IV
      const iv = randomBytes(this.ivLength);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, this.masterKey, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        encryptedValue: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
      };
    } catch (error: any) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted value
   *
   * @param encryptedValue - The encrypted value (hex)
   * @param iv - The initialization vector (hex)
   * @param tag - The authentication tag (hex)
   * @returns The decrypted plaintext
   */
  decrypt(encryptedValue: string, iv: string, tag: string): string {
    try {
      // Convert from hex
      const ivBuffer = Buffer.from(iv, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');

      // Create decipher
      const decipher = createDecipheriv(
        this.algorithm,
        this.masterKey,
        ivBuffer,
      );

      // Set authentication tag
      decipher.setAuthTag(tagBuffer);

      // Decrypt
      let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error('Failed to decrypt data - invalid key or corrupted data');
    }
  }

  /**
   * Create a masked version of a value for display
   * Shows only the last 4 characters
   *
   * @param value - The value to mask
   * @returns Masked string (e.g., '****abc123')
   */
  maskValue(value: string): string {
    if (!value || value.length < 4) {
      return '****';
    }

    const visibleChars = Math.min(4, value.length);
    const lastChars = value.slice(-visibleChars);
    return '****' + lastChars;
  }

  /**
   * Rotate encryption for a value (re-encrypt with new IV)
   * Useful for periodic key rotation without changing the master key
   *
   * @param encryptedValue - Current encrypted value
   * @param iv - Current IV
   * @param tag - Current auth tag
   * @returns New encrypted data with new IV
   */
  rotateEncryption(
    encryptedValue: string,
    iv: string,
    tag: string,
  ): {
    encryptedValue: string;
    iv: string;
    tag: string;
  } {
    try {
      // Decrypt with old IV
      const plaintext = this.decrypt(encryptedValue, iv, tag);

      // Re-encrypt with new IV
      return this.encrypt(plaintext);
    } catch (error: any) {
      this.logger.error(`Key rotation failed: ${error.message}`);
      throw new Error('Failed to rotate encryption');
    }
  }

  /**
   * Validate that a master key has the correct format and length
   * Useful for testing and validation
   *
   * @param key - The key to validate (hex or base64 string)
   * @returns True if valid, false otherwise
   */
  static validateMasterKey(key: string): boolean {
    try {
      let buffer = Buffer.from(key, 'hex');
      if (buffer.length !== 32) {
        buffer = Buffer.from(key, 'base64');
      }
      return buffer.length === 32;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new random master key
   * Use this to generate a new TOOL_KEY_ENCRYPTION_MASTER value
   *
   * @returns Hex-encoded 256-bit key
   */
  static generateMasterKey(): string {
    return randomBytes(32).toString('hex');
  }
}

// Provider for dependency injection
export const EncryptionServiceProvider = {
  provide: EncryptionService,
  useClass: EncryptionService,
};
