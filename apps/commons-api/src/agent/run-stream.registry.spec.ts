import { Subject } from 'rxjs';
import { RunStreamRegistry, RunStreamEvent } from './run-stream.registry';

function collect(events$: { subscribe: Function }) {
  const received: RunStreamEvent[] = [];
  let completed = false;
  events$.subscribe({
    next: (e: RunStreamEvent) => received.push(e),
    complete: () => {
      completed = true;
    },
  });
  return { received, isCompleted: () => completed };
}

describe('RunStreamRegistry', () => {
  let registry: RunStreamRegistry;
  let source: Subject<any>;

  beforeEach(() => {
    registry = new RunStreamRegistry();
    source = new Subject<any>();
  });

  afterEach(() => {
    registry.onModuleDestroy();
  });

  it('emits run_started first and tags every event with runId and increasing seq', () => {
    const { received } = collect(registry.start('run-1', source));

    source.next({ type: 'token', content: 'a' });
    source.next({ type: 'token', content: 'b' });

    expect(received.map((e) => e.type)).toEqual([
      'run_started',
      'token',
      'token',
    ]);
    expect(received.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(received.every((e) => e.runId === 'run-1')).toBe(true);
  });

  it('replays only events after the given seq on attach', () => {
    registry.start('run-1', source);
    source.next({ type: 'token', content: 'a' }); // seq 2
    source.next({ type: 'token', content: 'b' }); // seq 3

    const { received } = collect(registry.attach('run-1', 2)!);
    expect(received.map((e) => e.seq)).toEqual([3]);

    // Late subscriber keeps receiving live events too.
    source.next({ type: 'final', payload: {} }); // seq 4
    expect(received.map((e) => e.seq)).toEqual([3, 4]);
  });

  it('keeps the run alive when a client unsubscribes mid-stream', () => {
    const sub = registry.start('run-1', source).subscribe();
    source.next({ type: 'token', content: 'a' });
    sub.unsubscribe(); // simulates proxy cutting the SSE connection

    source.next({ type: 'token', content: 'b' }); // still buffered

    const { received } = collect(registry.attach('run-1', 0)!);
    expect(received.map((e) => e.type)).toEqual([
      'run_started',
      'token',
      'token',
    ]);
  });

  it('completes attached streams when the source completes, and stays resumable', () => {
    const first = collect(registry.start('run-1', source));
    source.next({ type: 'final', payload: {} });
    source.complete();

    expect(first.isCompleted()).toBe(true);

    // A client reconnecting after completion still gets the buffered tail.
    const replay = collect(registry.attach('run-1', 1)!);
    expect(replay.received.map((e) => e.type)).toEqual(['final']);
    expect(replay.isCompleted()).toBe(true);
  });

  it('converts a source error into an error event and completes', () => {
    const { received, isCompleted } = collect(
      registry.start('run-1', source),
    );
    source.error(new Error('boom'));

    expect(received.map((e) => e.type)).toEqual(['run_started', 'error']);
    expect(received[1].message).toBe('boom');
    expect(isCompleted()).toBe(true);
  });

  it('returns undefined for unknown runs', () => {
    expect(registry.attach('nope', 0)).toBeUndefined();
  });
});
