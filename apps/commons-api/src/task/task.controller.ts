import { Controller, Post, Put, Body, Param } from '@nestjs/common';
import { TaskService, TaskContext } from './task.service';

@Controller({ version: '1', path: 'tasks' })
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Post()
  async create(@Body() body: any) {
    return { data: await this.tasks.create(body) };
  }

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
}
