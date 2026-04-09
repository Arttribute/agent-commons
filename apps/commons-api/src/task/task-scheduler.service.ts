import { Injectable, Logger, OnModuleDestroy, OnModuleInit, forwardRef, Inject } from '@nestjs/common';
import { and, eq, lte, lt, inArray } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { TaskExecutionService } from './task-execution.service';
import * as schema from '../../models/schema';
import { parseCronExpression } from '../utils/cron.util';

const POLL_INTERVAL_MS = 15_000;
const MAX_CONCURRENT_RUNS = 5;

@Injectable()
export class TaskSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskSchedulerService.name);
  private pollTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => TaskExecutionService))
    private readonly taskExecution: TaskExecutionService,
  ) {}

  async onModuleInit() {
    await this.catchupMissedRuns();
    this.startPolling();
    this.logger.log(`Task scheduler started — polling every ${POLL_INTERVAL_MS / 1000}s`);
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  /** Schedule a future run for a task (one-time or recurring) */
  async scheduleRun(params: {
    taskId: string;
    scheduledFor: Date | string;
    triggeredBy?: 'cron' | 'manual' | 'dependency';
    sessionId?: string;
  }): Promise<void> {
    await this.db.insert(schema.scheduledTaskRun).values({
      taskId: params.taskId,
      scheduledFor: params.scheduledFor instanceof Date ? params.scheduledFor : new Date(params.scheduledFor),
      triggeredBy: params.triggeredBy ?? 'cron',
      status: 'pending',
      ...(params.sessionId ? { sessionId: params.sessionId as any } : {}),
    });
    this.logger.debug(`Scheduled run for task ${params.taskId} at ${new Date(params.scheduledFor).toISOString()}`);
  }

  /**
   * On startup, find recurring tasks whose nextRunAt has already passed but have
   * no pending/running scheduledTaskRun record. These were missed while the service
   * was down. Create a catchup run for each so they execute on the next poll.
   */
  private async catchupMissedRuns(): Promise<void> {
    try {
      const now = new Date();

      // All recurring tasks that are overdue
      const overdueTasks = await this.db.query.task.findMany({
        where: (t) =>
          and(
            eq(t.isRecurring, true),
            lt(t.nextRunAt, now),
          ),
      });

      if (overdueTasks.length === 0) return;

      // For each overdue task, check if there's already a pending/running run
      const catchupPromises = overdueTasks.map(async (task) => {
        // Single DB query that filters by status in SQL
        const existing = await this.db.query.scheduledTaskRun.findFirst({
          where: (r) =>
            and(
              eq(r.taskId, task.taskId),
              inArray(r.status, ['pending', 'running']),
            ),
        });

        const hasActivePendingOrRunning = !!existing;

        if (!hasActivePendingOrRunning) {
          this.logger.warn(
            `Catchup: task ${task.taskId} missed run (was due ${task.nextRunAt?.toISOString()}), scheduling now`,
          );
          await this.scheduleRun({
            taskId: task.taskId,
            scheduledFor: now, // run immediately on next poll
            triggeredBy: 'cron',
          });
        }
      });

      await Promise.allSettled(catchupPromises);
      this.logger.log(`Catchup complete: checked ${overdueTasks.length} overdue recurring task(s)`);
    } catch (error: any) {
      this.logger.error(`Catchup failed: ${error.message}`);
    }
  }

  /** Compute the next run time from a cron expression */
  getNextRunTime(cronExpression: string): Date | null {
    try {
      return parseCronExpression(cronExpression);
    } catch {
      return null;
    }
  }

  private startPolling() {
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    // Run immediately on start to pick up any missed runs
    setImmediate(() => this.poll());
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll() {
    if (this.running) return; // Don't overlap polls
    this.running = true;

    try {
      const now = new Date();

      // Find pending runs that are due
      const dueRuns = await this.db.query.scheduledTaskRun.findMany({
        where: (r) =>
          and(eq(r.status, 'pending'), lte(r.scheduledFor, now)),
        limit: MAX_CONCURRENT_RUNS,
      });

      if (dueRuns.length === 0) {
        this.running = false;
        return;
      }

      this.logger.log(`Found ${dueRuns.length} due task runs`);

      // Execute all due runs concurrently (up to MAX_CONCURRENT_RUNS)
      await Promise.allSettled(dueRuns.map((run) => this.executeRun(run)));
    } catch (error: any) {
      this.logger.error(`Poll error: ${error.message}`);
    } finally {
      this.running = false;
    }
  }

  private async executeRun(run: typeof schema.scheduledTaskRun.$inferSelect) {
    // Mark as running (optimistic lock — skip if already claimed)
    const [claimed] = await this.db
      .update(schema.scheduledTaskRun)
      .set({ status: 'running', startedAt: new Date() })
      .where(
        and(
          eq(schema.scheduledTaskRun.runId, run.runId),
          eq(schema.scheduledTaskRun.status, 'pending'),
        ),
      )
      .returning();

    if (!claimed) {
      // Another instance claimed it first
      return;
    }

    try {
      await this.taskExecution.executeTask(run.taskId);

      // Mark completed
      await this.db
        .update(schema.scheduledTaskRun)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(schema.scheduledTaskRun.runId, run.runId));

      // Schedule next run if task is recurring
      const task = await this.db.query.task.findFirst({
        where: (t) => eq(t.taskId, run.taskId),
      });

      if (task?.isRecurring && task.cronExpression) {
        const nextRun = this.getNextRunTime(task.cronExpression);
        if (nextRun) {
          await this.scheduleRun({
            taskId: task.taskId,
            scheduledFor: nextRun,
            triggeredBy: 'cron',
            sessionId: run.sessionId ?? undefined,
          });
          // Update nextRunAt on task
          await this.db
            .update(schema.task)
            .set({ nextRunAt: nextRun, lastRunAt: new Date() })
            .where(eq(schema.task.taskId, task.taskId));
        }
      }
    } catch (error: any) {
      this.logger.error(`Task run ${run.runId} failed: ${error.message}`);
      await this.db
        .update(schema.scheduledTaskRun)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error.message,
        })
        .where(eq(schema.scheduledTaskRun.runId, run.runId));
    }
  }
}
