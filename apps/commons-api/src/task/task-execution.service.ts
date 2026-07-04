import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { WorkflowService } from '../tool/workflow.service';
import { WorkflowExecutorService } from '../tool/workflow-executor.service';
import { SessionService } from '../session/session.service';
import { TaskSchedulerService } from './task-scheduler.service';
import { AgentService } from '../agent/agent.service';
import * as schema from '../../models/schema';

export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed';
  resultContent?: any;
  summary?: string;
  errorMessage?: string;
  duration: number;
}

/** Grace window so "schedule for now" requests aren't rejected by request latency/clock skew. */
const PAST_SCHEDULE_TOLERANCE_MS = 60_000;

function assertNotInPast(date: Date) {
  if (date.getTime() < Date.now() - PAST_SCHEDULE_TOLERANCE_MS) {
    throw new BadRequestException('scheduledFor cannot be in the past');
  }
}

/**
 * Handles task execution with support for:
 * - Dependency resolution
 * - Workflow execution
 * - Durable DB-driven scheduling (via TaskSchedulerService)
 * - Recurring tasks with optional new-session-per-run
 */
@Injectable()
export class TaskExecutionService {
  private readonly logger = new Logger(TaskExecutionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly workflowService: WorkflowService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => TaskSchedulerService))
    private readonly scheduler: TaskSchedulerService,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
  ) {}

  // ── Task CRUD ─────────────────────────────────────────────────────────────

  async createTask(params: {
    agentId: string;
    sessionId: string;
    title: string;
    description?: string;
    executionMode?: 'single' | 'workflow' | 'sequential';
    workflowId?: string;
    workflowInputs?: Record<string, any>;
    cronExpression?: string;
    scheduledFor?: Date;
    isRecurring?: boolean;
    dependsOn?: string[];
    tools?: string[];
    toolConstraintType?: 'hard' | 'soft' | 'none';
    toolInstructions?: string;
    recurringSessionMode?: 'same' | 'new';
    context?: Record<string, any>;
    priority?: number;
    timeoutMs?: number;
    createdBy: string;
    createdByType: 'user' | 'agent';
  }) {
    if (params.workflowId) {
      await this.workflowService.getWorkflow(params.workflowId);
    }

    if (params.dependsOn?.length) {
      for (const depId of params.dependsOn) {
        const dep = await this.db.query.task.findFirst({
          where: (t: any) => eq(t.taskId, depId),
        });
        if (!dep) throw new BadRequestException(`Dependency task ${depId} not found`);
      }
    }

    // Normalise scheduledFor to a Date (JSON body delivers it as a string)
    const scheduledForDate = params.scheduledFor
      ? new Date(params.scheduledFor)
      : undefined;
    if (scheduledForDate) assertNotInPast(scheduledForDate);

    let nextRunAt: Date | undefined;
    if (params.cronExpression && params.isRecurring) {
      nextRunAt = this.scheduler.getNextRunTime(params.cronExpression) ?? undefined;
    } else if (scheduledForDate) {
      nextRunAt = scheduledForDate;
    }

    const [task] = await this.db
      .insert(schema.task)
      .values({
        agentId: params.agentId,
        sessionId: params.sessionId,
        title: params.title,
        description: params.description,
        executionMode: params.executionMode ?? 'single',
        workflowId: params.workflowId || undefined,
        workflowInputs: params.workflowInputs,
        cronExpression: params.cronExpression,
        scheduledFor: scheduledForDate,
        isRecurring: params.isRecurring ?? false,
        nextRunAt,
        dependsOn: params.dependsOn,
        tools: params.tools,
        toolConstraintType: params.toolConstraintType ?? 'none',
        toolInstructions: params.toolInstructions,
        recurringSessionMode: params.recurringSessionMode ?? 'same',
        context: params.context,
        priority: params.priority ?? 0,
        ...(params.timeoutMs && { timeoutMs: params.timeoutMs }),
        createdBy: params.createdBy,
        createdByType: params.createdByType,
        status: 'pending',
      })
      .returning();

    this.logger.log(`Created task ${task.taskId}`);

    // Schedule the first run durably in the DB.
    // Immediate tasks (no future schedule) get scheduledFor=now() so the
    // scheduler picks them up on the next poll (within ~15 s).
    const scheduledFor = nextRunAt ?? scheduledForDate ?? new Date();
    await this.scheduler.scheduleRun({
      taskId: task.taskId,
      scheduledFor,
      triggeredBy: params.cronExpression ? 'cron' : 'manual',
      sessionId: params.sessionId,
    });

    return task;
  }

  /**
   * Reschedule a task's upcoming run and/or resize its estimated duration —
   * used by the calendar view's drag-to-reschedule and resize interactions.
   */
  async rescheduleTask(
    taskId: string,
    params: { scheduledFor?: Date; estimatedDuration?: number },
  ): Promise<{
    task: typeof schema.task.$inferSelect;
    rescheduledRun: { runId: string; created: boolean } | null;
  }> {
    if (params.scheduledFor === undefined && params.estimatedDuration === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const task = await this.db.query.task.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    });
    if (!task) throw new NotFoundException('Task not found');

    if (params.estimatedDuration !== undefined) {
      const MIN_DURATION_MS = 15 * 60_000;
      if (!Number.isFinite(params.estimatedDuration) || params.estimatedDuration < MIN_DURATION_MS) {
        throw new BadRequestException(`estimatedDuration must be at least ${MIN_DURATION_MS}ms`);
      }
    }

    let scheduledFor: Date | undefined;
    if (params.scheduledFor !== undefined) {
      scheduledFor = new Date(params.scheduledFor);
      assertNotInPast(scheduledFor);

      if (task.status === 'running' || task.status === 'started') {
        throw new ConflictException('Task is currently executing and cannot be rescheduled');
      }
      if (task.status === 'cancelled') {
        throw new BadRequestException('Cannot reschedule a cancelled task');
      }
      if (!task.isRecurring && ['completed', 'failed'].includes(task.status)) {
        throw new BadRequestException('Cannot reschedule a task that has already finished');
      }
      if (task.isRecurring && !task.cronExpression) {
        throw new BadRequestException('Recurring task is missing a cron expression');
      }
    }

    await this.db
      .update(schema.task)
      .set({
        ...(scheduledFor && task.isRecurring && { nextRunAt: scheduledFor }),
        ...(scheduledFor && !task.isRecurring && { scheduledFor, nextRunAt: scheduledFor }),
        ...(params.estimatedDuration !== undefined && { estimatedDuration: params.estimatedDuration }),
        updatedAt: new Date(),
      })
      .where(eq(schema.task.taskId, taskId));

    let rescheduledRun: { runId: string; created: boolean } | null = null;
    if (scheduledFor) {
      rescheduledRun = await this.scheduler.rescheduleUpcomingRun(taskId, scheduledFor);
    }

    const updated = await this.db.query.task.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    });

    return { task: updated!, rescheduledRun };
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  async executeTask(taskId: string): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    try {
      const task = await this.db.query.task.findFirst({
        where: (t: any) => eq(t.taskId, taskId),
        with: { workflow: true },
      });

      if (!task) throw new NotFoundException(`Task ${taskId} not found`);

      if (task.status === 'running') {
        this.logger.warn(`Task ${taskId} already running`);
        return { taskId, status: 'failed', errorMessage: 'Task already running', duration: Date.now() - startTime };
      }

      if (task.dependsOn?.length) {
        const ready = await this.checkDependencies(task.dependsOn);
        if (!ready) {
          return { taskId, status: 'failed', errorMessage: 'Dependencies not completed', duration: Date.now() - startTime };
        }
      }

      await this.db.update(schema.task).set({ status: 'running', actualStart: new Date() })
        .where(eq(schema.task.taskId, taskId));

      let result: any;
      let summary: string;

      if (task.executionMode === 'workflow') {
        if (!task.workflowId) throw new BadRequestException('Workflow mode requires workflowId');
        const executionId = await this.workflowService.executeWorkflow({
          workflowId: task.workflowId,
          agentId: task.agentId,
          sessionId: task.sessionId,
          taskId: task.taskId,
          inputData: task.workflowInputs ?? {},
        });
        const timeoutMs = (task as any).timeoutMs ?? undefined;
        result = await this.waitForWorkflowCompletion(executionId, timeoutMs);
        summary = `Workflow ${task.workflow?.name ?? task.workflowId} completed`;
      } else {
        // Single/sequential tasks: run the agent with a structured task prompt,
        // await completion, then mark the task done based on the final event.
        const taskPrompt = buildTaskPrompt(task);
        let agentResult: any = null;

        await new Promise<void>((resolve, reject) => {
          this.agentService.runAgent({
            agentId: task.agentId,
            sessionId: task.sessionId,
            messages: [{ role: 'user', content: taskPrompt }],
            initiator: task.createdBy ?? task.agentId,
          }).subscribe({
            next: (event: any) => {
              if (event?.type === 'final') agentResult = event.payload;
            },
            error: (err: Error) => reject(err),
            complete: () => resolve(),
          });
        });

        const agentText = extractAgentText(agentResult);
        result = agentResult;
        summary = agentText ? agentText.slice(0, 500) : 'Task executed by agent';
      }

      await this.completeTask(taskId, { status: 'completed', resultContent: result, summary, duration: Date.now() - startTime });

      // For recurring tasks, next run is scheduled by TaskSchedulerService automatically
      // For non-recurring tasks with a new-session preference, update the session on next run
      if (task.isRecurring && task.cronExpression && task.recurringSessionMode === 'new') {
        const newSession = await this.sessionService.createSession({
          value: {
            agentId: task.agentId,
            initiator: task.createdBy,
            title: `Recurring: ${task.title}`,
            model: { name: 'gpt-5.4-mini' } as any,
          },
        });
        await this.db.update(schema.task)
          .set({ sessionId: newSession.sessionId })
          .where(eq(schema.task.taskId, taskId));
      }

      return { taskId, status: 'completed', resultContent: result, summary, duration: Date.now() - startTime };
    } catch (error: any) {
      this.logger.error(`Task ${taskId} failed: ${error.message}`);
      await this.completeTask(taskId, { status: 'failed', errorMessage: error.message, duration: Date.now() - startTime });
      return { taskId, status: 'failed', errorMessage: error.message, duration: Date.now() - startTime };
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getNextExecutableTask(agentId: string, sessionId: string) {
    const tasks = await this.db.query.task.findMany({
      where: (t: any) => and(eq(t.agentId, agentId), eq(t.sessionId, sessionId), eq(t.status, 'pending')),
      orderBy: (t: any, { desc, asc }: any) => [desc(t.priority), asc(t.createdAt)],
    });

    for (const task of tasks) {
      if (task.nextRunAt && task.nextRunAt > new Date()) continue;
      if (task.dependsOn?.length && !(await this.checkDependencies(task.dependsOn))) continue;
      return task;
    }
    return null;
  }

  async listSessionTasks(sessionId: string) {
    return this.db.query.task.findMany({
      where: (t: any) => eq(t.sessionId, sessionId),
      orderBy: (t: any, { desc }: any) => [desc(t.createdAt)],
    });
  }

  async listAgentTasks(agentId: string) {
    return this.db.query.task.findMany({
      where: (t: any) => eq(t.agentId, agentId),
      orderBy: (t: any, { desc }: any) => [desc(t.createdAt)],
    });
  }

  async listTasksByOwner(ownerId: string, ownerType: 'user' | 'agent') {
    return this.db.query.task.findMany({
      where: (t: any) => and(eq(t.createdBy, ownerId), eq(t.createdByType, ownerType)),
      orderBy: (t: any, { desc }: any) => [desc(t.createdAt)],
    });
  }

  async cancelTask(taskId: string) {
    await this.db.update(schema.task)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(schema.task.taskId, taskId));

    // Hard cancel: also cancel any running workflow executions for this task
    const activeExecutions = await this.db.query.workflowExecution.findMany({
      where: (e: any) => and(
        eq(e.taskId, taskId),
        // Only cancel non-terminal executions
      ),
    });
    for (const exec of activeExecutions) {
      if (!['completed', 'failed', 'cancelled'].includes(exec.status)) {
        try {
          await this.workflowExecutor.cancelExecution(exec.executionId);
        } catch (e: any) {
          this.logger.warn(`Could not cancel workflow execution ${exec.executionId}: ${e.message}`);
        }
      }
    }

    this.logger.log(`Cancelled task ${taskId} (+ ${activeExecutions.length} workflow execution(s))`);
    return { success: true };
  }

  async deleteTask(taskId: string) {
    const result = await this.db.delete(schema.task).where(eq(schema.task.taskId, taskId)).returning();
    if (!result.length) throw new NotFoundException(`Task ${taskId} not found`);
    this.logger.log(`Deleted task ${taskId}`);
    return { success: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async checkDependencies(ids: string[]): Promise<boolean> {
    for (const id of ids) {
      const dep = await this.db.query.task.findFirst({ where: (t: any) => eq(t.taskId, id) });
      if (!dep || dep.status !== 'completed') return false;
    }
    return true;
  }

  private async waitForWorkflowCompletion(executionId: string, timeoutMs?: number): Promise<any> {
    const deadline = Date.now() + (timeoutMs ?? 5 * 60_000);
    while (Date.now() < deadline) {
      const execution = await this.db.query.workflowExecution.findFirst({
        where: (e: any) => eq(e.executionId, executionId),
      });
      if (!execution) throw new Error(`Workflow execution ${executionId} not found`);
      if (execution.status === 'completed') return execution.outputData;
      if (execution.status === 'failed' || execution.status === 'cancelled') {
        throw new Error(execution.errorMessage ?? `Workflow ${execution.status}`);
      }
      if (execution.status === 'awaiting_approval') {
        // Return a special result — task will wait until the approval resumes the workflow
        return {
          paused: true,
          executionId,
          pausedAtNode: (execution as any).pausedAtNode,
          approvalToken: (execution as any).approvalToken,
          message: 'Workflow paused awaiting human approval',
        };
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('Workflow execution timeout');
  }

  private async completeTask(taskId: string, result: {
    status: 'completed' | 'failed';
    resultContent?: any;
    summary?: string;
    errorMessage?: string;
    duration: number;
  }) {
    await this.db.update(schema.task)
      .set({
        status: result.status,
        resultContent: result.resultContent,
        summary: result.summary,
        errorMessage: result.errorMessage,
        actualEnd: new Date(),
        progress: result.status === 'completed' ? 100 : 0,
        completedAt: result.status === 'completed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(schema.task.taskId, taskId));
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

/**
 * Build a structured prompt for the agent to execute a task.
 * The agent sees task title, description, context, and any tool hints.
 */
export function buildTaskPrompt(task: {
  taskId: string;
  title: string;
  description?: string | null;
  context?: Record<string, any> | null;
  tools?: string[] | null;
  toolInstructions?: string | null;
}): string {
  const lines: string[] = [
    '⫷⫷TASK_EXECUTION⫸⫸',
    `You have been assigned a task. Execute it and report the result.`,
    '',
    `Task ID: ${task.taskId}`,
    `Title: ${task.title}`,
  ];

  if (task.description) lines.push(`Description: ${task.description}`);

  if (task.context) {
    const ctx = task.context as any;
    if (ctx.objective) lines.push(`Objective: ${ctx.objective}`);
    if (ctx.expectedOutputType) lines.push(`Expected output type: ${ctx.expectedOutputType}`);
    if (ctx.constraints?.length) lines.push(`Constraints: ${ctx.constraints.join('; ')}`);
    if (ctx.evaluationCriteria?.length) lines.push(`Success criteria: ${ctx.evaluationCriteria.join('; ')}`);
    if (ctx.reasoningStrategy) lines.push(`Suggested approach: ${ctx.reasoningStrategy}`);
  }

  if (task.tools?.length) lines.push(`Tools available for this task: ${task.tools.join(', ')}`);
  if (task.toolInstructions) lines.push(`Tool usage notes: ${task.toolInstructions}`);

  lines.push('', 'Execute this task now and provide a clear result.');
  return lines.join('\n');
}

/** Extract plain text from a runAgent final event payload */
function extractAgentText(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.content === 'string') return payload.content;
  if (Array.isArray(payload.content)) {
    return payload.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('\n');
  }
  if (payload.message) return payload.message;
  return '';
}
