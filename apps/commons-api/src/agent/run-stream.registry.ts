import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';

export interface RunStreamEvent {
  type: string;
  runId: string;
  seq: number;
  [key: string]: unknown;
}

export type RunState =
  | 'running'
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'completed'
  | 'failed';

export interface RunMeta {
  agentId: string;
  initiator: string;
  sessionId?: string;
  steeringReady?: boolean;
}

export interface RunSummary {
  runId: string;
  agentId: string;
  sessionId?: string;
  state: RunState;
  /** Short, human-readable description of the latest step. */
  activity?: string;
  startedAt: string;
  updatedAt: string;
}

interface RunStreamEntry {
  events: ReplaySubject<RunStreamEvent>;
  seq: number;
  done: boolean;
  terminal: boolean;
  subscription?: Subscription;
  cleanupTimer?: NodeJS.Timeout;
  meta?: RunMeta & { state: RunState; activity?: string; startedAt: number; updatedAt: number };
  steering: string[];
  steeringClosed: boolean;
  persistQueue?: Promise<void>;
  completedPersist?: Promise<void>;
  pendingEvents: RunStreamEvent[];
  flushTimer?: NodeJS.Timeout;
  heartbeatTimer?: NodeJS.Timeout;
}

/** How long a finished run stays resumable so a cut-off client can still collect the tail. */
const FINISHED_RUN_TTL_MS = 15 * 60 * 1000;
/** Hard cap on a run's buffer lifetime even if the source never completes. */
const MAX_RUN_LIFETIME_MS = 6 * 60 * 60 * 1000;
const STALE_RUN_MS = 2 * 60 * 1000;

/**
 * Keeps an in-memory, sequence-numbered event buffer per agent run so SSE
 * clients can detach and re-attach without losing events.
 *
 * Proxies in front of this API (the commons-app Vercel function, Cloud Run's
 * request timeout) cap how long a single SSE connection can live, while agent
 * runs can take far longer. The registry subscribes to the run exactly once —
 * so the run's lifetime is independent of any client connection — and every
 * event is replayable via `attach(runId, afterSeq)`.
 *
 * Live sources stay on their worker. A shared Postgres replay buffer lets
 * clients reconnect through another API replica; pending steering is likewise
 * handed back to the worker at its next safe step.
 */
@Injectable()
export class RunStreamRegistry implements OnModuleDestroy, OnModuleInit {
  private readonly runs = new Map<string, RunStreamEntry>();
  private readonly logger = new Logger(RunStreamRegistry.name);
  private pruneTimer?: NodeJS.Timeout;

  constructor(@Optional() private readonly db?: DatabaseService) {}

  onModuleInit() {
    if (!this.db) return;
    const prune = () => {
      void this.db!.execute(sql`
        DELETE FROM agent_run_stream WHERE
          (done = true AND updated_at < now() - interval '15 minutes')
          OR started_at < now() - interval '7 hours'
      `).catch((error) => this.logger.warn(`Could not prune old run streams: ${error.message}`));
      void this.db!.execute(sql`DELETE FROM agent_cli_tool_result WHERE expires_at < now()`)
        .catch((error) => this.logger.warn(`Could not prune old CLI results: ${error.message}`));
    };
    prune();
    this.pruneTimer = setInterval(prune, 15 * 60 * 1000);
    this.pruneTimer.unref?.();
  }

  /**
   * Start buffering a run's events. Subscribes to `source` immediately (and
   * only once) and returns an observable that replays the full stream from
   * the beginning. The first emitted event is `run_started`, which carries
   * the `runId` clients need in order to resume.
   */
  start(
    runId: string,
    source: Observable<any>,
    meta?: RunMeta,
    prePersisted = false,
  ): Observable<RunStreamEvent> {
    const entry: RunStreamEntry = {
      events: new ReplaySubject<RunStreamEvent>(this.db ? 1_000 : Infinity),
      seq: 0,
      done: false,
      terminal: false,
      steering: [],
      steeringClosed: meta?.steeringReady === false,
      pendingEvents: [],
      meta: meta
        ? { ...meta, initiator: meta.initiator.toLowerCase(), state: 'running', startedAt: Date.now(), updatedAt: Date.now() }
        : undefined,
    };
    this.runs.set(runId, entry);
    if (this.db && entry.meta) {
      entry.persistQueue = prePersisted ? Promise.resolve() : this.db.execute(sql`
        INSERT INTO agent_run_stream (run_id, initiator, agent_id, session_id, steering_ready)
        VALUES (${runId}::uuid, ${entry.meta.initiator}, ${entry.meta.agentId}, ${entry.meta.sessionId ?? null}, ${!entry.steeringClosed})
      `).then(() => undefined).catch((error) => this.logger.error(`Could not persist run ${runId}: ${error.message}`));
    }
    this.scheduleCleanup(runId, entry, MAX_RUN_LIFETIME_MS);

    this.emit(entry, runId, { type: 'run_started' });
    entry.heartbeatTimer = setInterval(() => {
      if (!entry.done) this.emit(entry, runId, { type: 'keepalive' });
    }, 15_000);
    entry.heartbeatTimer.unref?.();

    entry.subscription = source.subscribe({
      next: (event) => this.emit(entry, runId, event),
      error: (err) => {
        this.emit(entry, runId, {
          type: 'error',
          phase: 'final_answer',
          message: err instanceof Error ? err.message : String(err),
        });
        this.finish(runId, entry);
      },
      complete: () => this.finish(runId, entry),
    });

    return this.attach(runId, 0)!;
  }

