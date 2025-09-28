import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';
import { and, eq, not, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export interface TaskContext {
  objective: string; // What exactly should be achieved by this task
  inputs: Record<string, any>; // Raw data or information needed
  references?: string[]; // Related resources, links, or resource_ids
  constraints?: string[]; // Time, formatting, or technical constraints
  evaluationCriteria?: string[]; // What defines success for the task
  dependencies?: string[]; // Any implicit dependency description
  agentMemory?: Record<string, any>; // Agent-specific state or memory
  reasoningStrategy?: string; // Suggest a strategy e.g., "step-by-step", "use tool first", etc.
  expectedOutputType:
    | 'text'
    | 'code'
    | 'image'
    | 'video'
    | 'audio'
    | 'csv'
    | 'pdf';
  // Expected output type
}

export interface CreateTaskDto {
  agentId: string;
  goalId: string;
  sessionId: string;
  title: string;
  description: string;
  context: TaskContext;
  tools: string[];
  priority?: number;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  estimatedDuration?: number;
  dependencyTaskIds?: string[];
  isRecurring?: boolean;
  metadata?: Record<string, any>;
}

@Injectable()
export class TaskService {
  constructor(private readonly db: DatabaseService) {}

  async create(dto: CreateTaskDto) {
    const taskId = uuid();
    await this.db.insert(schema.task).values({
      taskId,
      agentId: dto.agentId,
      goalId: dto.goalId,
      sessionId: dto.sessionId,
      title: dto.title,
      description: dto.description,
      context: dto.context,
      priority: dto.priority ?? 0,
      estimatedDuration: dto.estimatedDuration,
      scheduledStart: dto.scheduledStart
        ? new Date(dto.scheduledStart)
        : new Date(),
      scheduledEnd: dto.scheduledEnd
        ? new Date(dto.scheduledEnd)
        : new Date(Date.now() + (dto.estimatedDuration || 0) * 1000),
      status: 'pending',
      progress: 0,
      isRecurring: dto.isRecurring,
      tools: dto.tools,
      metadata: dto.metadata,
    });

    if (dto.dependencyTaskIds?.length) {
      await this.db.insert(schema.taskDependency).values(
        dto.dependencyTaskIds.map((depId) => ({
          dependentTaskId: taskId,
          dependencyTaskId: depId,
        })),
      );
    }
    return this.get(taskId);
  }

  async get(taskId: string) {
    const row = await this.db.query.task.findFirst({
      where: (t) => eq(t.taskId, taskId),
    });
    if (!row) throw new NotFoundException('Task not found');
    return row;
  }

  /** Next task whose dependencies are all completed */
  async getNextExecutable(agentId: string, sessionId: string) {
    console.log('getNextExecutable', agentId);
    //from the candidate tasks order by priority and filter out tasks that have dependencies
    const tasks = await this.db
      .select({
        taskId: schema.task.taskId,
        title: schema.task.title,
        description: schema.task.description,
        status: schema.task.status,
        priority: schema.task.priority,
        scheduledStart: schema.task.scheduledStart,
        scheduledEnd: schema.task.scheduledEnd,
        actualStart: schema.task.actualStart,
        actualEnd: schema.task.actualEnd,
        estimatedDuration: schema.task.estimatedDuration,
        progress: schema.task.progress,
        isRecurring: schema.task.isRecurring,
        context: schema.task.context,
        tools: schema.task.tools,
        metadata: schema.task.metadata,
        summary: schema.task.summary,
        resultContent: schema.task.resultContent,
        createdAt: schema.task.createdAt,
        updatedAt: schema.task.updatedAt,
      })
      .from(schema.task)
      .where(
        and(
          eq(schema.task.agentId, agentId),
          not(eq(schema.task.status, 'completed')),
          not(eq(schema.task.status, 'failed')),
          eq(schema.task.sessionId, sessionId),
          not(
            sql`${schema.task.taskId} IN (SELECT ${schema.taskDependency.dependencyTaskId} FROM ${schema.taskDependency})`,
          ),
        ),
      )
      .orderBy((t) => [t.priority])
      .limit(1);

    const task = Array.isArray(tasks) && tasks.length > 0 ? tasks[0] : null;
    if (!task) return null;
    const dependencies = await this.db.query.taskDependency.findMany({
      where: (td) => eq(td.dependentTaskId, task.taskId),
    });
    return {
      ...task,
      dependencies: dependencies.map((d) => d.dependencyTaskId),
    };
  }

  async start(taskId: string) {
    await this.db
      .update(schema.task)
      .set({ status: 'started', actualStart: new Date() })
      .where(eq(schema.task.taskId, taskId));
  }

  //update task progress: if  task has reached its finality either competed or failed, always provide the actualEnd date, summary and resultContent
  async updateProgress(
    taskId: string,
    progress: number,
    status: string,
    resultContent: string,
    summary: string,
    context: TaskContext,
    scheduledEnd?: Date,
    estimatedDuration?: number,
    metadata?: Record<string, any>,
  ) {
    const currentContext = await this.db.query.task.findFirst({
      where: (t) => eq(t.taskId, taskId),
      columns: { context: true },
    });
    if (!currentContext) throw new NotFoundException('Task not found');
    //for the context only update fields that are not null or empty - if fields are empt or null maintain previous values. If context is not provided maintain the previous context
    const newContext = {
      ...currentContext.context,
      ...context,
      ...(context.objective ? { objective: context.objective } : {}),
      ...(context.inputs ? { inputs: context.inputs } : {}),
      ...(context.references ? { references: context.references } : {}),
      ...(context.constraints ? { constraints: context.constraints } : {}),
      ...(context.evaluationCriteria
        ? { evaluationCriteria: context.evaluationCriteria }
        : {}),
      ...(context.dependencies ? { dependencies: context.dependencies } : {}),
      ...(context.agentMemory ? { agentMemory: context.agentMemory } : {}),
      ...(context.reasoningStrategy
        ? { reasoningStrategy: context.reasoningStrategy }
        : {}),
      ...(context.expectedOutputType
        ? { expectedOutputType: context.expectedOutputType }
        : {}),
    };

    await this.db
      .update(schema.task)
      .set({
        progress,
        status,
        scheduledEnd,
        resultContent,
        summary,
        context: newContext,
        estimatedDuration,
        metadata,
        updatedAt: new Date(),
        ...(status === 'completed' && {
          actualEnd: new Date(),
          completedAt: new Date(),
        }),
      })
      .where(eq(schema.task.taskId, taskId));
    return this.get(taskId);
  }
}
