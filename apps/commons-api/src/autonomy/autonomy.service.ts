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
    const cronExp = intervalToCron(intervalSec); // e.g. '*/6 * * * * *'
    const command = `FORMAT(SELECT trigger_agent('${agentId}'))`; // <-- plain SQL

    // 1) Unschedule any existing job
    await this.db.execute(
      sql.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = '${jobName}') THEN
        PERFORM cron.unschedule('${jobName}');
      END IF;
    END
    $$;
  `),
    );

    // 2) Schedule the new job with *three* text args
    await this.db.execute(sql`
    SELECT cron.schedule(
      ${jobName},   -- job_name
      ${cronExp},   -- schedule
      ${command}    -- exact SQL to run
    );
  `);
    // SELECT cron.schedule(FORMAT('agent:%s:schedule', '0x4e85f5ceb7e9c06c59ad24741631d34abdeea522'),'*/10 * * * *', FORMAT('SELECT trigger_agent(%L)', '0x4e85f5ceb7e9c06c59ad24741631d34abdeea522'));

    // Update agent record
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

    await this.db.execute(
      sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = '${agent.cronJobName}') THEN
          PERFORM cron.unschedule('${agent.cronJobName}');
        END IF;
      END
      $$;
    `),
    );

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
    if (agent.autonomousIntervalSec! <= 0) {
      throw new BadRequestException('Interval not set');
    }

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
