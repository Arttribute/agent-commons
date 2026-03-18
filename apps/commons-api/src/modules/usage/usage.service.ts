import { Injectable } from '@nestjs/common';
import { InferInsertModel } from 'drizzle-orm';
import { and, desc, eq, gte, lte, sql, sum } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';

type InsertUsageEvent = InferInsertModel<typeof schema.usageEvent>;

@Injectable()
export class UsageService {
  constructor(private db: DatabaseService) {}

  /** Record a single LLM-call usage event. */
  async record(event: Omit<InsertUsageEvent, 'eventId' | 'createdAt'>) {
    const [row] = await this.db
      .insert(schema.usageEvent)
      .values(event)
      .returning();
    return row;
  }

  /** Per-agent aggregation: total tokens, total cost, call count. */
  async getAgentUsage(
    agentId: string,
    opts?: { from?: Date; to?: Date },
  ) {
    const conditions = [eq(schema.usageEvent.agentId, agentId)];
    if (opts?.from) conditions.push(gte(schema.usageEvent.createdAt, opts.from));
    if (opts?.to)   conditions.push(lte(schema.usageEvent.createdAt, opts.to));

    const [agg] = await this.db
      .select({
        totalInputTokens:  sql<number>`coalesce(sum(${schema.usageEvent.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${schema.usageEvent.outputTokens}), 0)`,
        totalTokens:       sql<number>`coalesce(sum(${schema.usageEvent.totalTokens}), 0)`,
        totalCostUsd:      sql<number>`coalesce(sum(${schema.usageEvent.costUsd}), 0)`,
        callCount:         sql<number>`count(*)`,
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
        totalInputTokens:  sql<number>`coalesce(sum(${schema.usageEvent.inputTokens}), 0)`,
        totalOutputTokens: sql<number>`coalesce(sum(${schema.usageEvent.outputTokens}), 0)`,
        totalTokens:       sql<number>`coalesce(sum(${schema.usageEvent.totalTokens}), 0)`,
        totalCostUsd:      sql<number>`coalesce(sum(${schema.usageEvent.costUsd}), 0)`,
        callCount:         sql<number>`count(*)`,
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
