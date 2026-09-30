import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { lastValueFrom, Subject, toArray } from 'rxjs';
import { RunStreamRegistry } from './run-stream.registry';

const runId = '4b52c1bd-86f0-4684-b637-01db882df5b7';

describe('shared run store with real SQL', () => {
  let postgres: PGlite;
  let worker: RunStreamRegistry;
  let reader: RunStreamRegistry;

  beforeAll(async () => {
    postgres = new PGlite();
    await postgres.exec(readFileSync('migrations/versioned/039_shared_run_streams.sql', 'utf8'));
    // Production uses drizzle-orm/postgres-js, whose execute returns an array.
    // PGlite returns { rows }; adapt only that driver boundary here.
    const client = drizzle(postgres);
    const rows = async (executor: { execute: (query: any) => Promise<any> }, query: any) => {
      const result = await executor.execute(query);
      return Array.isArray(result) ? result : result.rows;
    };
    const db = {
      execute: (query: any) => rows(client, query),
      transaction: (callback: (tx: { execute: (query: any) => Promise<any[]> }) => Promise<any>) =>
        client.transaction((tx) => callback({ execute: (query) => rows(tx, query) })),
    };
    worker = new RunStreamRegistry(db as any);
    reader = new RunStreamRegistry(db as any);
  });

  afterAll(async () => {
    await worker?.onModuleDestroy();
    await reader?.onModuleDestroy();
    await postgres?.close();
  });

  it('replays a finished run and passes a prompt between replicas', async () => {
    const source = new Subject<Record<string, unknown>>();
    await worker.startPersisted(runId, source, { agentId: 'agent-1', initiator: 'user-1', steeringReady: true });

    expect(await reader.enqueueSteerShared(runId, 'other-user', 'wrong owner')).toBe(false);
    expect(await reader.enqueueSteerShared(runId, 'user-1', 'Check the failed test too')).toBe(true);
    expect(await worker.takeSteersShared(runId)).toEqual(['Check the failed test too']);
    expect(await worker.takeSteersShared(runId)).toEqual([]);

    source.next({ type: 'status', stage: 'tool', message: 'Reading project files' });
    source.next({ type: 'final', payload: { answer: 'Done' } });
    source.complete();
    await worker.onModuleDestroy();

    const remote = await reader.attachShared(runId, 0, 'user-1');
    expect(remote).toBeDefined();
    const events = await lastValueFrom(remote!.pipe(toArray()));
    expect(events.map((event) => event.type)).toEqual(['run_started', 'status', 'status', 'final']);
    expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(await reader.attachShared(runId, 0, 'other-user')).toBeUndefined();
  });
});
