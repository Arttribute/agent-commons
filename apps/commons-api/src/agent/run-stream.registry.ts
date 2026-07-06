import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface RunStreamEvent {
  type: string;
  runId: string;
  seq: number;
  [key: string]: unknown;
}

interface RunStreamEntry {
  events: ReplaySubject<RunStreamEvent>;
  seq: number;
  done: boolean;
  subscription?: Subscription;
  cleanupTimer?: NodeJS.Timeout;
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
  start(runId: string, source: Observable<any>): Observable<RunStreamEvent> {
    const entry: RunStreamEntry = {
      events: new ReplaySubject<RunStreamEvent>(),
      seq: 0,
      done: false,
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

  private emit(
    entry: RunStreamEntry,
    runId: string,
    event: Record<string, unknown>,
  ) {
    entry.seq += 1;
    entry.events.next({ ...event, runId, seq: entry.seq } as RunStreamEvent);
  }

  private finish(runId: string, entry: RunStreamEntry) {
    entry.done = true;
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
