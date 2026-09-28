import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

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
  subscription?: Subscription;
  cleanupTimer?: NodeJS.Timeout;
  meta?: RunMeta & { state: RunState; activity?: string; startedAt: number; updatedAt: number };
}

/** How long a finished run stays resumable so a cut-off client can still collect the tail. */
const FINISHED_RUN_TTL_MS = 15 * 60 * 1000;
/** Hard cap on a run's buffer lifetime even if the source never completes. */
const MAX_RUN_LIFETIME_MS = 6 * 60 * 60 * 1000;

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
 * In-memory by design: the platform already assumes a single API instance
 * (see AgentService.pendingCliToolRequests and RateLimitGuard).
 */
@Injectable()
export class RunStreamRegistry implements OnModuleDestroy {
  private readonly runs = new Map<string, RunStreamEntry>();

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
  ): Observable<RunStreamEvent> {
    const entry: RunStreamEntry = {
      events: new ReplaySubject<RunStreamEvent>(),
      seq: 0,
      done: false,
      meta: meta
        ? { ...meta, initiator: meta.initiator.toLowerCase(), state: 'running', startedAt: Date.now(), updatedAt: Date.now() }
        : undefined,
    };
    this.runs.set(runId, entry);
    this.scheduleCleanup(runId, entry, MAX_RUN_LIFETIME_MS);

    this.emit(entry, runId, { type: 'run_started' });

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

  /**
   * Re-attach to a run: replays buffered events with seq > afterSeq, then
   * continues with live events until the run completes. Returns undefined if
   * the run is unknown or its buffer has expired.
   */
  attach(
    runId: string,
    afterSeq = 0,
  ): Observable<RunStreamEvent> | undefined {
    const entry = this.runs.get(runId);
    if (!entry) return undefined;
    return entry.events
      .asObservable()
      .pipe(filter((event) => event.seq > afterSeq));
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
    entry.seq += 1;
    entry.events.next({ ...event, runId, seq: entry.seq } as RunStreamEvent);
  }

  private finish(runId: string, entry: RunStreamEntry) {
    entry.done = true;
    if (entry.meta && entry.meta.state === 'running') {
      entry.meta.state = 'completed';
      entry.meta.updatedAt = Date.now();
    }
    entry.events.complete();
    this.scheduleCleanup(runId, entry, FINISHED_RUN_TTL_MS);
  }

  private scheduleCleanup(
    runId: string,
    entry: RunStreamEntry,
    afterMs: number,
  ) {
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = setTimeout(() => {
      entry.subscription?.unsubscribe();
      if (!entry.done) entry.events.complete();
      this.runs.delete(runId);
    }, afterMs);
    entry.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    for (const [runId, entry] of this.runs) {
      if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
      entry.subscription?.unsubscribe();
      if (!entry.done) entry.events.complete();
      this.runs.delete(runId);
    }
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