  /** Make a reconnectable cloud run visible to every replica before inference begins. */
  async startPersisted(runId: string, source: Observable<any>, meta: RunMeta): Promise<Observable<RunStreamEvent>> {
    if (!this.db) throw new Error('The shared run database is unavailable.');
    await this.db.execute(sql`
      INSERT INTO agent_run_stream (run_id, initiator, agent_id, session_id, steering_ready)
      VALUES (${runId}::uuid, ${meta.initiator.toLowerCase()}, ${meta.agentId}, ${meta.sessionId ?? null}, ${meta.steeringReady !== false})
    `);
    return this.start(runId, source, meta, true);
  }

  /**
   * Re-attach to a run: replays buffered events with seq > afterSeq, then
   * continues with live events until the run completes. Returns undefined if
   * the run is unknown or its buffer has expired.
   */
  attach(
    runId: string,
    afterSeq = 0,
    initiator?: string,
  ): Observable<RunStreamEvent> | undefined {
    const entry = this.runs.get(runId);
    if (!entry || (initiator && entry.meta?.initiator !== initiator.toLowerCase())) return undefined;
    return entry.events
      .asObservable()
      .pipe(filter((event) => event.seq > afterSeq));
  }

  /** Reconnect through any API replica. A local source is used when present. */
  async attachShared(runId: string, afterSeq = 0, initiator?: string): Promise<Observable<RunStreamEvent> | undefined> {
    const active = this.runs.get(runId);
    const local = active && this.db && afterSeq < active.seq - 1_000
      ? undefined
      : this.attach(runId, afterSeq, initiator);
    if (local || !this.db || !initiator) return local;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) return undefined;
    let found = false;
    for (let attempt = 0; attempt < 4 && !found; attempt += 1) {
      const rows = (await this.db.execute(sql`
        SELECT run_id FROM agent_run_stream WHERE run_id = ${runId}::uuid AND initiator = ${initiator.toLowerCase()}
          AND started_at > now() - interval '6 hours'
          AND (done = false OR updated_at > now() - interval '15 minutes')
      `)) as any;
      found = Boolean(rows[0]);
      if (!found && attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!found) return undefined;
    return new Observable<RunStreamEvent>((subscriber) => {
      let stopped = false;
      let cursor = Math.max(0, afterSeq);
      let timer: NodeJS.Timeout | undefined;
      const poll = async () => {
        if (stopped) return;
        try {
          const rows = (await this.db!.execute(sql`
            SELECT stream.done, stream.last_seq, stream.updated_at, events.seq, events.event
            FROM agent_run_stream AS stream
            LEFT JOIN LATERAL (
              SELECT seq, event FROM agent_run_stream_event
              WHERE run_id = stream.run_id AND seq > ${cursor}
              ORDER BY seq LIMIT 100
            ) AS events ON true
            WHERE stream.run_id = ${runId}::uuid AND stream.initiator = ${initiator.toLowerCase()}
            ORDER BY events.seq NULLS LAST
          `)) as any[];
          if (!rows.length) { subscriber.complete(); return; }
          for (const row of rows) {
            if (row.seq == null) continue;
            cursor = Number(row.seq);
            subscriber.next(row.event as RunStreamEvent);
          }
          if (rows[0].done && cursor >= Number(rows[0].last_seq)) { subscriber.complete(); return; }
          if (!rows[0].done && cursor >= Number(rows[0].last_seq) && Date.now() - new Date(rows[0].updated_at).getTime() > STALE_RUN_MS) {
            subscriber.next({ type: 'error', runId, seq: cursor + 1, phase: 'final_answer', message: 'The agent run was interrupted by a server restart.' });
            subscriber.complete();
            return;
          }
          timer = setTimeout(() => void poll(), rows.length >= 100 ? 0 : 500);
          timer.unref?.();
        } catch (error) { subscriber.error(error); }
      };
      void poll();
      return () => { stopped = true; if (timer) clearTimeout(timer); };
    });
  }

