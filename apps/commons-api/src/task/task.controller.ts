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
} from '@nestjs/common';
import { TaskService, TaskContext } from './task.service';
import { TaskExecutionService } from './task-execution.service';

@Controller({ version: '1', path: 'tasks' })
export class TaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly taskExecution: TaskExecutionService,
  ) {}

  /**
   * Create a new task (with workflow support)
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
      context?: Record<string, any>;
      priority?: number;
      createdBy: string;
      createdByType: 'user' | 'agent';
    },
  ) {
    // If this is a workflow-based task, use TaskExecutionService
    if (body.executionMode === 'workflow' || body.workflowId) {
      const task = await this.taskExecution.createTask(body);
      return { data: task };
    }

    // Otherwise, use the old TaskService for backward compatibility
    return { data: await this.tasks.create(body as any) };
  }

  /**
   * List tasks by session
   * GET /v1/tasks?sessionId=xxx
   */
  @Get()
  async listTasks(@Query('sessionId') sessionId?: string) {
    if (!sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    const tasks = await this.taskExecution.listSessionTasks(sessionId);
    return { data: tasks };
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
  async deleteTask(@Param('id') taskId: string) {
    await this.taskExecution.deleteTask(taskId);
    return { success: true, message: 'Task deleted' };
  }

  /**
   * Cancel a task
   * POST /v1/tasks/:id/cancel
   */
  @Post(':id/cancel')
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
}
