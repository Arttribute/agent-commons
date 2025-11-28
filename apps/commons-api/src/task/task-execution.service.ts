import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, or, isNull, lte } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import { WorkflowService } from '../tool/workflow.service';
import * as schema from '../../models/schema';
import { CronJob } from 'cron';

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  taskId: string;
  status: 'completed' | 'failed';
  resultContent?: any;
  summary?: string;
  errorMessage?: string;
  duration: number;
}

/**
 * TaskExecutionService
 *
 * Handles task execution with support for:
 * - Dependency resolution (wait for dependent tasks)
 * - Workflow execution
 * - Cron-based scheduling
 * - Sequential execution of agent-created todos
 * - One-time and recurring tasks
 */
@Injectable()
export class TaskExecutionService {
  private readonly logger = new Logger(TaskExecutionService.name);
  private readonly scheduledJobs = new Map<string, CronJob>();

  constructor(
    private readonly db: DatabaseService,
    private readonly workflowService: WorkflowService,
  ) {
    // Initialize: Load and schedule all active cron tasks
    this.initializeScheduledTasks();
  }

  /**
   * Initialize scheduled tasks on service startup
   */
  private async initializeScheduledTasks() {
    const cronTasks = await this.db.query.task.findMany({
      where: (t: any) =>
        and(
          eq(t.status, 'pending'),
          eq(t.isRecurring, true),
          isNull(t.actualEnd),
        ),
    });

    for (const task of cronTasks) {
      if (task.cronExpression) {
        this.scheduleTask(task.taskId, task.cronExpression);
      }
    }

    this.logger.log(`Initialized ${cronTasks.length} scheduled tasks`);
  }

