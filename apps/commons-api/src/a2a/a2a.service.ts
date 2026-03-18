import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { filter, firstValueFrom } from 'rxjs';
import { DatabaseService } from '../modules/database';
import { AgentService } from '../agent/agent.service';
import * as schema from '../../models/schema';
import {
  A2ATask,
  A2ATaskState,
  A2AMessage,
  A2AArtifact,
  AgentCard,
  A2ASkill,
  PushNotificationConfig,
  RPC_ERRORS,
} from './a2a.types';

@Injectable()
export class A2aService {
  private readonly logger = new Logger(A2aService.name);

  /** In-memory subscribers for SSE streaming: taskId → set of writer callbacks */
  private readonly subscribers = new Map<string, Set<(event: any) => void>>();

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
  ) {}

  // ── Agent Card ─────────────────────────────────────────────────────────────

  /**
   * Build and return the A2A Agent Card for an agent.
   * Served at GET /.well-known/agent.json?agentId=xxx
   * or at GET /v1/a2a/:agentId/.well-known/agent.json
   */
  async getAgentCard(agentId: string, baseUrl: string): Promise<AgentCard> {
    const agent = await this.db.query.agent.findFirst({
      where: (a) => eq(a.agentId, agentId),
    });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);

    const skills: A2ASkill[] = ((agent as any).a2aSkills ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ?? [],
      inputModes: s.inputModes ?? ['text/plain'],
      outputModes: s.outputModes ?? ['text/plain'],
    }));

    return {
      name: agent.name,
      description: agent.instructions ?? undefined,
      url: `${baseUrl}/v1/a2a/${agentId}`,
      version: '1.0.0',
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ['text/plain', 'application/json'],
      defaultOutputModes: ['text/plain', 'application/json'],
      skills,
    };
  }

  // ── tasks/send ─────────────────────────────────────────────────────────────

  /**
   * Handle an inbound A2A task synchronously.
   * Creates the task, dispatches it to the agent runtime, and waits for completion.
   */
  async sendTask(params: {
    agentId: string;
    taskId?: string;
    contextId?: string;
    message: A2AMessage;
    callerId?: string;
    callerUrl?: string;
    pushNotification?: PushNotificationConfig;
  }): Promise<A2ATask> {
    const taskId = params.taskId ?? randomUUID();
    const now = new Date();

    // Persist the task
    await this.db.insert(schema.a2aTask).values({
      taskId,
      agentId: params.agentId,
      state: 'submitted',
      callerId: params.callerId ?? null,
      callerUrl: params.callerUrl ?? null,
      contextId: params.contextId ?? null,
      inputMessage: params.message as any,
      pushUrl: params.pushNotification?.url ?? null,
      pushToken: params.pushNotification?.token ?? null,
    } as any);

    this.logger.log(`A2A task ${taskId} submitted for agent ${params.agentId}`);

    // Transition to 'working' and dispatch
    await this.updateState(taskId, 'working');

    try {
      const { text, artifacts } = await this.dispatchToAgent(params.agentId, params.message, taskId, params.callerId);

      const outputMessage: A2AMessage = {
        role: 'agent',
        parts: [{ type: 'text', text }],
        taskId,
        contextId: params.contextId,
      };

      await this.db.update(schema.a2aTask)
        .set({
          state: 'completed',
          outputMessages: [outputMessage] as any,
          artifacts: artifacts as any ?? null,
          completedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.a2aTask.taskId, taskId));

      this.emit(taskId, { type: 'task', task: await this.buildTaskResponse(taskId) });
      this.emit(taskId, { type: 'close' });

      return this.buildTaskFromRow(
        taskId, params.agentId, 'completed', params.contextId,
        params.message, outputMessage, artifacts,
      );
    } catch (error: any) {
      this.logger.error(`A2A task ${taskId} failed: ${error.message}`);
      await this.db.update(schema.a2aTask)
        .set({
          state: 'failed',
          error: { code: RPC_ERRORS.INTERNAL_ERROR.code, message: error.message } as any,
          completedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.a2aTask.taskId, taskId));

      this.emit(taskId, { type: 'task', task: await this.buildTaskResponse(taskId) });
      this.emit(taskId, { type: 'close' });

      return this.buildTaskFromRow(
        taskId, params.agentId, 'failed', params.contextId, params.message,
      );
    }
  }

  // ── tasks/sendSubscribe ────────────────────────────────────────────────────

  /** Terminal states — no more events will follow. */
  private static readonly TERMINAL_STATES: A2ATaskState[] = ['completed', 'failed', 'canceled'];

  /**
   * Create a task and start streaming updates to the caller.
   * Returns an async generator that yields SSE-style events.
   *
   * Resilience: if a container restart caused the in-memory subscriber to be
   * lost mid-stream, this method detects a pre-existing terminal task in the DB
   * and replays its final status immediately, avoiding the client hanging forever.
   * For tasks still running after a restart, a DB-polling fallback kicks in
   * after STALL_TIMEOUT_MS of in-memory silence.
   */
  async *sendSubscribeTask(params: {
    agentId: string;
    taskId?: string;
    contextId?: string;
    message: A2AMessage;
    callerId?: string;
    pushNotification?: PushNotificationConfig;
  }): AsyncGenerator<{ type: string; data: any }> {
    const STALL_TIMEOUT_MS = 5_000; // switch to DB polling if no in-memory event in 5s
    const DB_POLL_INTERVAL_MS = 1_000;

    const taskId = params.taskId ?? randomUUID();

    // ── Fast path: task already terminal in DB (reconnect after restart) ────
    if (params.taskId) {
      const existing = await this.db.query.a2aTask.findFirst({
        where: (t: any) => eq(t.taskId, params.taskId!),
      } as any);
      if (existing) {
        const state = (existing as any).state as A2ATaskState;
        if (A2aService.TERMINAL_STATES.includes(state)) {
          const task = await this.buildTaskResponse(taskId);
          const isFinal = true;
          if (task.artifacts?.length) {
            yield { type: 'TaskArtifactUpdateEvent', data: { taskId, contextId: params.contextId, artifact: task.artifacts[0], final: isFinal } };
          }
          yield { type: 'TaskStatusUpdateEvent', data: { taskId, contextId: params.contextId, status: task.status, final: isFinal } };
          return;
        }
      }
    }

    const eventQueue: any[] = [];
    let done = false;
    let lastEventAt = Date.now();

    const push = (event: any) => {
      eventQueue.push(event);
      lastEventAt = Date.now();
      if (event.type === 'close') done = true;
    };

    this.subscribe(taskId, push);

    // Fire-and-forget the task; events flow through the subscriber
    this.sendTask({ ...params, taskId }).catch((e) => {
      push({ type: 'error', message: e.message });
      push({ type: 'close' });
    });

    // Yield working status immediately
    yield {
      type: 'TaskStatusUpdateEvent',
      data: {
        taskId,
        contextId: params.contextId,
        status: { state: 'working', timestamp: new Date().toISOString() },
        final: false,
      },
    };

    // ── Event loop: drain in-memory queue with DB-polling fallback ───────────
    while (!done || eventQueue.length > 0) {
      while (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        if (event.type === 'close') {
          this.unsubscribe(taskId, push);
          return;
        }
        if (event.type === 'task') {
          const task: A2ATask = event.task;
          const isFinal = A2aService.TERMINAL_STATES.includes(task.status.state);
          if (task.artifacts?.length) {
            yield { type: 'TaskArtifactUpdateEvent', data: { taskId, contextId: params.contextId, artifact: task.artifacts[0], final: isFinal } };
          }
          yield { type: 'TaskStatusUpdateEvent', data: { taskId, contextId: params.contextId, status: task.status, final: isFinal } };
        }
      }

      if (!done) {
        // DB-polling fallback: if no in-memory event for STALL_TIMEOUT_MS, poll the DB directly
        if (Date.now() - lastEventAt > STALL_TIMEOUT_MS) {
          const row = await this.db.query.a2aTask.findFirst({
            where: (t: any) => eq(t.taskId, taskId),
          } as any).catch(() => null);

          if (row) {
            const state = (row as any).state as A2ATaskState;
            if (A2aService.TERMINAL_STATES.includes(state)) {
              const task = await this.buildTaskResponse(taskId);
              const isFinal = true;
              yield { type: 'TaskStatusUpdateEvent', data: { taskId, contextId: params.contextId, status: task.status, final: isFinal } };
              this.unsubscribe(taskId, push);
              return;
            }
          }
          lastEventAt = Date.now(); // reset to avoid hammering DB on every loop
        }

        await new Promise((r) => setTimeout(r, DB_POLL_INTERVAL_MS));
      }
    }

    this.unsubscribe(taskId, push);
  }

  // ── tasks/get ──────────────────────────────────────────────────────────────

  async getTask(taskId: string): Promise<A2ATask> {
    const row = await this.db.query.a2aTask.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    } as any);
    if (!row) throw new NotFoundException(`A2A task ${taskId} not found`);
    return this.buildTaskResponse(taskId);
  }

  // ── tasks/cancel ──────────────────────────────────────────────────────────

  async cancelTask(taskId: string): Promise<A2ATask> {
    const row = await this.db.query.a2aTask.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    } as any);
    if (!row) throw new NotFoundException(`A2A task ${taskId} not found`);

    const state = (row as any).state as A2ATaskState;
    if (state === 'completed' || state === 'failed' || state === 'canceled') {
      const err = RPC_ERRORS.TASK_NOT_CANCELABLE;
      throw Object.assign(new Error(err.message), { code: err.code });
    }

    await this.updateState(taskId, 'canceled');
    this.emit(taskId, { type: 'close' });
    return this.buildTaskResponse(taskId);
  }

  // ── Push notification config ───────────────────────────────────────────────

  async setPushNotificationConfig(taskId: string, config: PushNotificationConfig): Promise<void> {
    await this.db.update(schema.a2aTask)
      .set({ pushUrl: config.url, pushToken: config.token ?? null, updatedAt: new Date() } as any)
      .where(eq(schema.a2aTask.taskId, taskId));
  }

  async getPushNotificationConfig(taskId: string): Promise<PushNotificationConfig | null> {
    const row = await this.db.query.a2aTask.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    } as any);
    if (!row || !(row as any).pushUrl) return null;
    return { url: (row as any).pushUrl, token: (row as any).pushToken ?? undefined };
  }

  // ── List tasks ─────────────────────────────────────────────────────────────

  async listTasks(agentId: string, limit = 50): Promise<A2ATask[]> {
    const rows = await this.db.query.a2aTask.findMany({
      where: (t: any) => eq(t.agentId, agentId),
      limit,
      orderBy: (t: any, { desc }: any) => [desc(t.createdAt)],
    } as any);
    return Promise.all(rows.map((r: any) => this.buildTaskResponse(r.taskId)));
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async updateState(taskId: string, state: A2ATaskState): Promise<void> {
    await this.db.update(schema.a2aTask)
      .set({ state, updatedAt: new Date() } as any)
      .where(eq(schema.a2aTask.taskId, taskId));
  }

  private async buildTaskResponse(taskId: string): Promise<A2ATask> {
    const row = await this.db.query.a2aTask.findFirst({
      where: (t: any) => eq(t.taskId, taskId),
    } as any);
    if (!row) throw new NotFoundException(`A2A task ${taskId} not found`);
    const r = row as any;

    const outputMsgs: A2AMessage[] = r.outputMessages ?? [];
    const lastOutput = outputMsgs[outputMsgs.length - 1];

    return {
      id: r.taskId,
      contextId: r.contextId ?? undefined,
      status: {
        state: r.state as A2ATaskState,
        message: lastOutput,
        timestamp: (r.updatedAt ?? r.createdAt).toISOString(),
      },
      artifacts: r.artifacts ?? undefined,
      history: [r.inputMessage, ...(r.outputMessages ?? [])].filter(Boolean),
    };
  }

  private buildTaskFromRow(
    taskId: string,
    agentId: string,
    state: A2ATaskState,
    contextId?: string,
    inputMessage?: A2AMessage,
    outputMessage?: A2AMessage,
    artifacts?: A2AArtifact[],
  ): A2ATask {
    return {
      id: taskId,
      contextId,
      status: {
        state,
        message: outputMessage,
        timestamp: new Date().toISOString(),
      },
      artifacts,
      history: [inputMessage, outputMessage].filter(Boolean) as A2AMessage[],
    };
  }

  /**
   * Dispatch the A2A message to the real LangGraph agent runtime.
   * Subscribes to the runAgent Observable and resolves when the 'final' event arrives.
   */
  private async dispatchToAgent(
    agentId: string,
    message: A2AMessage,
    taskId: string,
    callerId?: string,
  ): Promise<{ text: string; artifacts?: A2AArtifact[] }> {
    // Build prompt from the first text part; fall back to JSON for data/file parts
    const textPart = message.parts.find((p) => p.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    const prompt = textPart?.text ?? JSON.stringify(message.parts);

    this.logger.log(`A2A task ${taskId}: running agent ${agentId}`);

    // Run the agent and wait for the 'final' event.
    // runAgent returns an Observable — we subscribe and resolve on the first final event.
    const finalEvent = await firstValueFrom(
      this.agentService
        .runAgent({
          agentId,
          messages: [{ role: 'user', content: prompt }],
          // Use the caller's ID as initiator so session attribution is correct.
          // Fall back to agentId itself (self-triggered) when no caller is provided.
          initiator: callerId ?? agentId,
          stream: false,
        })
        .pipe(filter((event: any) => event.type === 'final')),
    );

    // Extract the text content from the LangGraph final message payload.
    // The payload mirrors LangChain message.toDict() — content is either a
    // string (most models) or an array of content blocks (Anthropic, etc.).
    const payload = (finalEvent as any)?.payload ?? {};
    let text: string;

    if (typeof payload.content === 'string') {
      text = payload.content;
    } else if (Array.isArray(payload.content)) {
      text = payload.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text as string)
        .join('\n');
    } else {
      // Fallback: serialise whatever came back so the caller always gets something
      text = JSON.stringify(payload);
    }

    this.logger.log(`A2A task ${taskId}: agent completed (${text.length} chars)`);
    return { text };
  }

  // ── SSE pub/sub ───────────────────────────────────────────────────────────

  private subscribe(taskId: string, fn: (event: any) => void): void {
    if (!this.subscribers.has(taskId)) this.subscribers.set(taskId, new Set());
    this.subscribers.get(taskId)!.add(fn);
  }

  private unsubscribe(taskId: string, fn: (event: any) => void): void {
    this.subscribers.get(taskId)?.delete(fn);
    if (this.subscribers.get(taskId)?.size === 0) this.subscribers.delete(taskId);
  }

  private emit(taskId: string, event: any): void {
    for (const fn of this.subscribers.get(taskId) ?? []) {
      try { fn(event); } catch (e) { /* subscriber error — ignore */ }
    }
  }
}
