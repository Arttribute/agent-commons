/**
 * Type definitions for encryption module
 */

/**
 * Encrypted data structure stored in database
 */
export interface EncryptedData {
  encryptedValue: string; // Hex-encoded encrypted data
  iv: string; // Hex-encoded initialization vector
  tag: string; // Hex-encoded authentication tag
}

/**
 * Decrypted key data (in-memory only, never persisted)
 */
export interface DecryptedKey {
  keyId: string;
  keyName: string;
  value: string; // The actual plaintext key value
  toolId?: string;
  ownerId: string;
  ownerType: 'user' | 'agent';
}

/**
 * Key management operation result
 */
export interface KeyOperationResult {
  success: boolean;
  keyId?: string;
  maskedValue?: string;
  error?: string;
}
