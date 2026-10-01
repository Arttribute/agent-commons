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

  it('replays the current prompt only to the run owner', () => {
    registry.start('run-1', source, {
      agentId: 'agent-1',
      initiator: 'user-1',
      sessionId: 'session-1',
      prompt: 'Explain this document',
    });
    expect(registry.attach('run-1', 0, 'other-user')).toBeUndefined();
    const { received } = collect(registry.attach('run-1', 0, 'user-1')!);
    expect(received[0]).toMatchObject({ type: 'run_started', prompt: 'Explain this document' });
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

  it('accepts steering only from the run owner and drains it once', () => {
    registry.start('run-1', source, { agentId: 'a1', initiator: 'owner' });
    expect(registry.attach('run-1', 0, 'other')).toBeUndefined();
    expect(registry.enqueueSteer('run-1', 'other', 'change direction')).toBe(false);
    expect(registry.enqueueSteer('run-1', 'OWNER', 'change direction')).toBe(true);
    expect(registry.takeSteers('run-1')).toEqual(['change direction']);
    expect(registry.takeSteers('run-1')).toEqual([]);
    source.complete();
    expect(registry.enqueueSteer('run-1', 'owner', 'too late')).toBe(false);
  });

  it('reports each person\'s runs with their current state', () => {
    collect(registry.start('run-1', source, { agentId: 'a1', initiator: 'User-1' }));
    source.next({ type: 'status', stage: 'session', sessionId: 's1', message: 'Conversation ready' });
    source.next({ type: 'toolStart', toolName: 'searchKnowledge' });
    let [run] = registry.listForInitiator('user-1');
    expect(run).toMatchObject({ runId: 'run-1', agentId: 'a1', sessionId: 's1', state: 'running', activity: 'Using search knowledge' });

    source.next({ type: 'cli_tool_request', tool: 'cli_run_command' });
    [run] = registry.listForInitiator('user-1');
    expect(run.state).toBe('awaiting_approval');

    source.next({ type: 'final', payload: {} });
    source.complete();
    expect(registry.listForInitiator('USER-1')[0].state).toBe('awaiting_approval');
    expect(registry.listForInitiator('someone-else')).toEqual([]);
  });

  it('marks a finished run complete and a failed run failed', () => {
    const second = new Subject<any>();
    collect(registry.start('run-1', source, { agentId: 'a1', initiator: 'u' }));
    collect(registry.start('run-2', second, { agentId: 'a2', initiator: 'u' }));
    source.next({ type: 'final', payload: {} });
    source.complete();
    second.error(new Error('model unavailable'));
    const states = Object.fromEntries(registry.listForInitiator('u').map((run) => [run.runId, run.state]));
    expect(states).toEqual({ 'run-1': 'completed', 'run-2': 'failed' });
  });
});
