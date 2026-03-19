import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import * as schema from '#/models/schema';

export type PrincipalType = 'user' | 'agent';

export interface ApiKeyPrincipal {
  principalId: string;
  principalType: PrincipalType;
}

type ApiKeyRecord = typeof schema.apiKey.$inferSelect;

@Injectable()
export class ApiKeyService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Generate a new key, store its SHA-256 hash, return the plaintext key ONCE.
   */
  async generate(
    principalId: string,
    principalType: PrincipalType,
    label?: string,
  ): Promise<{ key: string; record: ApiKeyRecord }> {
    const rawKey = `sk-ac-${crypto.randomBytes(16).toString('hex')}`;
    const keyHash = this.hash(rawKey);

    const [record] = await this.db
      .insert(schema.apiKey)
      .values({ keyHash, principalId, principalType, label: label ?? null })
      .returning();

    return { key: rawKey, record };
  }

  /**
   * Validate a raw bearer token. Returns the principal on success, null on failure.
   * Updates last_used_at as a fire-and-forget side effect.
   */
  async validate(rawKey: string): Promise<ApiKeyPrincipal | null> {
    const keyHash = this.hash(rawKey);

    const record = await this.db.query.apiKey.findFirst({
      where: (k) => and(eq(k.keyHash, keyHash), eq(k.active, true)),
    });

    if (!record) return null;

    // Fire-and-forget — don't block the request on this update
    this.db
      .update(schema.apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKey.id, record.id))
      .catch(() => {});

    return {
      principalId: record.principalId,
      principalType: record.principalType as PrincipalType,
    };
  }

  /**
   * List all active keys for a principal. Key hashes are never returned.
   */
  async list(principalId: string, principalType: PrincipalType): Promise<Omit<ApiKeyRecord, 'keyHash'>[]> {
    const rows = await this.db.query.apiKey.findMany({
      where: (k) =>
        and(
          eq(k.principalId, principalId),
          eq(k.principalType, principalType),
          eq(k.active, true),
        ),
    });

    return rows.map(({ keyHash: _omit, ...rest }) => rest);
  }

  /**
   * Soft-delete (deactivate) a key by its UUID.
   */
  async revoke(id: string): Promise<void> {
    await this.db
      .update(schema.apiKey)
      .set({ active: false })
      .where(eq(schema.apiKey.id, id));
  }

  private hash(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }
}
