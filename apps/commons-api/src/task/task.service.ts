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
  sessionId: string;
  title: string;
  description: string;
  context: TaskContext;
  tools: string[];
  priority?: number;
  scheduledFor?: Date;
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
      sessionId: dto.sessionId,
      title: dto.title,
      description: dto.description,
      context: dto.context,
      priority: dto.priority ?? 0,
      estimatedDuration: dto.estimatedDuration,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      status: 'pending',
      progress: 0,
      isRecurring: dto.isRecurring,
      tools: dto.tools,
      metadata: dto.metadata,
      dependsOn: dto.dependencyTaskIds,
      createdBy: dto.agentId,
      createdByType: 'agent',
    });
    return this.get(taskId);
  }

  async get(taskId: string) {
    const row = await this.db.query.task.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    });
    if (!row) throw new NotFoundException('Task not found');
    return row;
  }

  /** Next task whose dependencies are all completed */
  async getNextExecutable(agentId: string, sessionId: string) {
    console.log('getNextExecutable', agentId);
    // Get all tasks for this agent/session that are not completed/failed
    const tasks = await this.db.query.task.findMany({
      where: (t: any) =>
        and(
          eq(t.agentId, agentId),
          eq(t.sessionId, sessionId),
          not(eq(t.status, 'completed')),
          not(eq(t.status, 'failed')),
        ),
      orderBy: (t: any, { desc }: any) => [desc(t.priority), t.createdAt],
    });

    // Filter to tasks with no dependencies or all dependencies completed
    for (const task of tasks) {
      if (!task.dependsOn || task.dependsOn.length === 0) {
        return task; // No dependencies
      }

      // Check if all dependencies are completed
      const depTasks = await this.db.query.task.findMany({
        where: (t: any) =>
          sql`${t.taskId} = ANY(${task.dependsOn})`,
      });

      const allCompleted = depTasks.every((dep) => dep.status === 'completed');
      if (allCompleted) {
        return task;
      }
    }

    return null;
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
    scheduledEnd?: Date, // Deprecated parameter, kept for backward compatibility
    estimatedDuration?: number,
    metadata?: Record<string, any>,
  ) {
    const currentContext = await this.db.query.task.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
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
