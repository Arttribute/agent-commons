import * as crypto from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type {
  Action,
  Attribution,
  Entity,
  ProvenanceBundle,
  Resource,
} from '@provenancekit/eaa-types';
import { CONTEXT_URI } from '@provenancekit/eaa-types';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import type {
  FinishProvenanceRunInput,
  ProvenanceCaptureMode,
  RecordProvenanceEventInput,
  StartProvenanceRunInput,
} from './provenance.types';

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_FLUSH_MS = 40;
const DEFAULT_QUEUE_LIMIT = 5_000;
const MAX_CAPTURE_BYTES = 24_000;
const MAX_DEPTH = 6;

const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|secret|api[-_]?key|private[-_]?key|access[-_]?token|refresh[-_]?token)$/i;
const PRIVATE_REASONING_KEY = /^(reasoning|thinking|chain[-_ ]?of[-_ ]?thought|internal[-_ ]?thoughts?)$/i;

type RunContext = {
  input: StartProvenanceRunInput;
  mode: Exclude<ProvenanceCaptureMode, 'off'>;
  onchain: boolean;
  sequence: number;
  dropped: number;
  startedAt: Date;
};

type QueuedStart = {
  kind: 'start';
  value: typeof schema.provenanceRun.$inferInsert;
};
type QueuedEvent = {
  kind: 'event';
  value: typeof schema.provenanceEvent.$inferInsert;
};
type QueuedFinish = {
  kind: 'finish';
  traceId: string;
  value: Partial<typeof schema.provenanceRun.$inferInsert>;
  shouldExport: boolean;
};
type QueueItem = QueuedStart | QueuedEvent | QueuedFinish;

function sha256(value: unknown): string | undefined {
  try {
    const input =
      typeof value === 'string' ? value : JSON.stringify(value ?? null);
    return `sha256:${crypto.createHash('sha256').update(input).digest('hex')}`;
  } catch {
    return undefined;
  }
}

