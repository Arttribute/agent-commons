import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, gt, gte, isNull, lte } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit/credit.service';

/**
 * Periodic maintenance for exact FIFO credit expiry and expired distributed
 * rate-limit buckets.
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
    const everyMs = Number(
      process.env.BILLING_SWEEPER_INTERVAL_MS || 3_600_000,
    );
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
        remainingAmount: schema.creditLedgerEntry.remainingAmount,
      })
      .from(schema.creditLedgerEntry)
      .where(
        and(
          gt(schema.creditLedgerEntry.remainingAmount, 0),
          isNull(schema.creditLedgerEntry.voidedAt),
          lte(schema.creditLedgerEntry.expiresAt, now),
          gte(schema.creditLedgerEntry.expiresAt, windowStart),
        ),
      )
      .limit(500);

    let expired = 0;
    for (const grant of grants) {
      const entry = await this.credits.expireGrant(grant.entryId);
      if (entry) expired += 1;
    }
    if (expired) this.logger.log(`Expired ${expired} matured grant(s)`);
    await this.db
      .delete(schema.apiRateLimitBucket)
      .where(lte(schema.apiRateLimitBucket.expiresAt, now));
    return expired;
  }
}
