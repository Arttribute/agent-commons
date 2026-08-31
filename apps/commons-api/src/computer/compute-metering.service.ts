import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit/credit.service';
import { creditsPerMinute } from '~/billing/compute-pricing';
import { ComputerService } from './computer.service';

/**
 * Meters running computers by the minute and debits credits.
 *
 * Runs on every API task; a `SELECT ... FOR UPDATE SKIP LOCKED` ensures that
 * with multiple tasks each running instance is metered by exactly one task per
 * tick, so a minute is never double-billed. Debits are additionally idempotent
 * on `compute:<computerId>:<intervalStartISO>`.
 *
 * When a debit would exceed the available balance we bill only whole minutes
 * already covered, then stop the runtime. No negative-balance grace is used.
 */
@Injectable()
export class ComputeMeteringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ComputeMeteringService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DatabaseService,
    private readonly credits: CreditService,
    private readonly computers: ComputerService,
  ) {}

  onModuleInit() {
    if (process.env.COMPUTE_METERING_ENABLED === 'false') return;
    const everyMs = Number(process.env.COMPUTE_METERING_INTERVAL_MS || 60_000);
    this.timer = setInterval(
      () =>
        this.tick().catch((err) =>
          this.logger.error(`Metering tick failed: ${err.message}`),
        ),
      everyMs,
    );
    if (typeof this.timer.unref === 'function') this.timer.unref();
    this.logger.log('Compute metering enabled');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Meter every running instance that has at least one full minute unbilled. */
  async tick(): Promise<void> {
    const now = new Date();
    const dueBefore = new Date(now.getTime() - 60_000).toISOString();
    // Claim due instances with a row lock so concurrent API tasks don't
    // double-bill. minute boundary: metered_through_at (or started_at) + 60s.
    const due = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({
          computerId: schema.agentComputerInstance.computerId,
          agentId: schema.agentComputerInstance.agentId,
          status: schema.agentComputerInstance.status,
          ownerUserId: schema.agentComputerInstance.ownerUserId,
          workspaceId: schema.agentComputerInstance.workspaceId,
          resourceProfile: schema.agentComputerInstance.resourceProfile,
          startedAt: schema.agentComputerInstance.startedAt,
          meteredThroughAt: schema.agentComputerInstance.meteredThroughAt,
          metadata: schema.agentComputerInstance.metadata,
        })
        .from(schema.agentComputerInstance)
        .where(
          and(
            eq(schema.agentComputerInstance.canonical, true),
            inArray(schema.agentComputerInstance.status, [
              'running',
              'idle',
              'stopping',
            ]),
            sql`coalesce(${schema.agentComputerInstance.meteredThroughAt}, ${schema.agentComputerInstance.startedAt}) <= ${dueBefore}::timestamptz`,
          ),
        )
        .limit(200)
        .for('update', { skipLocked: true });
      return rows;
    });

    for (const inst of due) {
      try {
        await this.meterInstance(inst, now);
      } catch (err: any) {
        this.logger.error(
          `Failed to meter computer ${inst.computerId}: ${err.message}`,
        );
      }
    }
  }

  private async meterInstance(inst: any, now: Date): Promise<void> {
    // A prior zero-credit stop request failed remotely. Keep retrying the stop
    // without charging another minute or treating the runtime as usable.
    if (inst.status === 'stopping') {
      if (inst.ownerUserId) {
        await this.handleExhausted(inst, inst.ownerUserId);
      }
      return;
    }
    const cursor: Date = inst.meteredThroughAt ?? inst.startedAt;
    if (!cursor) return; // never started — nothing to meter
    const elapsedMs = now.getTime() - new Date(cursor).getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);
    if (elapsedMinutes <= 0) return;

    // Metering normally runs every minute. A much older cursor indicates a
    // lifecycle discontinuity or an extended metering outage; blindly billing
    // the entire gap can charge sleeping time and empty a user's account in a
    // single tick. Bound catch-up and rebase the cursor to now so the same gap
    // cannot be charged repeatedly on subsequent ticks.
    const maxCatchUpMinutes = this.maxCatchUpMinutes();
    const rebased = elapsedMinutes > maxCatchUpMinutes;
    let minutes = Math.min(elapsedMinutes, maxCatchUpMinutes);
    let intervalStart = rebased
      ? new Date(now.getTime() - minutes * 60_000)
      : new Date(cursor);
    let intervalEnd = rebased
      ? now
      : new Date(new Date(cursor).getTime() + minutes * 60_000);
    if (rebased) {
      this.logger.warn(
        `Capping computer ${inst.computerId} catch-up from ${elapsedMinutes} to ${minutes} minutes`,
      );
    }
    const perMin = creditsPerMinute(inst.resourceProfile);
    const principalId = inst.ownerUserId;
    if (!principalId) {
      // No billable owner (legacy/unowned) — advance cursor without charge.
      await this.advanceCursor(inst.computerId, intervalEnd);
      return;
    }

    // Keep the persisted cursor in the key even when the displayed/billed
    // interval is rebased. Concurrent API tasks that observe the same stale
    // cursor must still converge on one ledger debit.
    const idempotencyKey = `compute:${inst.computerId}:${new Date(cursor).toISOString()}`;
    const balance = await this.credits.getBalance({
      principalId,
    });
    const affordableMinutes = Math.floor(balance.available / perMin);
    if (affordableMinutes <= 0) {
      await this.handleExhausted(inst, principalId);
      return;
    }
    const exhaustedAfterCharge = affordableMinutes < minutes;
    minutes = Math.min(minutes, affordableMinutes);
    if (rebased) {
      intervalStart = new Date(now.getTime() - minutes * 60_000);
      intervalEnd = now;
    } else {
      intervalEnd = new Date(new Date(cursor).getTime() + minutes * 60_000);
    }
    const charge = perMin * minutes;

    const entry: any = await this.credits.record({
      principalId,
      principalType: 'user',
      workspaceId: inst.workspaceId,
      amount: charge,
      direction: 'debit',
      eventType: 'computer_use',
      sourcePlatform: 'agent_commons',
      idempotencyKey,
      description: `Computer use (${inst.resourceProfile}) ${minutes}m`,
      agentId: inst.agentId,
      metadata: {
        computerId: inst.computerId,
        minutes,
        perMin,
        ...(rebased ? { catchUpCappedFromMinutes: elapsedMinutes } : undefined),
      },
      createdBy: 'metering',
    });

    await this.db
      .insert(schema.computeUsageEvent)
      .values({
        computerId: inst.computerId,
        agentId: inst.agentId,
        principalId,
        workspaceId: inst.workspaceId,
        resourceProfile: inst.resourceProfile,
        intervalStart,
        intervalEnd,
        minutes,
        creditsCharged: charge,
        creditEntryId: entry?.entryId ?? null,
      })
      .onConflictDoNothing({
        target: [
          schema.computeUsageEvent.computerId,
          schema.computeUsageEvent.intervalStart,
        ],
      });

    await this.advanceCursor(inst.computerId, intervalEnd);

    if (exhaustedAfterCharge) await this.handleExhausted(inst, principalId);
  }

  private maxCatchUpMinutes(): number {
    const configured = Number(process.env.COMPUTE_MAX_CATCH_UP_MINUTES ?? 10);
    if (!Number.isFinite(configured)) return 10;
    return Math.min(Math.max(Math.floor(configured), 1), 60);
  }

  private async advanceCursor(computerId: string, through: Date) {
    await this.db
      .update(schema.agentComputerInstance)
      .set({ meteredThroughAt: through, updatedAt: new Date() })
      .where(eq(schema.agentComputerInstance.computerId, computerId));
  }

  private async handleExhausted(inst: any, principalId: string) {
    this.logger.warn(
      `Auto-stopping computer ${inst.computerId} — credits exhausted for ${principalId}`,
    );
    try {
      await this.computers.stopComputer({
        agentId: inst.agentId,
        computerId: inst.computerId,
        actorType: 'service',
      });
    } catch (err: any) {
      this.logger.error(
        `Auto-stop failed for ${inst.computerId}: ${err.message}`,
      );
    }
  }
}
