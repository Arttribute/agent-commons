import { lastValueFrom, Observable, of, toArray } from 'rxjs';
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
