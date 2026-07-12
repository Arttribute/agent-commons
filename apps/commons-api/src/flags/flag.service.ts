import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { EntitlementsService } from '~/billing/entitlements.service';

export interface FlagPrincipal {
  principalId: string;
  workspaceId?: string | null;
}

export interface FlagEvaluation {
  key: string;
  enabled: boolean;
  variant: string | null;
  payload?: unknown;
}

type FlagRow = typeof schema.featureFlag.$inferSelect;

/**
 * In-house feature-flag evaluation with stable, deterministic bucketing.
 *
 * Assignment is `sha256(salt + ':' + principalId) % 10000`, so a given
 * principal always lands in the same bucket for a flag across devices and
 * reloads — the basis for percentage rollouts and A/B variant splits. Flags may
 * hide/show experimental UI, but they never gate paid features: EntitlementsService
 * remains the only authority for billing.
 */
@Injectable()
export class FlagService {
  private readonly logger = new Logger(FlagService.name);
  private cache: { flags: FlagRow[]; expires: number } | null = null;
  private readonly ttlMs = 30_000;

  constructor(
    private readonly db: DatabaseService,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async allFlags(): Promise<FlagRow[]> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.flags;
    const flags = await this.db.query.featureFlag.findMany();
    this.cache = { flags, expires: Date.now() + this.ttlMs };
    return flags;
  }

  invalidate() {
    this.cache = null;
  }

  private bucket(salt: string, principalId: string): number {
    const hash = createHash('sha256')
      .update(`${salt}:${principalId}`)
      .digest();
    // First 4 bytes → uint32 → 0..9999
    const n = hash.readUInt32BE(0);
    return n % 10000;
  }

  /** Evaluate a single flag for a principal, recording first exposure. */
  async evaluate(
    key: string,
    principal: FlagPrincipal,
  ): Promise<FlagEvaluation> {
    const flags = await this.allFlags();
    const flag = flags.find((f) => f.flagKey === key && !f.archivedAt);
    if (!flag) return { key, enabled: false, variant: null };
    return this.evaluateFlag(flag, principal);
  }

  /** Evaluate all active flags for a principal. */
  async evaluateAll(
    principal: FlagPrincipal,
  ): Promise<Record<string, FlagEvaluation>> {
    const flags = await this.allFlags();
    const out: Record<string, FlagEvaluation> = {};
    for (const flag of flags) {
      if (flag.archivedAt) continue;
      out[flag.flagKey] = await this.evaluateFlag(flag, principal);
    }
    return out;
  }

  private async evaluateFlag(
    flag: FlagRow,
    principal: FlagPrincipal,
  ): Promise<FlagEvaluation> {
    const result = await this.computeAssignment(flag, principal);
    if (result.enabled) {
      // Record first exposure (insert-ignore) for A/B analysis.
      void this.recordExposure(flag.flagKey, principal, result.variant);
    }
    return { key: flag.flagKey, ...result };
  }

  private async computeAssignment(
    flag: FlagRow,
    principal: FlagPrincipal,
  ): Promise<{ enabled: boolean; variant: string | null; payload?: unknown }> {
    // 1. Explicit overrides win.
    const override = await this.findOverride(flag.flagKey, principal);
    if (override) {
      if (override.enabled === false) return { enabled: false, variant: null };
      if (override.variantKey) {
        const v = flag.variants?.find((x) => x.key === override.variantKey);
        return { enabled: true, variant: override.variantKey, payload: v?.payload };
      }
      return { enabled: true, variant: null };
    }

    if (!flag.enabled) return { enabled: false, variant: null };

    const targeting = flag.targeting ?? {};
    const pid = principal.principalId;
    if (targeting.denyPrincipalIds?.includes(pid)) {
      return { enabled: false, variant: null };
    }
    // Allow-lists force inclusion (bypass the rollout percentage).
    let forcedIn = false;
    if (targeting.allowPrincipalIds?.includes(pid)) forcedIn = true;
    if (
      principal.workspaceId &&
      targeting.allowWorkspaceIds?.includes(principal.workspaceId)
    ) {
      forcedIn = true;
    }
    if (targeting.allowPlanKeys?.length) {
      const plan = await this.entitlements.getPlan(pid);
      if (targeting.allowPlanKeys.includes(plan.key)) forcedIn = true;
    }

    const salt = flag.salt || flag.flagKey;
    const bucket = this.bucket(salt, pid);

    if (!forcedIn) {
      const threshold = Math.round((flag.rolloutPercentage / 100) * 10000);
      if (bucket >= threshold) return { enabled: false, variant: null };
    }

    // Variant selection for multivariate flags, weighted + stable.
    if (flag.flagType === 'multivariate' && flag.variants?.length) {
      const variant = this.pickVariant(flag.variants, salt, pid);
      return {
        enabled: true,
        variant: variant.key,
        payload: variant.payload,
      };
    }
    return { enabled: true, variant: null };
  }