  /**
   * Create a new task
   *
   * @param params - Task creation parameters
   * @returns Created task
   */
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
    context?: Record<string, any>;
    priority?: number;
    createdBy: string;
    createdByType: 'user' | 'agent';
  }) {
    // Validate workflow if specified
    if (params.workflowId) {
      await this.workflowService.getWorkflow(params.workflowId);
    }

    // Validate dependencies exist
    if (params.dependsOn && params.dependsOn.length > 0) {
      for (const depId of params.dependsOn) {
        const depTask = await this.db.query.task.findFirst({
          where: (t: any) => eq(t.taskId, depId),
        });

        if (!depTask) {
          throw new BadRequestException(`Dependency task ${depId} not found`);
        }
      }
    }

    // Calculate next run time for cron tasks
    let nextRunAt: Date | undefined;
    if (params.cronExpression && params.isRecurring) {
      nextRunAt = this.getNextCronTime(params.cronExpression);
    } else if (params.scheduledFor) {
      nextRunAt = params.scheduledFor;
    }

    // Create task
    const [task] = await this.db
      .insert(schema.task)
      .values({
        agentId: params.agentId,
        sessionId: params.sessionId,
        title: params.title,
        description: params.description,
        executionMode: params.executionMode || 'single',
        workflowId: params.workflowId,
        workflowInputs: params.workflowInputs,
        cronExpression: params.cronExpression,
        scheduledFor: params.scheduledFor,
        isRecurring: params.isRecurring || false,
        nextRunAt,
        dependsOn: params.dependsOn,
        tools: params.tools,
        context: params.context,
        priority: params.priority || 0,
        createdBy: params.createdBy,
        createdByType: params.createdByType,
        status: 'pending',
      })
      .returning();

    this.logger.log(`Created task ${task.taskId} in session ${params.sessionId}`);

    // Schedule if has cron expression
    if (params.cronExpression && params.isRecurring) {
      this.scheduleTask(task.taskId, params.cronExpression);
    }

    return task;
  }

  /**
   * Schedule a task with cron expression
   *
   * @param taskId - The task ID
   * @param cronExpression - Cron expression
   */
  private scheduleTask(taskId: string, cronExpression: string) {
    try {
      // Remove existing job if any
      this.unscheduleTask(taskId);

      // Create new cron job
      const job = new CronJob(
        cronExpression,
        async () => {
          this.logger.log(`Cron trigger for task ${taskId}`);
          await this.executeTask(taskId);
        },
        null,
        true, // Start immediately
        'UTC',
      );

      this.scheduledJobs.set(taskId, job);

      this.logger.log(`Scheduled task ${taskId} with cron: ${cronExpression}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to schedule task ${taskId}: ${error.message}`,
      );
    }
  }

  /**
   * Unschedule a task
   *
   * @param taskId - The task ID
   */
  private unscheduleTask(taskId: string) {
    const job = this.scheduledJobs.get(taskId);
    if (job) {
      job.stop();
      this.scheduledJobs.delete(taskId);
      this.logger.log(`Unscheduled task ${taskId}`);
    }
  }

  /**
   * Get next cron execution time
   *
   * @param cronExpression - Cron expression
   * @returns Next execution time
   */
  private getNextCronTime(cronExpression: string): Date {
    try {
      const job = new CronJob(cronExpression, () => {}, null, false, 'UTC');
      return job.nextDate().toJSDate();
    } catch (error: any) {
      throw new BadRequestException(`Invalid cron expression: ${cronExpression}`);
    }
  }

  /**
   * Execute a task
   *
   * @param taskId - The task ID
   * @returns Execution result
   */
  async executeTask(taskId: string): Promise<TaskExecutionResult> {
    const startTime = Date.now();

    try {
      // Get task
      const task = await this.db.query.task.findFirst({
        where: (t: any) => eq(t.taskId, taskId),
        with: {
          workflow: true,
        },
      });

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      // Check if already running
      if (task.status === 'running') {
        this.logger.warn(`Task ${taskId} is already running`);
        return {
          taskId,
          status: 'failed',
          errorMessage: 'Task is already running',
          duration: Date.now() - startTime,
        };
      }

      // Check dependencies
      if (task.dependsOn && task.dependsOn.length > 0) {
        const ready = await this.checkDependencies(task.dependsOn);
        if (!ready) {
          this.logger.log(
            `Task ${taskId} waiting for dependencies to complete`,
          );
          return {
            taskId,
            status: 'failed',
            errorMessage: 'Dependencies not completed',
            duration: Date.now() - startTime,
          };
        }
      }

      // Mark as running
      await this.db
        .update(schema.task)
        .set({
          status: 'running',
          actualStart: new Date(),
        })
        .where(eq(schema.task.taskId, taskId));

      // Execute based on mode
      let result: any;
      let summary: string;

      switch (task.executionMode) {
        case 'workflow':
          if (!task.workflowId) {
            throw new BadRequestException(
              'Workflow mode requires workflowId',
            );
          }

          // Execute workflow
          const executionId = await this.workflowService.executeWorkflow({
            workflowId: task.workflowId,
            agentId: task.agentId,
            sessionId: task.sessionId,
            taskId: task.taskId,
            inputData: task.workflowInputs || {},
          });

          // Wait for completion (poll execution status)
          result = await this.waitForWorkflowCompletion(executionId);
          summary = `Workflow ${task.workflow?.name} executed successfully`;
          break;

        case 'sequential':
        case 'single':
        default:
          // Execute as regular task (will be picked up by runAgent)
          // This is a placeholder - actual execution happens in runAgent
          result = { executedByAgent: true };
          summary = `Task queued for agent execution`;
          break;
      }

      // Mark as completed
      await this.completeTask(taskId, {
        status: 'completed',
        resultContent: result,
        summary,
        duration: Date.now() - startTime,
      });

      // Update next run time for recurring tasks
      if (task.isRecurring && task.cronExpression) {
        const nextRun = this.getNextCronTime(task.cronExpression);
        await this.db
          .update(schema.task)
          .set({
            lastRunAt: new Date(),
            nextRunAt: nextRun,
            status: 'pending', // Reset to pending for next run
          })
          .where(eq(schema.task.taskId, taskId));
      }

      return {
        taskId,
        status: 'completed',
        resultContent: result,
        summary,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error(`Task ${taskId} failed: ${error.message}`);

      await this.completeTask(taskId, {
        status: 'failed',
        errorMessage: error.message,
        duration: Date.now() - startTime,
      });

      return {
        taskId,
        status: 'failed',
        errorMessage: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if all dependencies are completed
   *
   * @param dependencyIds - Array of task IDs
   * @returns True if all completed
   */
  private async checkDependencies(dependencyIds: string[]): Promise<boolean> {
    for (const depId of dependencyIds) {
      const dep = await this.db.query.task.findFirst({
        where: (t: any) => eq(t.taskId, depId),
      });

      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Wait for workflow execution to complete
   *
   * @param executionId - Workflow execution ID
   * @returns Workflow result
   */
  private async waitForWorkflowCompletion(executionId: string): Promise<any> {
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const execution = await this.db.query.workflowExecution.findFirst(
        {
          where: (e: any) => eq(e.executionId, executionId),
        },
      );

      if (!execution) {
        throw new Error(`Workflow execution ${executionId} not found`);
      }

      if (execution.status === 'completed') {
        return execution.outputData;
      }

      if (execution.status === 'failed' || execution.status === 'cancelled') {
        throw new Error(
          execution.errorMessage || `Workflow ${execution.status}`,
        );
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Workflow execution timeout');
  }

  /**
   * Complete a task
   *
   * @param taskId - The task ID
   * @param result - Execution result
   */
  private async completeTask(
    taskId: string,
    result: {
      status: 'completed' | 'failed';
      resultContent?: any;
      summary?: string;
      errorMessage?: string;
      duration: number;
    },
  ) {
    await this.db
      .update(schema.task)
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

  /**
   * Get next executable task for an agent in a session
   * Used by runAgent to find next task to execute
   *
   * @param agentId - The agent ID
   * @param sessionId - The session ID
   * @returns Next task or null
   */
  async getNextExecutableTask(agentId: string, sessionId: string) {
    // Find pending tasks in this session, ordered by priority
    const tasks = await this.db.query.task.findMany({
      where: (t: any) =>
        and(
          eq(t.agentId, agentId),
          eq(t.sessionId, sessionId),
          eq(t.status, 'pending'),
        ),
      orderBy: (t: any, { desc, asc }: any) => [desc(t.priority), asc(t.createdAt)],
    });

    // Find first task with dependencies met
    for (const task of tasks) {
      // Skip scheduled tasks that aren't due yet
      if (task.nextRunAt && task.nextRunAt > new Date()) {
        continue;
      }

      // Check dependencies
      if (task.dependsOn && task.dependsOn.length > 0) {
        const ready = await this.checkDependencies(task.dependsOn);
        if (!ready) {
          continue;
        }
      }

      return task;
    }

    return null;
  }

  /**
   * List tasks for a session
   *
   * @param sessionId - The session ID
   * @returns List of tasks
   */
  async listSessionTasks(sessionId: string) {
    return this.db.query.task.findMany({
      where: (t: any) => eq(t.sessionId, sessionId),
      orderBy: (t: any, { desc }: any) => [desc(t.createdAt)],
    });
  }

  /**
   * Cancel a task
   *
   * @param taskId - The task ID
   */
  async cancelTask(taskId: string) {
    // Unschedule if it's a cron task
    this.unscheduleTask(taskId);

    await this.db
      .update(schema.task)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(schema.task.taskId, taskId));

    this.logger.log(`Cancelled task ${taskId}`);

    return { success: true };
  }

  /**
   * Delete a task
   *
   * @param taskId - The task ID
   */
  async deleteTask(taskId: string) {
    // Unschedule if it's a cron task
    this.unscheduleTask(taskId);

    const result = await this.db
      .delete(schema.task)
      .where(eq(schema.task.taskId, taskId))
      .returning();

    if (!result.length) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    this.logger.log(`Deleted task ${taskId}`);

    return { success: true };
  }

  /**
   * Cleanup: Stop all scheduled jobs
   */
  onModuleDestroy() {
    for (const [taskId, job] of this.scheduledJobs.entries()) {
      job.stop();
      this.logger.log(`Stopped scheduled task ${taskId}`);
    }
    this.scheduledJobs.clear();
  }
}