function truncate(value: string, limit = MAX_CAPTURE_BYTES): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}…[truncated ${value.length - limit} chars]`;
}

/** JSON-safe, bounded and secret-aware copy used only for explicit full capture. */
function sanitize(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol')
    return `[${typeof value}]`;
  if (depth >= MAX_DEPTH) return '[max-depth]';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return { type: 'bytes', size: value.byteLength, sha256: sha256(value) };
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitize(item, depth + 1, seen));
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    output[key] = PRIVATE_REASONING_KEY.test(key)
      ? '[not captured]'
      : SENSITIVE_KEY.test(key)
      ? '[redacted]'
      : sanitize(child, depth + 1, seen);
  }
  return output;
}

/** Privacy-preserving structural description used by the default mode. */
function describe(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return { type: 'null' };
  if (typeof value === 'string')
    return { type: 'string', characters: value.length, sha256: sha256(value) };
  if (typeof value === 'number' || typeof value === 'boolean')
    return { type: typeof value };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      ...(depth < 2
        ? { items: value.slice(0, 20).map((item) => describe(item, depth + 1)) }
        : {}),
    };
  }
  if (value instanceof Uint8Array || Buffer.isBuffer(value))
    return { type: 'bytes', size: value.byteLength, sha256: sha256(value) };
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: 'object',
      keys: entries
        .map(([key]) => key)
        .filter((key) => !SENSITIVE_KEY.test(key) && !PRIVATE_REASONING_KEY.test(key))
        .slice(0, 50),
      ...(depth < 2
        ? {
            fields: Object.fromEntries(
              entries
                .filter(
                  ([key]) =>
                    !SENSITIVE_KEY.test(key) && !PRIVATE_REASONING_KEY.test(key),
                )
                .slice(0, 30)
                .map(([key, child]) => [key, describe(child, depth + 1)]),
            ),
          }
        : {}),
    };
  }
  return { type: typeof value };
}

@Injectable()
export class ProvenanceService implements OnApplicationShutdown {
  private readonly logger = new Logger(ProvenanceService.name);
  private readonly runs = new Map<string, RunContext>();
  private readonly queue: QueueItem[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private flushPromise?: Promise<void>;
  private retryMs = 100;

  constructor(private readonly db: DatabaseService) {}

  startRun(input: StartProvenanceRunInput): boolean {
    const requested = input.options?.mode ?? this.defaultMode();
    if (requested === 'off') return false;
    const mode: RunContext['mode'] =
      requested === 'full' && process.env.PROVENANCE_FULL_CAPTURE_ENABLED !== 'false'
        ? 'full'
        : 'metadata';
    const onchainRequested = Boolean(input.options?.onchain);
    const onchain =
      onchainRequested &&
      process.env.PROVENANCE_ONCHAIN_ENABLED === 'true';
    const startedAt = new Date();
    const context: RunContext = {
      input,
      mode,
      onchain,
      sequence: 0,
      dropped: 0,
      startedAt,
    };
    this.runs.set(input.traceId, context);
    this.enqueue({
      kind: 'start',
      value: {
        traceId: input.traceId,
        sessionId: input.sessionId,
        agentId: input.agentId,
        initiator: input.initiator,
        workspaceId: input.workspaceId,
        captureMode: mode,
        provider: input.provider,
        modelId: input.modelId,
        onchainRequested,
        anchorStatus: onchain
          ? 'pending'
          : onchainRequested
            ? 'unavailable'
            : 'not_requested',
        startedAt,
        metadata: {
          schema: 'https://provenancekit.com/context/v2',
          framework: 'langgraph',
          runtime: 'agent-commons',
          requestedMode: requested,
          onchainEnabled: process.env.PROVENANCE_ONCHAIN_ENABLED === 'true',
          ...input.metadata,
        },
      },
    });
    if (input.input !== undefined) {
      this.recordEvent(input.traceId, {
        category: 'input',
        eventType: 'user.message',
        name: 'User input',
        phase: 'input',
        summary: 'User message admitted to the agent run',
        content: input.input,
        payload: input.input,
        startedAt,
      });
    }
    return true;
  }

  recordEvent(traceId: string, event: RecordProvenanceEventInput): void {
    const context = this.runs.get(traceId);
    if (!context) return;
    const startedAt = event.startedAt ?? new Date();
    const endedAt =
      event.endedAt ??
      (event.durationMs !== undefined
        ? new Date(startedAt.getTime() + event.durationMs)
        : undefined);
    // Strip private reasoning and credentials before hashing as well as before
    // persistence, so even an opaque commitment to those fields is not kept.
    const contentHash = sha256(
      sanitize(event.content ?? event.result ?? event.payload),
    );
    const sequence = ++context.sequence;
    const actionId = `urn:agentcommons:event:${traceId}:${sequence}`;
    const actorId =
      event.category === 'input'
        ? `user:${context.input.initiator ?? 'unknown'}`
        : `agent:${context.input.agentId}`;
    const action: Action = {
      id: actionId,
      type: this.actionType(event.category),
      performedBy: actorId,
      timestamp: startedAt.toISOString(),
      inputs: [],
      outputs: contentHash
        ? [{ ref: contentHash, scheme: 'hash' as const }]
        : [],
      extensions: {
        'ext:session@1.0.0': {
          sessionId: context.input.sessionId,
          traceId,
          sequence,
        },
        'ext:agentcommons:trajectory@1.0.0': {
          category: event.category,
          eventType: event.eventType,
          phase: event.phase,
          status: event.status ?? 'completed',
          spanId: event.spanId,
          parentSpanId: event.parentSpanId,
          durationMs: event.durationMs,
        },
        ...(event.category === 'model'
          ? {
              'ext:ai@1.0.0': {
                tool: {
                  provider: context.input.provider,
                  model: context.input.modelId,
                  tokensUsed:
                    (event.inputTokens ?? 0) + (event.outputTokens ?? 0),
                  generationTime: event.durationMs,
                },
              },
            }
          : {}),
        ...(event.category === 'tool'
          ? {
              'ext:tool-attestation@1.0.0': {
                level: 'self-declared',
                outputHash: contentHash,
              },
            }
          : {}),
      },
    };
    this.enqueue({
      kind: 'event',
      value: {
        traceId,
        sessionId: context.input.sessionId,
        sequence,
        category: event.category,
        eventType: event.eventType,
        name: event.name,
        phase: event.phase,
        status: event.status ?? 'completed',
        spanId: event.spanId,
        parentSpanId: event.parentSpanId,
        summary: event.summary,
        payload: this.capture(context.mode, event.payload),
        result: this.capture(context.mode, event.result),
        contentHash,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cachedTokens: event.cachedTokens,
        costUsd: event.costUsd,
        durationMs: event.durationMs,
        eaaAction: action as unknown as Record<string, unknown>,
        metadata: event.metadata,
        startedAt,
        endedAt,
      },
    });
  }

  finishRun(traceId: string, finish: FinishProvenanceRunInput): void {
    const context = this.runs.get(traceId);
    if (!context) return;
    const endedAt = new Date();
    if (finish.output !== undefined) {
      this.recordEvent(traceId, {
        category: finish.status === 'completed' ? 'output' : 'error',
        eventType:
          finish.status === 'completed' ? 'assistant.message' : 'run.error',
        name: finish.status === 'completed' ? 'Final answer' : 'Run failed',
        phase: 'final_answer',
        status: finish.status === 'completed' ? 'completed' : 'failed',
        summary:
          finish.status === 'completed'
            ? 'Final answer emitted'
            : finish.error ?? 'Agent run failed',
        result: finish.output,
        content: finish.output,
        startedAt: endedAt,
      });
    }
    this.enqueue({
      kind: 'finish',
      traceId,
      shouldExport:
        context.onchain || process.env.PROVENANCEKIT_EXPORT_ENABLED === 'true',
      value: {
        status: finish.status,
        endedAt,
        durationMs:
          finish.durationMs ?? endedAt.getTime() - context.startedAt.getTime(),
        eventCount: context.sequence,
        droppedEventCount: context.dropped,
        inputTokens: finish.inputTokens ?? 0,
        outputTokens: finish.outputTokens ?? 0,
        cachedTokens: finish.cachedTokens ?? 0,
        costUsd: finish.costUsd ?? 0,
        updatedAt: endedAt,
      },
    });
    this.runs.delete(traceId);
    this.scheduleFlush(0);
  }

  async getSessionTrajectory(sessionId: string) {
    const runs = await this.db.query.provenanceRun.findMany({
      where: eq(schema.provenanceRun.sessionId, sessionId),
      orderBy: [asc(schema.provenanceRun.startedAt)],
    });
    if (!runs.length) {
      return { sessionId, runs: [], events: [], summary: this.summarize([], []) };
    }
    const events = await this.db.query.provenanceEvent.findMany({
      where: eq(schema.provenanceEvent.sessionId, sessionId),
      orderBy: [asc(schema.provenanceEvent.startedAt), asc(schema.provenanceEvent.sequence)],
    });
    return { sessionId, runs, events, summary: this.summarize(runs, events) };
  }

  async getRun(traceId: string) {
    return this.db.query.provenanceRun.findFirst({
      where: eq(schema.provenanceRun.traceId, traceId),
    });
  }

  async buildBundle(traceId: string): Promise<ProvenanceBundle> {
    const run = await this.getRun(traceId);
    if (!run) throw new Error('Provenance run not found');
    const events = await this.db.query.provenanceEvent.findMany({
      where: eq(schema.provenanceEvent.traceId, traceId),
      orderBy: [asc(schema.provenanceEvent.sequence)],
    });
    const userId = `user:${run.initiator ?? 'unknown'}`;
    const agentId = `agent:${run.agentId}`;
    const entities: Entity[] = [
      { id: userId, role: 'human', name: run.initiator ?? 'User' },
      {
        id: agentId,
        role: 'ai',
        name: run.modelId ?? run.agentId,
        extensions: {
          'ext:ai@1.0.0': {
            agent: {
              framework: 'langgraph',
              sessionId: run.sessionId,
              model: { provider: run.provider, model: run.modelId },
              delegatedBy: userId,
              autonomyLevel: 'supervised',
            },
          },
        },
      },
    ];
    const actions = events
      .map((event) => event.eaaAction as Action | null)
      .filter((action): action is Action => Boolean(action));
    const resources: Resource[] = events
      .filter((event) => Boolean(event.contentHash && event.eaaAction))
      .map((event) => ({
        address: { ref: event.contentHash!, scheme: 'hash' as const },
        type:
          event.category === 'tool' || event.category === 'system'
            ? 'other'
            : 'text',
        locations: [],
        createdAt: event.startedAt.toISOString(),
        createdBy: event.category === 'input' ? userId : agentId,
        rootAction: (event.eaaAction as Action).id,
        extensions: {
          'ext:agentcommons:disclosure@1.0.0': {
            captureMode: run.captureMode,
            rawContentIncluded: run.captureMode === 'full',
          },
        },
      }));
    const attributions: Attribution[] = actions.flatMap((action) => [
      {
        actionId: action.id,
        entityId: action.performedBy,
        role: 'creator' as const,
      },
      ...(action.performedBy === agentId
        ? [
            {
              actionId: action.id,
              entityId: userId,
              role: 'contributor' as const,
              note: 'Human requester/delegator',
            },
          ]
        : []),
    ]);
    return {
      context: CONTEXT_URI,
      entities,
      resources,
      actions,
      attributions,
      extensions: {
        'ext:agentcommons:run@1.0.0': {
          traceId,
          sessionId: run.sessionId,
          status: run.status,
          durationMs: run.durationMs,
          captureMode: run.captureMode,
          tokenUsage: {
            input: run.inputTokens,
            output: run.outputTokens,
            cached: run.cachedTokens,
          },
          costUsd: run.costUsd,
        },
      },
    };
  }

  async requestAnchor(traceId: string) {
    const run = await this.getRun(traceId);
    if (!run) throw new Error('Provenance run not found');
    if (process.env.PROVENANCE_ONCHAIN_ENABLED !== 'true') {
      throw new Error('On-chain provenance is not enabled for this environment');
    }
    await this.db
      .update(schema.provenanceRun)
      .set({
        onchainRequested: true,
        anchorStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(schema.provenanceRun.traceId, traceId));
    void this.exportTrace(traceId, true);
    return { traceId, status: 'pending' };
  }

  async onApplicationShutdown() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush();
  }

  private defaultMode(): ProvenanceCaptureMode {
    const value = process.env.PROVENANCE_DEFAULT_MODE;
    return value === 'off' || value === 'full' ? value : 'metadata';
  }

  private capture(mode: RunContext['mode'], value: unknown) {
    if (value === undefined) return undefined;
    return (mode === 'full' ? sanitize(value) : describe(value)) as Record<
      string,
      unknown
    >;
  }

  private actionType(category: RecordProvenanceEventInput['category']): Action['type'] {
    if (category === 'model') return 'transform';
    if (category === 'output') return 'create';
    if (category === 'system') return 'verify';
    return `ext:agentcommons:${category}` as Action['type'];
  }

  private enqueue(item: QueueItem) {
    if (this.queue.length >= this.queueLimit()) {
      if (item.kind === 'event') {
        const run = this.runs.get(item.value.traceId);
        if (run) run.dropped += 1;
      }
      return;
    }
    this.queue.push(item);
    if (this.queue.length >= this.batchSize()) this.scheduleFlush(0);
    else this.scheduleFlush(this.flushInterval());
  }

  private scheduleFlush(delay: number) {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, delay);
    this.flushTimer.unref?.();
  }

  private async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushBatch().finally(() => {
      this.flushPromise = undefined;
      if (this.queue.length) this.scheduleFlush(this.flushInterval());
    });
    return this.flushPromise;
  }

  private async flushBatch() {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.batchSize());
    const starts = batch.filter((item): item is QueuedStart => item.kind === 'start');
    const events = batch.filter((item): item is QueuedEvent => item.kind === 'event');
    const finishes = batch.filter((item): item is QueuedFinish => item.kind === 'finish');
    try {
      if (starts.length) {
        await this.db
          .insert(schema.provenanceRun)
          .values(starts.map((item) => item.value))
          .onConflictDoNothing();
      }
      if (events.length) {
        await this.db
          .insert(schema.provenanceEvent)
          .values(events.map((item) => item.value))
          .onConflictDoNothing();
      }
      for (const finish of finishes) {
        await this.db
          .update(schema.provenanceRun)
          .set(finish.value)
          .where(eq(schema.provenanceRun.traceId, finish.traceId));
      }
      this.retryMs = 100;
      for (const finish of finishes) {
        if (finish.shouldExport) void this.exportTrace(finish.traceId);
        else void this.storeBundleHash(finish.traceId);
      }
    } catch (error) {
      this.queue.unshift(...batch);
      this.logger.warn(
        `Provenance batch deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleFlush(this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 10_000);
    }
  }

  private async storeBundleHash(traceId: string) {
    try {
      const bundle = await this.buildBundle(traceId);
      const bundleHash = sha256(bundle);
      await this.db
        .update(schema.provenanceRun)
        .set({ bundleHash, updatedAt: new Date() })
        .where(eq(schema.provenanceRun.traceId, traceId));
    } catch (error) {
      this.logger.debug(
        `Bundle hash deferred for ${traceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async exportTrace(traceId: string, forceOnchain?: boolean) {
    const apiUrl = process.env.PROVENANCEKIT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.PROVENANCEKIT_API_KEY;
    try {
      const run = await this.getRun(traceId);
      if (!run) return;
      const bundle = await this.buildBundle(traceId);
      const bundleHash = sha256(bundle);
      const onchain = Boolean(forceOnchain ?? run.onchainRequested);
      if (!apiUrl) {
        await this.db
          .update(schema.provenanceRun)
          .set({
            bundleHash,
            anchorStatus: onchain ? 'failed' : run.anchorStatus,
            anchorMetadata: onchain
              ? { error: 'ProvenanceKit sink is not configured' }
              : run.anchorMetadata,
            updatedAt: new Date(),
          })
          .where(eq(schema.provenanceRun.traceId, traceId));
        return;
      }
      const response = await fetch(`${apiUrl}/v1/actions/batch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ bundle, onchain }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, any>;
      if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
      await this.db
        .update(schema.provenanceRun)
        .set({
          bundleHash,
          anchorProvider: 'provenancekit',
          anchorStatus: onchain ? (data.onchain?.txHash ? 'submitted' : 'failed') : 'exported',
          anchorRef: data.onchain?.txHash ?? data.batchId ?? bundleHash,
          anchorMetadata: data,
          updatedAt: new Date(),
        })
        .where(eq(schema.provenanceRun.traceId, traceId));
    } catch (error) {
      await this.db
        .update(schema.provenanceRun)
        .set({
          anchorStatus: 'failed',
          anchorMetadata: {
            error: error instanceof Error ? error.message : String(error),
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.provenanceRun.traceId, traceId))
        .catch(() => undefined);
    }
  }

  private summarize(runs: any[], events: any[]) {
    return {
      runs: runs.length,
      events: events.length,
      modelCalls: events.filter((event) => event.category === 'model').length,
      toolCalls: events.filter((event) => event.category === 'tool').length,
      durationMs: runs.reduce((total, run) => total + (run.durationMs ?? 0), 0),
      inputTokens: runs.reduce((total, run) => total + (run.inputTokens ?? 0), 0),
      outputTokens: runs.reduce((total, run) => total + (run.outputTokens ?? 0), 0),
      cachedTokens: runs.reduce((total, run) => total + (run.cachedTokens ?? 0), 0),
      costUsd: runs.reduce((total, run) => total + Number(run.costUsd ?? 0), 0),
      droppedEvents: runs.reduce(
        (total, run) => total + (run.droppedEventCount ?? 0),
        0,
      ),
    };
  }

  private batchSize() {
    return Number(process.env.PROVENANCE_BATCH_SIZE) || DEFAULT_BATCH_SIZE;
  }
  private flushInterval() {
    return Number(process.env.PROVENANCE_FLUSH_MS) || DEFAULT_FLUSH_MS;
  }
  private queueLimit() {
    return Number(process.env.PROVENANCE_QUEUE_LIMIT) || DEFAULT_QUEUE_LIMIT;
  }
}
