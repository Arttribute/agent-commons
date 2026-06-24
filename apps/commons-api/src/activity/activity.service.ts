import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';

@Injectable()
export class ActivityService {
  constructor(private readonly db: DatabaseService) {}

  async record(input: {
    eventType: string;
    actorType: 'user' | 'agent' | 'service';
    actorId: string;
    workspaceId?: string | null;
    subjectType: string;
    subjectId: string;
    metadata?: Record<string, unknown>;
  }) {
    const [event] = await this.db
      .insert(schema.activityEvent)
      .values({
        ...input,
        workspaceId: input.workspaceId ?? null,
        metadata: input.metadata ?? {},
        source: 'agent_commons',
      })
      .returning();
    return event;
  }

  async find(input: {
    actorId: string;
    eventType?: string;
    since?: Date;
    limit?: number;
  }) {
    const conditions = [eq(schema.activityEvent.actorId, input.actorId)];
    if (input.eventType) {
      conditions.push(eq(schema.activityEvent.eventType, input.eventType));
    }
    if (input.since) {
      conditions.push(gte(schema.activityEvent.occurredAt, input.since));
    }
    return this.db.query.activityEvent.findMany({
      where: and(...conditions),
      orderBy: desc(schema.activityEvent.occurredAt),
      limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
    });
  }
}
