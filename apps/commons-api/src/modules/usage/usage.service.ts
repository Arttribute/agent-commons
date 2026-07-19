import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InferInsertModel } from 'drizzle-orm';
import { and, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit';
import { EntitlementsService } from '~/billing/entitlements.service';
import { getModelInfo } from '~/modules/model-provider/model-registry';

type InsertUsageEvent = InferInsertModel<typeof schema.usageEvent>;

@Injectable()
export class UsageService {
  constructor(
    private db: DatabaseService,
    private credits: CreditService,
    private entitlements: EntitlementsService,
  ) {}

  /** Record a single LLM-call usage event. */
  async record(
    event: Omit<InsertUsageEvent, 'eventId' | 'createdAt'> & {
      creditReservationId?: string;
    },
  ) {
    const { creditReservationId, ...usageEvent } = event;
    const [row] = await this.db
      .insert(schema.usageEvent)
      .values(usageEvent)
      .returning();
    await this.debitCreditsForUsage(row, creditReservationId);
    return row;
  }

  async authorizeAgentRun(input: {
    principalId: string;
    workspaceId?: string | null;
    agentId: string;
    sessionId?: string;
    traceId: string;
    provider: string;
    modelId: string;
    isByok: boolean;
  }) {
    if (process.env.CREDIT_DEBITS_ENABLED === 'false') return null;
    const entitlements = await this.entitlements.getEntitlements(
      input.principalId,
    );
    const model = getModelInfo(input.provider as any, input.modelId);
    if (!model && !input.isByok) {
      throw new HttpException(
        {
          code: 'unpriced_model',
          message:
            'This managed model is not available until its usage price is configured.',
          modelId: input.modelId,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    if (model && !entitlements.modelTiers.includes(model.tier)) {
      throw new HttpException(
        {
          code: 'upgrade_required',
          feature: 'model_tier',
          message: `The ${model.displayName} model is not included in your plan.`,
          tier: model.tier,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return this.credits.reserve({
      principalId: input.principalId,
      amount: Number(process.env.AGENT_RUN_RESERVATION_CREDITS || 1),
      purpose: 'agent_run',
      idempotencyKey: `agent-run:${input.traceId}`,
      agentId: input.agentId,
      sessionId: input.sessionId,
      ttlSeconds: Number(process.env.AGENT_RUN_RESERVATION_TTL_SECONDS || 3600),
      maxActive: entitlements.maxConcurrentRuns,
      metadata: { traceId: input.traceId, workspaceId: input.workspaceId },
    });
  }

  /**
   * Pre-authorize the worst-case cost of the next managed model call. LangChain
   * invokes this from handleLLMStart before the provider request is sent.
   */
  async authorizeModelCall(input: {
    reservationId?: string | null;
    provider: string;
    modelId: string;
    prompts: string[];
    maxOutputTokens?: number;
    isByok: boolean;
  }) {
    if (!input.reservationId || input.isByok) return null;
    const model = getModelInfo(input.provider as any, input.modelId);
    if (!model) {
      throw new HttpException(
        { code: 'unpriced_model', message: 'This model has no usage price.' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const promptCharacters = input.prompts.reduce(
      (sum, prompt) => sum + String(prompt).length,
      0,
    );
    const estimatedInputTokens = Math.max(1, Math.ceil(promptCharacters / 4));
    const maxOutputTokens = Math.max(
      1,
      Math.min(input.maxOutputTokens ?? 2000, model.contextWindow),
    );
    const worstCaseUsd =
      (estimatedInputTokens / 1000) * model.inputPricePer1kTokens +
      (maxOutputTokens / 1000) * model.outputPricePer1kTokens;
    const required = Math.max(1, this.credits.creditsForUsd(worstCaseUsd));
    return this.credits.ensureReservationCapacity(
      input.reservationId,
      required,
    );
  }

  async finalizeAgentRun(reservationId?: string | null) {
    if (!reservationId) return null;
    return this.credits.finalizeReservation(
      reservationId,
      Number(process.env.AGENT_RUN_MINIMUM_CREDITS || 1),
    );
  }

  /**
   * Pre-authorize a paid platform capability before contacting its provider.
   * Provider-specific callers calculate the smallest defensible cost estimate
   * from the requested units (images, characters, minutes, or calls).
   */
  async authorizeCapability(input: {
    principalId: string;
    capability: string;
    estimatedCostUsd: number;
    idempotencyKey: string;
    agentId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (process.env.CREDIT_DEBITS_ENABLED === 'false') return null;
    const amount = this.capabilityCredits(
      input.capability,
      input.estimatedCostUsd,
    );
    return this.credits.reserve({
      principalId: input.principalId,
      amount,
      purpose: `capability:${input.capability}`,
      idempotencyKey: input.idempotencyKey,
      agentId: input.agentId,
      sessionId: input.sessionId,
      ttlSeconds: 600,
      metadata: {
        capability: input.capability,
        estimatedCostUsd: input.estimatedCostUsd,
        ...input.metadata,
      },
    });
  }

  async settleCapability(input: {
    reservationId?: string | null;
    capability: string;
    actualCostUsd: number;
    idempotencyKey: string;
    agentId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) {
    if (!input.reservationId) return null;
    try {
      const amount = this.capabilityCredits(
        input.capability,
        input.actualCostUsd,
      );
      const entry = await this.credits.captureReservation({
        reservationId: input.reservationId,
        amount,
        eventType: `capability_${input.capability}`,
        sourcePlatform: 'agent_commons',
        idempotencyKey: input.idempotencyKey,
        description: `${input.capability.replaceAll('_', ' ')} usage`,
        agentId: input.agentId,
        sessionId: input.sessionId,
        metadata: {
          capability: input.capability,
          actualCostUsd: input.actualCostUsd,
          ...input.metadata,
        },
      });
      return entry;
    } finally {
      await this.credits.finalizeReservation(input.reservationId);
    }
  }

  async releaseCapability(reservationId?: string | null) {
    if (!reservationId) return null;
    return this.credits.finalizeReservation(reservationId);
  }

  private capabilityCredits(capability: string, costUsd: number) {
    const amount = this.credits.creditsForUsd(costUsd);
    if (
      !Number.isFinite(costUsd) ||
      costUsd <= 0 ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new HttpException(
        {
          code: 'capability_price_unavailable',
          capability,
          message: 'This capability is temporarily unavailable.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return amount;
  }

  private async debitCreditsForUsage(
    event: typeof schema.usageEvent.$inferSelect,
    reservationId?: string,
  ) {
    if (process.env.CREDIT_DEBITS_ENABLED === 'false') return;
    if (event.isByok) return;

    const creditAmount = this.credits.creditsForUsd(Number(event.costUsd || 0));
    if (creditAmount <= 0) return;

    const usageAgent = await this.db.query.agent.findFirst({
      where: eq(schema.agent.agentId, event.agentId),
    });
    const ownerId = usageAgent?.ownerUserId || usageAgent?.owner;
    if (!ownerId) return;

    const debit = {
      principalId: ownerId,
      principalType: 'user',
      workspaceId: usageAgent?.workspaceId ?? null,
      amount: creditAmount,
      eventType: 'agent_run_usage',
      sourcePlatform: 'agent_commons',
      idempotencyKey: `usage:${event.eventId}`,
      description: `Agent usage for ${event.modelId}`,
      agentId: event.agentId,
      sessionId: event.sessionId ?? undefined,
      taskId: event.taskId ?? undefined,
      workflowId: event.workflowExecutionId ?? undefined,
      usageEventId: event.eventId,
      metadata: {
        provider: event.provider,
        modelId: event.modelId,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cachedTokens: event.cachedTokens,
        totalTokens: event.totalTokens,
        costUsd: event.costUsd,
        traceId: event.traceId,
      },
      createdBy: 'usage_service',
      createdByType: 'service',
    } as const;
    if (reservationId) {
      await this.credits.captureReservation({
        reservationId,
        amount: creditAmount,
        eventType: debit.eventType,
        sourcePlatform: debit.sourcePlatform,
        idempotencyKey: debit.idempotencyKey,
        description: debit.description,
        agentId: debit.agentId,
        sessionId: debit.sessionId,
        usageEventId: debit.usageEventId,
        metadata: debit.metadata,
      });
    } else {
      await this.credits.debit(debit);
    }
  }

  /** Per-agent aggregation: total tokens, total cost, call count. */
  async getAgentUsage(agentId: string, opts?: { from?: Date; to?: Date }) {
    const conditions = [eq(schema.usageEvent.agentId, agentId)];
    if (opts?.from)
      conditions.push(gte(schema.usageEvent.createdAt, opts.from));
    if (opts?.to) conditions.push(lte(schema.usageEvent.createdAt, opts.to));

    const [agg] = await this.db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${schema.usageEvent.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${schema.usageEvent.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${schema.usageEvent.totalTokens}), 0)`,
        totalCostUsd: sql<number>`coalesce(sum(${schema.usageEvent.costUsd}), 0)`,
        callCount: sql<number>`count(*)`,
      })
      .from(schema.usageEvent)
      .where(and(...conditions));

    const events = await this.db
      .select()
      .from(schema.usageEvent)
      .where(and(...conditions))
      .orderBy(desc(schema.usageEvent.createdAt))
      .limit(100);

    return { ...agg, events };
  }

  /** Per-session aggregation. */
  async getSessionUsage(sessionId: string) {
    const [agg] = await this.db
      .select({
        totalInputTokens: sql<number>`coalesce(sum(${schema.usageEvent.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${schema.usageEvent.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${schema.usageEvent.totalTokens}), 0)`,
        totalCostUsd: sql<number>`coalesce(sum(${schema.usageEvent.costUsd}), 0)`,
        callCount: sql<number>`count(*)`,
      })
      .from(schema.usageEvent)
      .where(eq(schema.usageEvent.sessionId, sessionId));

    const events = await this.db
      .select()
      .from(schema.usageEvent)
      .where(eq(schema.usageEvent.sessionId, sessionId))
      .orderBy(desc(schema.usageEvent.createdAt));

    return { ...agg, events };
  }
}
