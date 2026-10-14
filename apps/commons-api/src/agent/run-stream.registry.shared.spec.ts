import { lastValueFrom, Observable, of, toArray, Subject } from 'rxjs';
import { RunStreamRegistry } from './run-stream.registry';

const runId = '4b52c1bd-86f0-4684-b637-01db882df5b7';

describe('shared cloud run continuity', () => {
  it('replays a finished run after reconnecting through another API replica', async () => {
    const workerDb = { execute: jest.fn().mockResolvedValue([]) };
    const worker = new RunStreamRegistry(workerDb as any);
    await worker.startPersisted(runId, of({ type: 'status', stage: 'tool', message: 'Reading project files' }), {
      agentId: 'agent-1', initiator: 'user-1', steeringReady: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(workerDb.execute).toHaveBeenCalled();

    const readerDb = { execute: jest.fn()
      .mockResolvedValueOnce([{ run_id: runId }])
      .mockResolvedValueOnce([
        { done: true, last_seq: 2, seq: 1, event: { type: 'run_started', runId, seq: 1 } },
        { done: true, last_seq: 2, seq: 2, event: { type: 'status', runId, seq: 2, stage: 'tool', message: 'Reading project files' } },
      ]) };
    const reader = new RunStreamRegistry(readerDb as any);
    const stream = await reader.attachShared(runId, 0, 'user-1');
    expect(stream).toBeDefined();
    const events = await lastValueFrom(stream!.pipe(toArray()));
    expect(events.map((event) => event.seq)).toEqual([1, 2]);
    expect(events[1].message).toBe('Reading project files');
    await worker.onModuleDestroy();
    await reader.onModuleDestroy();
  });

  it('does not start inference when the shared run record cannot be created', async () => {
    const db = { execute: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    const registry = new RunStreamRegistry(db as any);
    let subscribed = false;
    const source = new Observable(() => { subscribed = true; });
    await expect(registry.startPersisted(runId, source, { agentId: 'agent-1', initiator: 'user-1' }))
      .rejects.toThrow('database unavailable');
    expect(subscribed).toBe(false);
    await registry.onModuleDestroy();
  });

  it('queues a remote steer only for the run owner and drains it on the worker', async () => {
    const transactionExecute = jest.fn()
      .mockResolvedValueOnce([{ run_id: runId }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);
    const db = {
      transaction: jest.fn((callback) => callback({ execute: transactionExecute })),
      execute: jest.fn().mockResolvedValue([{ id: 42, prompt: 'Include the failed test in your diagnosis' }]),
    };
    const registry = new RunStreamRegistry(db as any);
    expect(await registry.enqueueSteerShared(runId, 'user-1', 'Include the failed test in your diagnosis')).toBe(true);
    expect(await registry.takeSteersShared(runId)).toEqual(['Include the failed test in your diagnosis']);
    expect(transactionExecute).toHaveBeenCalledTimes(3);
    await registry.onModuleDestroy();
  });
});


describe('steering control independent of token persistence', () => {
  for (const ready of [false, true]) {
    it(`publishes readiness=${ready} while a token batch is delayed`, async () => {
      const { PgDialect } = await import('drizzle-orm/pg-core');
      const dialect = new PgDialect();
      let release!: () => void;
      let entered!: () => void;
      const blocked = new Promise<void>(resolve => { release = resolve; });
      const writing = new Promise<void>(resolve => { entered = resolve; });
      const statements: Array<{ sql: string; params: unknown[] }> = [];
      const db = { execute: jest.fn(async (statement: any) => {
        const query = dialect.sqlToQuery(statement); statements.push(query);
        if (query.sql.includes('INSERT INTO agent_run_stream_event')) { entered(); await blocked; }
        return [];
      }) };
      const registry = new RunStreamRegistry(db as any);
      const source = new Subject<any>();
      try {
        await registry.startPersisted(runId, source, { agentId: 'agent-1', initiator: 'user-1', steeringReady: !ready });
        for (let i = 0; i < 49; i++) source.next({ type: 'token', content: 't' });
        await writing;
        const finished = await Promise.race([
          (ready ? registry.openSteeringShared(runId) : registry.closeSteeringShared(runId)).then(() => true),
          new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100)),
        ]);
        expect(finished).toBe(true);
        expect(statements.some(q => q.sql.includes('SET steering_ready =') && q.params[0] === ready)).toBe(true);
        expect(registry.enqueueSteer(runId, 'user-1', 'Next instruction')).toBe(ready);
        if (!ready) {
          const terminal = lastValueFrom(registry.attach(runId, 0, 'user-1')!.pipe(toArray()));
          source.next({ type: 'final', payload: { saved: true } }); source.complete();
          expect((await terminal).at(-1)?.type).toBe('final');
        }
      } finally { release(); source.complete(); await registry.onModuleDestroy(); }
    });
  }

  it('bounds an unavailable steering-control write without delaying terminal delivery', async () => {
    jest.useFakeTimers();
    const { PgDialect } = await import('drizzle-orm/pg-core');
    const dialect = new PgDialect();
    const db = { execute: jest.fn((statement: any) => dialect.sqlToQuery(statement).sql.includes('SET steering_ready =') ? new Promise(() => {}) : Promise.resolve([])) };
    const registry = new RunStreamRegistry(db as any);
    const source = new Subject<any>();
    const warning = jest.spyOn((registry as any).logger, 'warn').mockImplementation(() => {});
    try {
      await registry.startPersisted(runId, source, { agentId: 'agent-1', initiator: 'user-1', steeringReady: true });
      const closing = registry.closeSteeringShared(runId);
      await jest.advanceTimersByTimeAsync(3_000);
      await closing;
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('timeout'));
      expect(registry.enqueueSteer(runId, 'user-1', 'Too late')).toBe(false);
    } finally { source.complete(); await registry.onModuleDestroy(); jest.useRealTimers(); }
  });
});

describe('host navigation across API replicas', () => {
  it.each([
    { state: 'awaiting_input', activity: 'Continue in Common Business', hosted: true },
    { state: 'awaiting_approval', activity: 'A change is waiting for your review', hosted: false },
    { state: 'awaiting_input', activity: 'Waiting for your response in an app', hosted: false },
  ])('routes $state / $activity to the correct controls', async ({ state, activity, hosted }) => {
    const now = new Date().toISOString();
    const db = { execute: jest.fn().mockResolvedValue([{
      run_id: runId, agent_id: 'a1', session_id: 's1', state, activity, done: false,
      action_url: 'https://business.example.com', started_at: now, updated_at: now,
    }]) };
    const reader = new RunStreamRegistry(db as any);
    try {
      const [run] = await reader.listForInitiatorShared('u');
      expect(run.state).toBe(state);
      expect(run.actionUrl).toBe(hosted ? 'https://business.example.com' : undefined);
    } finally { await reader.onModuleDestroy(); }
  });
});