  /** Accept a text steer while a run is active; the agent consumes it at its next safe step. */
  enqueueSteer(runId: string, initiator: string, prompt: string): boolean {
    const entry = this.runs.get(runId);
    if (!entry || entry.done || entry.terminal || entry.steeringClosed || entry.meta?.initiator !== initiator.toLowerCase() || entry.steering.length >= 8) return false;
    entry.steering.push(prompt);
    this.emit(entry, runId, { type: 'status', stage: 'steer', status: 'running', message: 'User added a prompt' });
    return true;
  }

  async enqueueSteerShared(runId: string, initiator: string, prompt: string): Promise<boolean> {
    if (this.runs.has(runId)) return this.enqueueSteer(runId, initiator, prompt);
    if (!this.db) return false;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) return false;
    return this.db.transaction(async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT run_id FROM agent_run_stream WHERE run_id = ${runId}::uuid
          AND initiator = ${initiator.toLowerCase()} AND done = false AND steering_ready = true
        FOR UPDATE
      `)) as any;
      if (!rows[0]) return false;
      const pending = (await tx.execute(sql`
        SELECT count(*)::integer AS count FROM agent_run_steer WHERE run_id = ${runId}::uuid AND consumed_at IS NULL
      `)) as any;
      if (Number(pending[0]?.count || 0) >= 8) return false;
      await tx.execute(sql`
        INSERT INTO agent_run_steer (run_id, initiator, prompt)
        VALUES (${runId}::uuid, ${initiator.toLowerCase()}, ${prompt})
      `);
      return true;
    });
  }

  takeSteers(runId: string): string[] {
    const entry = this.runs.get(runId);
    return entry?.steering.splice(0) ?? [];
  }

  async takeSteersShared(runId: string): Promise<string[]> {
    const local = this.takeSteers(runId);
    if (!this.db) return local;
    let rows: any[];
    try {
      rows = (await this.db.execute(sql`
      WITH pending AS (
        SELECT id, prompt FROM agent_run_steer WHERE run_id = ${runId}::uuid AND consumed_at IS NULL
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 8
      )
      UPDATE agent_run_steer AS target SET consumed_at = now()
      FROM pending WHERE target.id = pending.id
      RETURNING pending.id, pending.prompt
      `)) as any[];
    } catch (error) {
      this.logger.warn(`Could not check pending steering for ${runId}: ${error instanceof Error ? error.message : String(error)}`);
      return local;
    }
    const remote = rows.sort((a, b) => Number(a.id) - Number(b.id)).map((row) => String(row.prompt));
    const entry = this.runs.get(runId);
    for (let index = 0; entry && index < remote.length; index += 1) {
      this.emit(entry, runId, { type: 'status', stage: 'steer', status: 'running', message: 'User added a prompt' });
    }
    return [...local, ...remote];
  }

  closeSteering(runId: string) {
    const entry = this.runs.get(runId);
    if (entry) entry.steeringClosed = true;
  }

  async closeSteeringShared(runId: string) {
    this.closeSteering(runId);
    const entry = this.runs.get(runId);
    if (this.db && entry?.persistQueue) await entry.persistQueue.then(() => this.db!.execute(sql`
      UPDATE agent_run_stream SET steering_ready = false WHERE run_id = ${runId}::uuid
    `)).catch((error) => this.logger.warn(`Could not close shared steering for ${runId}: ${error.message}`));
  }

  openSteering(runId: string) {
    const entry = this.runs.get(runId);
    if (entry && !entry.done && !entry.terminal) entry.steeringClosed = false;
  }

  async openSteeringShared(runId: string) {
    this.openSteering(runId);
    const entry = this.runs.get(runId);
    if (this.db && entry?.persistQueue) await entry.persistQueue.then(() => this.db!.execute(sql`
      UPDATE agent_run_stream SET steering_ready = true WHERE run_id = ${runId}::uuid AND done = false
    `)).catch((error) => this.logger.warn(`Could not open shared steering for ${runId}: ${error.message}`));
  }

  /**
   * Recent runs started by one person: in progress, waiting on them, or
   * finished within the resumable window. Newest first.
   */
  listForInitiator(initiator: string, limit = 50): RunSummary[] {
    const owner = initiator.toLowerCase();
    return [...this.runs.entries()]
      .flatMap(([runId, entry]) =>
        entry.meta && entry.meta.initiator === owner
          ? [{
              runId,
              agentId: entry.meta.agentId,
              sessionId: entry.meta.sessionId,
              state: entry.meta.state,
              activity: entry.meta.activity,
              startedAt: new Date(entry.meta.startedAt).toISOString(),
              updatedAt: new Date(entry.meta.updatedAt).toISOString(),
            }]
          : [],
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async listForInitiatorShared(initiator: string, limit = 50): Promise<RunSummary[]> {
    const local = this.listForInitiator(initiator, limit);
    if (!this.db) return local;
    const rows = (await this.db.execute(sql`
      SELECT run_id, agent_id, session_id, state, activity, done, started_at, updated_at
      FROM agent_run_stream WHERE initiator = ${initiator.toLowerCase()}
        AND started_at > now() - interval '6 hours'
        AND (done = false OR updated_at > now() - interval '15 minutes')
      ORDER BY updated_at DESC LIMIT ${Math.max(1, Math.min(limit, 100))}
    `)) as any[];
    const merged = new Map(local.map((run) => [run.runId, run]));
    for (const row of rows) {
      const runId = String(row.run_id);
      if (!merged.has(runId)) merged.set(runId, {
        runId,
        agentId: String(row.agent_id),
        sessionId: row.session_id ? String(row.session_id) : undefined,
        state: !row.done && Date.now() - new Date(row.updated_at).getTime() > STALE_RUN_MS ? 'failed' : row.state as RunState,
        activity: !row.done && Date.now() - new Date(row.updated_at).getTime() > STALE_RUN_MS
          ? 'The agent run was interrupted by a server restart.'
          : row.activity ? String(row.activity) : undefined,
        startedAt: new Date(row.started_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      });
    }
    return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }

  private track(entry: RunStreamEntry, event: Record<string, any>) {
    const meta = entry.meta;
    if (!meta) return;
    const sessionId = event.sessionId ?? event.payload?.sessionId;
    if (typeof sessionId === 'string' && sessionId) meta.sessionId = sessionId;
    meta.updatedAt = Date.now();
    switch (event.type) {
      case 'cli_tool_request':
        meta.state = 'awaiting_approval';
        meta.activity = `Waiting for approval: ${String(event.tool ?? event.toolName ?? 'computer action').replace(/^cli_/, '').replaceAll('_', ' ')}`;
        return;
      case 'toolStart':
        meta.state = 'running';
        meta.activity = humanizeTool(String(event.toolName ?? 'tool'));
        return;
      case 'tool':
      case 'toolEnd': {
        const name = String(event.toolName ?? event.tool ?? '');
        const output = event.output ?? event.result ?? event.payload;
        if (name === 'showCommonsApp' && event.status !== 'error') {
          meta.state = 'awaiting_input';
          meta.activity = 'Waiting for your response in an app';
          return;
        }
        if (output?.requiresConfirmation || output?.data?.requiresConfirmation) {
          meta.state = 'awaiting_approval';
          meta.activity = 'A change is waiting for your review';
          return;
        }
        meta.state = 'running';
        return;
      }
      case 'status':
        if (meta.state === 'awaiting_approval' && event.stage !== 'tool') return;
        meta.state = 'running';
        if (typeof event.message === 'string' && !['request', 'agent', 'session', 'tools', 'context', 'model'].includes(event.stage)) {
          meta.activity = event.message.slice(0, 120);
        }
        return;
      case 'final':
      case 'completed':
        if (meta.state !== 'awaiting_approval' && meta.state !== 'awaiting_input') meta.state = 'completed';
        return;
      case 'error':
      case 'failed':
      case 'cancelled':
        meta.state = 'failed';
        meta.activity = typeof event.message === 'string' ? event.message.slice(0, 120) : meta.activity;
        return;
    }
  }

  private emit(
    entry: RunStreamEntry,
    runId: string,
    event: Record<string, unknown>,
  ) {
    this.track(entry, event);
    if (['final', 'completed', 'failed', 'cancelled', 'error'].includes(String(event.type))) entry.terminal = true;
    entry.seq += 1;
    const emitted = { ...event, runId, seq: entry.seq } as RunStreamEvent;
    entry.events.next(emitted);
    if (entry.persistQueue) {
      entry.pendingEvents.push(emitted);
      if (entry.pendingEvents.length >= 50) void this.flush(runId, entry);
      else if (!entry.flushTimer) {
        entry.flushTimer = setTimeout(() => void this.flush(runId, entry), 250);
        entry.flushTimer.unref?.();
      }
    }
  }

  private async flush(runId: string, entry: RunStreamEntry) {
    if (entry.flushTimer) clearTimeout(entry.flushTimer);
    entry.flushTimer = undefined;
    const batch = entry.pendingEvents.splice(0);
    if (!batch.length || !this.db || !entry.persistQueue || !entry.meta) return;
    const meta = { ...entry.meta };
    const done = entry.done;
    const lastSeq = batch[batch.length - 1].seq;
    const prior = entry.persistQueue;
    entry.persistQueue = prior.then(async () => {
      await this.db!.execute(sql`
        INSERT INTO agent_run_stream_event (run_id, seq, event)
        SELECT ${runId}::uuid, (item->>'seq')::integer, item
        FROM jsonb_array_elements(${JSON.stringify(batch)}::jsonb) AS item
        ON CONFLICT (run_id, seq) DO NOTHING
      `);
      await this.db!.execute(sql`
        UPDATE agent_run_stream SET session_id = ${meta.sessionId ?? null}, state = ${meta.state},
          activity = ${meta.activity ?? null}, updated_at = ${new Date(meta.updatedAt).toISOString()}::timestamptz,
          last_seq = ${lastSeq}, done = ${done}, steering_ready = ${!entry.steeringClosed}
        WHERE run_id = ${runId}::uuid
      `);
    }).catch((error) => {
      this.logger.error(`Could not persist stream events for ${runId}: ${error.message}`);
      entry.pendingEvents.unshift(...batch);
      if (!entry.flushTimer) {
        entry.flushTimer = setTimeout(() => void this.flush(runId, entry), 1_000);
        entry.flushTimer.unref?.();
      }
    });
    await entry.persistQueue;
  }

  private finish(runId: string, entry: RunStreamEntry) {
    entry.done = true;
    if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
    if (entry.meta && entry.meta.state === 'running') {
      entry.meta.state = 'completed';
      entry.meta.updatedAt = Date.now();
    }
    entry.events.complete();
    const completed = this.flush(runId, entry).then(() => entry.persistQueue).then(async () => {
      if (this.db && entry.meta) await this.db.execute(sql`
        UPDATE agent_run_stream SET done = true, state = ${entry.meta.state}, updated_at = now(),
          steering_ready = false, last_seq = ${entry.seq}
        WHERE run_id = ${runId}::uuid
      `);
    }).catch((error) => this.logger.error(`Could not complete run ${runId}: ${error.message}`));
    entry.completedPersist = completed;
    this.scheduleCleanup(runId, entry, FINISHED_RUN_TTL_MS);
    return completed;
  }

  private scheduleCleanup(
    runId: string,
    entry: RunStreamEntry,
    afterMs: number,
  ) {
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = setTimeout(() => {
      if (!entry.done) {
        entry.subscription?.unsubscribe();
        this.emit(entry, runId, { type: 'error', phase: 'final_answer', message: 'The agent run reached its six-hour execution limit.' });
        this.finish(runId, entry);
        return;
      }
      if (entry.flushTimer) clearTimeout(entry.flushTimer);
      if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
      entry.subscription?.unsubscribe();
      this.runs.delete(runId);
      if (this.db) void this.db.execute(sql`DELETE FROM agent_run_stream WHERE run_id = ${runId}::uuid`)
        .catch((error) => this.logger.warn(`Could not expire run ${runId}: ${error.message}`));
    }, afterMs);
    entry.cleanupTimer.unref?.();
  }

  async onModuleDestroy() {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    const persistence: Promise<unknown>[] = [];
    for (const [runId, entry] of this.runs) {
      if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
      if (entry.heartbeatTimer) clearInterval(entry.heartbeatTimer);
      entry.subscription?.unsubscribe();
      if (!entry.done) {
        this.emit(entry, runId, { type: 'error', phase: 'final_answer', message: 'The agent run was interrupted by a server restart.' });
        persistence.push(this.finish(runId, entry));
      } else if (entry.completedPersist ?? entry.persistQueue) {
        persistence.push((entry.completedPersist ?? entry.persistQueue)!);
      }
      this.runs.delete(runId);
      if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    }
    await Promise.allSettled(persistence);
  }
}

function humanizeTool(name: string) {
  const readable = name
    .replace(/^cli_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase();
  return `Using ${readable}`;
}
