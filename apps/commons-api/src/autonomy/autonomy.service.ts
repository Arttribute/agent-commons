import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { intervalToCron } from '~/utils/cron.util';
import * as schema from '#/models/schema';
import { eq, sql } from 'drizzle-orm';

@Injectable()
export class AutonomyService {
  constructor(private readonly db: DatabaseService) {}

  async enable(agentId: string, intervalSec: number) {
    if (intervalSec < 5 || intervalSec > 86_400) {
      throw new BadRequestException('Interval must be 5 - 86400 seconds');
    }

    const jobName = `agent:${agentId}:schedule`;
    const cronExp = intervalToCron(intervalSec);

    // cancel any previous job
    await this.db.execute(sql`SELECT cron.unschedule(${jobName});`);

    // schedule
    await this.db.execute(
      sql`SELECT cron.schedule(${jobName}, ${cronExp}, FORMAT('SELECT trigger_agent(%L)', ${agentId}));`,
    );

    await this.db
      .update(schema.agent)
      .set({
        autonomyEnabled: true,
        autonomousIntervalSec: intervalSec,
        cronJobName: jobName,
      })
      .where(eq(schema.agent.agentId, agentId));
  }

  async pause(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (a) => eq(a.agentId, agentId),
    });
    if (!agent?.cronJobName) return;
    await this.db.execute(sql`SELECT cron.unschedule(${agent.cronJobName});`);
    await this.db
      .update(schema.agent)
      .set({ autonomyEnabled: false })
      .where(eq(schema.agent.agentId, agentId));
  }

  async resume(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (a) => eq(a.agentId, agentId),
    });
    if (!agent) throw new BadRequestException('Agent not found');
    if (agent.autonomousIntervalSec! <= 0)
      throw new BadRequestException('Interval not set');
    await this.enable(agentId, agent.autonomousIntervalSec!);
  }

  async stop(agentId: string) {
    await this.pause(agentId);
    await this.db
      .update(schema.agent)
      .set({ autonomousIntervalSec: 0, cronJobName: null })
      .where(eq(schema.agent.agentId, agentId));
  }
}
