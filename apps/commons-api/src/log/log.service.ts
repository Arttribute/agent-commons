import { eq, desc } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class LogService {
  constructor(private db: DatabaseService) {}

  async createLogEntry(props: {
    agentId: string;
    sessionId?: string;
    action: string; // short label
    message: string; // longer text
    status: string; // success/error/warning/pending
    responseTime?: number;
    tools?: Array<{
      name: string;
      status: string;
      summary?: string;
      duration?: number;
    }>;
  }) {
    await this.db.insert(schema.agentLog).values({
      agentId: props.agentId,
      sessionId: props.sessionId,
      action: props.action,
      message: props.message,
      status: props.status,
      responseTime: props.responseTime || 0,
      tools: props.tools || [],
    });
  }

  async getAllAgentLogs({ agentId }: { agentId: string }) {
    if (!agentId) {
      throw new NotFoundException('Missing agentId');
    }
    const logs = await this.db.query.agentLog.findMany({
      where: (t) => eq(t.agentId, agentId),
      orderBy: (t) => [desc(t.createdAt)],
      limit: 200,
    });
    const out = logs.map((l) => ({
      id: l.logId,
      action: l.action || '',
      status: l.status || 'info',
      message: l.message || '',
      timestamp: l.createdAt.toISOString(),
      responseTime: l.responseTime || 0,
      agent: agentId,
      sessionId: l.sessionId || '',
      tools: l.tools || [],
    }));
    return out;
  }
}
