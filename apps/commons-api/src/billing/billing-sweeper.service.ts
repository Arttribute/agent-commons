import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, gte, isNull, lte, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit/credit.service';

/**
 * Periodic credit maintenance: expire granted credits whose expiresAt has
 * passed. Credits are a pooled, signed ledger (balance = sum of amounts), so
 * "expiring" a grant records an offsetting 'expiration' entry that removes the
 * still-unused value — capped at the principal's current positive balance so it
 * never drives the balance negative, and keyed on the grant id so it runs once.
 *
 * A grant that was fully consumed before it expired has nothing to reclaim; we
 * simply skip it. The scan is bounded to a recent window so consumed grants
 * age out instead of being re-scanned forever.
 *
 * Free-tier monthly grants are issued lazily on balance read by CreditService
 * consumers, not here.
 */
@Injectable()
export class BillingSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingSweeperService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DatabaseService,
    private readonly credits: CreditService,
  ) {}

  onModuleInit() {
    if (process.env.BILLING_SWEEPER_ENABLED === 'false') return;
    const everyMs = Number(process.env.BILLING_SWEEPER_INTERVAL_MS || 3_600_000);
    this.timer = setInterval(
      () =>
        this.sweepExpirations().catch((err) =>
          this.logger.error(`Expiration sweep failed: ${err.message}`),
        ),
      everyMs,
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweepExpirations(): Promise<number> {
    const now = new Date();
    // Only look at grants that expired within the recent window; older consumed
    // grants age out of the scan (already-reclaimed ones are skipped by the
    // idempotency check regardless).
    const windowDays = Number(process.env.CREDIT_EXPIRY_SCAN_WINDOW_DAYS || 14);
    const windowStart = new Date(now.getTime() - windowDays * 86400_000);

    const grants = await this.db
      .select({
        entryId: schema.creditLedgerEntry.entryId,
        principalId: schema.creditLedgerEntry.principalId,
        workspaceId: schema.creditLedgerEntry.workspaceId,
        amount: schema.creditLedgerEntry.amount,
      })
      .from(schema.creditLedgerEntry)
      .where(
        and(
          sql`${schema.creditLedgerEntry.amount} > 0`,
          isNull(schema.creditLedgerEntry.voidedAt),
          lte(schema.creditLedgerEntry.expiresAt, now),
          gte(schema.creditLedgerEntry.expiresAt, windowStart),
        ),
      )
      .limit(500);

    let expired = 0;
    for (const grant of grants) {
      const idempotencyKey = `expire:${grant.entryId}`;
      const already = await this.db.query.creditLedgerEntry.findFirst({
        where: (t) => sql`${t.idempotencyKey} = ${idempotencyKey}`,
      });
      if (already) continue;

      const balance = await this.credits.getBalance({
        principalId: grant.principalId,
        workspaceId: grant.workspaceId,
      });
      const removable = Math.min(grant.amount, Math.max(0, balance.balance));
      if (removable <= 0) continue; // fully consumed — nothing to reclaim

      await this.credits.record({
        principalId: grant.principalId,
        principalType: 'user',
        workspaceId: grant.workspaceId,
        amount: removable,
        direction: 'expiration',
        eventType: 'credit_expiration',
        sourcePlatform: 'system',
        idempotencyKey,
        description: 'Expired credits',
        metadata: { grantEntryId: grant.entryId },
        createdBy: 'sweeper',
      });
      expired += 1;
    }
    if (expired) this.logger.log(`Expired ${expired} matured grant(s)`);
    return expired;
  }
}
