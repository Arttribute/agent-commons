import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  Sse,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { eq } from 'drizzle-orm';
import { TaskService, TaskContext } from './task.service';
import { TaskExecutionService } from './task-execution.service';
import { DatabaseService } from '../modules/database';
import * as schema from '../../models/schema';
import { OwnerGuard, OwnerOnly } from '~/modules/auth';

@Controller({ version: '1', path: 'tasks' })
export class TaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly taskExecution: TaskExecutionService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Create a new task (with enhanced features and workflow support)
   * POST /v1/tasks
   */
  @Post()
  async create(
    @Body()
    body: {
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
    },
  ) {
    const task = await this.taskExecution.createTask(body);
    // createTask() already calls scheduler.scheduleRun() — immediate tasks get
    // scheduledFor=now() so the scheduler picks them up within 15 s.
    return { data: task };
  }

  /**
   * List tasks by session, agent, or owner
   * GET /v1/tasks?sessionId=xxx
   * GET /v1/tasks?agentId=xxx
   * GET /v1/tasks?ownerId=xxx&ownerType=user
   */
  @Get()
  async listTasks(
    @Query('sessionId') sessionId?: string,
    @Query('agentId') agentId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('ownerType') ownerType?: 'user' | 'agent',
  ) {
    if (sessionId) {
      const tasks = await this.taskExecution.listSessionTasks(sessionId);
      return { data: tasks };
    }

    if (agentId) {
      const tasks = await this.taskExecution.listAgentTasks(agentId);
      return { data: tasks };
    }

    if (ownerId && ownerType) {
      const tasks = await this.taskExecution.listTasksByOwner(
        ownerId,
        ownerType,
      );
      return { data: tasks };
    }

    throw new BadRequestException(
      'Either sessionId, agentId, or ownerId+ownerType is required',
    );
  }

  /**
   * Get task by ID
   * GET /v1/tasks/:id
   */
  @Get(':id')
  async getTask(@Param('id') taskId: string) {
    const task = await this.tasks.get(taskId);
    return { data: task };
  }

  /**
   * Update task progress (legacy endpoint)
   * PUT /v1/tasks/:id
   */
  @Put(':taskId')
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'task' })
  async updateProgress(
    @Param('taskId') taskId: string,
    @Body()
    body: {
      progress: number;
      status: string;
      resultContent: string;
      summary: string;
      context: TaskContext;
      scheduledEnd?: Date;
      estimatedDuration?: number;
      metadata?: Record<string, any>;
    },
  ) {
    return {
      data: await this.tasks.updateProgress(
        taskId,
        body.progress,
        body.status,
        body.resultContent,
        body.summary,
        body.context,
        body.scheduledEnd,
        body.estimatedDuration,
        body.metadata,
      ),
    };
  }

  /**
   * Delete a task
   * DELETE /v1/tasks/:id
   */
  @Delete(':id')
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'task', idParam: 'id' })
  async deleteTask(@Param('id') taskId: string) {
    await this.taskExecution.deleteTask(taskId);
    return { success: true, message: 'Task deleted' };
  }

  /**
   * Cancel a task
   * POST /v1/tasks/:id/cancel
   */
  @Post(':id/cancel')
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'task', idParam: 'id' })
  async cancelTask(@Param('id') taskId: string) {
    const result = await this.taskExecution.cancelTask(taskId);
    return result;
  }

  /**
   * Manually execute a task
   * POST /v1/tasks/:id/execute
   */
  @Post(':id/execute')
  async executeTask(@Param('id') taskId: string) {
    const result = await this.taskExecution.executeTask(taskId);
    return {
      success: result.status === 'completed',
      data: result,
    };
  }

  /**
   * Stream task status updates as SSE
   * GET /v1/tasks/:id/stream
   *
   * Emits events:
   *   { type: 'status', status, progress }
   *   { type: 'completed', resultContent, summary }
   *   { type: 'failed', errorMessage }
   *   { type: 'keepalive' }  — every 5s
   */
  @Get(':id/stream')
  @Sse(':id/stream')
  streamTask(@Param('id') taskId: string, @Req() req: Request): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let lastStatus = '';
      let closed = false;

      const keepalive = setInterval(() => {
        if (!closed) subscriber.next({ data: JSON.stringify({ type: 'keepalive' }) } as any);
      }, 5000);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const task = await this.db.query.task.findFirst({ where: (t: any) => eq(t.taskId, taskId) });
          if (!task) { subscriber.next({ data: JSON.stringify({ type: 'error', message: 'Task not found' }) } as any); subscriber.complete(); return; }
          if (task.status !== lastStatus) {
            lastStatus = task.status;
            subscriber.next({ data: JSON.stringify({ type: 'status', status: task.status, progress: task.progress }) } as any);
          }
          if (task.status === 'completed') {
            subscriber.next({ data: JSON.stringify({ type: 'completed', resultContent: task.resultContent, summary: task.summary }) } as any);
            subscriber.complete();
          } else if (task.status === 'failed' || task.status === 'cancelled') {
            subscriber.next({ data: JSON.stringify({ type: task.status, errorMessage: task.errorMessage }) } as any);
            subscriber.complete();
          }
        } catch (err: any) {
          subscriber.next({ data: JSON.stringify({ type: 'error', message: err.message }) } as any);
          subscriber.complete();
        }
      }, 750);

      req.on('close', () => { closed = true; clearInterval(keepalive); clearInterval(poll); });
      return () => { closed = true; clearInterval(keepalive); clearInterval(poll); };
    });
  }
}