  private pickVariant(
    variants: Array<{ key: string; weight: number; payload?: unknown }>,
    salt: string,
    principalId: string,
  ): { key: string; payload?: unknown } {
    const totalWeight = variants.reduce((s, v) => s + Math.max(0, v.weight), 0);
    if (totalWeight <= 0) return variants[0];
    // Separate bucket space for variant selection so it's independent of rollout.
    const b = this.bucket(`${salt}:variant`, principalId) % 10000;
    const scaled = (b / 10000) * totalWeight;
    let acc = 0;
    for (const v of variants) {
      acc += Math.max(0, v.weight);
      if (scaled < acc) return v;
    }
    return variants[variants.length - 1];
  }

  private async findOverride(flagKey: string, principal: FlagPrincipal) {
    const rows = await this.db.query.flagOverride.findMany({
      where: eq(schema.flagOverride.flagKey, flagKey),
    });
    return (
      rows.find(
        (r) =>
          r.subjectType === 'user' && r.subjectId === principal.principalId,
      ) ??
      (principal.workspaceId
        ? rows.find(
            (r) =>
              r.subjectType === 'workspace' &&
              r.subjectId === principal.workspaceId,
          )
        : undefined)
    );
  }

  private async recordExposure(
    flagKey: string,
    principal: FlagPrincipal,
    variant: string | null,
  ) {
    try {
      await this.db
        .insert(schema.flagExposure)
        .values({
          flagKey,
          principalId: principal.principalId,
          workspaceId: principal.workspaceId ?? null,
          variantKey: variant,
        })
        .onConflictDoNothing({
          target: [
            schema.flagExposure.flagKey,
            schema.flagExposure.principalId,
          ],
        });
    } catch (err: any) {
      this.logger.debug(`exposure record failed: ${err.message}`);
    }
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  async list() {
    return this.db.query.featureFlag.findMany();
  }

  async upsert(input: Partial<FlagRow> & { flagKey: string }) {
    const values = { ...input, updatedAt: new Date() };
    await this.db
      .insert(schema.featureFlag)
      .values(values as any)
      .onConflictDoUpdate({
        target: schema.featureFlag.flagKey,
        set: values as any,
      });
    this.invalidate();
    return this.db.query.featureFlag.findFirst({
      where: eq(schema.featureFlag.flagKey, input.flagKey),
    });
  }

  async setOverride(input: {
    flagKey: string;
    subjectType: 'user' | 'workspace';
    subjectId: string;
    variantKey?: string | null;
    enabled?: boolean | null;
  }) {
    await this.db
      .insert(schema.flagOverride)
      .values(input as any)
      .onConflictDoUpdate({
        target: [
          schema.flagOverride.flagKey,
          schema.flagOverride.subjectType,
          schema.flagOverride.subjectId,
        ],
        set: {
          variantKey: input.variantKey ?? null,
          enabled: input.enabled ?? null,
        },
      });
    this.invalidate();
  }

  async archive(flagKey: string) {
    await this.db
      .update(schema.featureFlag)
      .set({ archivedAt: new Date(), enabled: false })
      .where(eq(schema.featureFlag.flagKey, flagKey));
    this.invalidate();
  }
}
