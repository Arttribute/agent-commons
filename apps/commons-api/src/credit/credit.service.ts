import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import type { CreditBalance, CreditLedgerInput } from './credit.types';

type DbLike = DatabaseService;

@Injectable()
export class CreditService {
  constructor(private readonly db: DatabaseService) {}

  async getBalance(input: {
    principalId: string;
    workspaceId?: string | null;
  }): Promise<CreditBalance> {
    return this.getBalanceWithDb(this.db, input);
  }

  async listEntries(input: {
    principalId: string;
    workspaceId?: string | null;
    limit?: number;
  }) {
    const conditions = [
      eq(schema.creditLedgerEntry.principalId, input.principalId),
      isNull(schema.creditLedgerEntry.voidedAt),
    ];
    if (input.workspaceId !== undefined) {
      conditions.push(
        input.workspaceId === null
          ? isNull(schema.creditLedgerEntry.workspaceId)
          : eq(schema.creditLedgerEntry.workspaceId, input.workspaceId),
      );
    }
    return this.db.query.creditLedgerEntry.findMany({
      where: and(...conditions),
      orderBy: desc(schema.creditLedgerEntry.createdAt),
      limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });
  }

  async record(input: CreditLedgerInput & { allowNegative?: boolean }) {
    const normalized = this.normalizeInput(input);
    return this.db.transaction(async (tx) => {
      const existing = await tx.query.creditLedgerEntry.findFirst({
        where: eq(
          schema.creditLedgerEntry.idempotencyKey,
          normalized.idempotencyKey,
        ),
      });
      if (existing) return existing;

      // allowNegative lets a caller (e.g. compute-use grace metering) debit
      // past zero within its own bounded policy without flipping the global
      // CREDIT_ALLOW_NEGATIVE_BALANCE flag.
      if (
        normalized.amount < 0 &&
        !input.allowNegative &&
        !this.allowNegativeBalances()
      ) {
        const balance = await this.getBalanceWithDb(tx as DbLike, {
          principalId: normalized.principalId,
          workspaceId: normalized.workspaceId,
        });
        if (balance.balance + normalized.amount < 0) {
          throw new HttpException({
            message: 'Insufficient credits.',
            balance: balance.balance,
            attemptedDebit: Math.abs(normalized.amount),
          }, HttpStatus.PAYMENT_REQUIRED);
        }
      }

      const [entry] = await tx
        .insert(schema.creditLedgerEntry)
        .values(normalized)
        .returning();
      return entry;
    });
  }

  async grant(input: Omit<CreditLedgerInput, 'direction'>) {
    return this.record({ ...input, direction: 'grant' });
  }

  async debit(input: Omit<CreditLedgerInput, 'direction'>) {
    return this.record({ ...input, direction: 'debit' });
  }

  creditsForUsd(costUsd: number) {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
    const rate = Number(process.env.CREDIT_UNITS_PER_USD || 1000);
    return Math.max(1, Math.ceil(costUsd * rate));
  }

  private async getBalanceWithDb(
    db: DbLike,
    input: { principalId: string; workspaceId?: string | null },
  ): Promise<CreditBalance> {
    const conditions = [
      eq(schema.creditLedgerEntry.principalId, input.principalId),
      isNull(schema.creditLedgerEntry.voidedAt),
    ];
    if (input.workspaceId !== undefined) {
      conditions.push(
        input.workspaceId === null
          ? isNull(schema.creditLedgerEntry.workspaceId)
          : eq(schema.creditLedgerEntry.workspaceId, input.workspaceId),
      );
    }
    const [row] = await db
      .select({
        balance: sql<number>`coalesce(sum(${schema.creditLedgerEntry.amount}), 0)`,
      })
      .from(schema.creditLedgerEntry)
      .where(and(...conditions));
    return {
      principalId: input.principalId,
      workspaceId: input.workspaceId,
      balance: Number(row?.balance ?? 0),
      currency: 'credits',
    };
  }

  private normalizeInput(input: CreditLedgerInput) {
    const principalId = input.principalId?.trim();
    const eventType = input.eventType?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!principalId) throw new BadRequestException('principalId is required.');
    if (!eventType) throw new BadRequestException('eventType is required.');
    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required.');
    }
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('amount must be a positive integer.');
    }
    const sign =
      input.direction === 'debit' || input.direction === 'expiration' ? -1 : 1;
    return {
      principalId,
      principalType: input.principalType ?? 'user',
      workspaceId: input.workspaceId ?? null,
      amount: input.amount * sign,
      direction: input.direction,
      eventType,
      sourcePlatform: input.sourcePlatform,
      idempotencyKey,
      description: input.description?.trim() || null,
      relatedCourseId: input.relatedCourseId ?? null,
      relatedChallengeId: input.relatedChallengeId ?? null,
      agentId: input.agentId ?? null,
      sessionId: input.sessionId ?? null,
      taskId: input.taskId ?? null,
      workflowId: input.workflowId ?? null,
      usageEventId: input.usageEventId ?? null,
      metadata: input.metadata ?? {},
      createdBy: input.createdBy ?? null,
      createdByType: input.createdByType ?? 'service',
      expiresAt: input.expiresAt,
    };
  }

  private allowNegativeBalances() {
    return process.env.CREDIT_ALLOW_NEGATIVE_BALANCE === 'true';
  }
}
