import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import {
  DEFAULT_PLAN,
  PLANS,
  Plan,
  PlanEntitlements,
  PlanKey,
  planFromKey,
} from './plan-catalog';

/**
 * Resolves a principal's current plan + entitlements from their subscription
 * row. This is the single authority for what paid features a caller may use —
 * feature flags never gate billing. Cached briefly to avoid a DB hit on every
 * gate check.
 */
@Injectable()
export class EntitlementsService {
  private readonly cache = new Map<
    string,
    { plan: Plan; expires: number }
  >();
  private readonly ttlMs = 60_000;

  constructor(private readonly db: DatabaseService) {}

  /** Statuses that keep paid entitlements active. */
  private static readonly ACTIVE_STATUSES = new Set([
    'active',
    'trialing',
  ]);

  async getPlan(principalId: string): Promise<Plan> {
    const cached = this.cache.get(principalId);
    if (cached && cached.expires > Date.now()) return cached.plan;

    const plan = await this.resolvePlan(principalId);
    this.cache.set(principalId, { plan, expires: Date.now() + this.ttlMs });
    return plan;
  }

  async getEntitlements(principalId: string): Promise<PlanEntitlements> {
    return (await this.getPlan(principalId)).entitlements;
  }

  /** Invalidate the cache for a principal (called after webhook updates). */
  invalidate(principalId: string): void {
    this.cache.delete(principalId);
  }

  private async resolvePlan(principalId: string): Promise<Plan> {
    const rows = await this.db.query.subscription.findMany({
      where: eq(schema.subscription.principalId, principalId),
      orderBy: desc(schema.subscription.updatedAt),
    });
    const active = rows.find((r) =>
      EntitlementsService.ACTIVE_STATUSES.has(r.status),
    );
    // past_due keeps access during the grace window before dropping to free.
    const pastDue = rows.find((r) => r.status === 'past_due');
    const chosen = active ?? pastDue;
    if (!chosen) return PLANS[DEFAULT_PLAN];

    if (
      chosen.status === 'past_due' &&
      chosen.currentPeriodEnd &&
      this.pastGrace(chosen.currentPeriodEnd)
    ) {
      return PLANS[DEFAULT_PLAN];
    }
    return planFromKey(chosen.planKey as PlanKey);
  }

  private pastGrace(periodEnd: Date): boolean {
    const graceDays = Number(process.env.PAST_DUE_GRACE_DAYS || 5);
    return Date.now() > periodEnd.getTime() + graceDays * 86400_000;
  }
}
