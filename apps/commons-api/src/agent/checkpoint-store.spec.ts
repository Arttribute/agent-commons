import { EventEmitter } from 'node:events';
import { AgentCheckpointStore } from './checkpoint-store';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => {
    const emitter = new (require('node:events').EventEmitter)();
    emitter.end = jest.fn().mockResolvedValue(undefined);
    return emitter;
  }),
}));
jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: class {
    constructor(readonly pool: unknown) {}
    putWrites() {
      return Promise.reject(new Error('Database connection limit'));
    }
  },
}));

describe('shared agent checkpoint store', () => {
  it('reuses one bounded pool and reports idle connection errors without throwing', async () => {
    const report = jest.fn();
    const store = new AgentCheckpointStore(report);
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 2, connectionTimeoutMillis: 10000 }),
    );
    expect(store.saver).toBe(store.saver);
    expect(() =>
      (store.pool as unknown as EventEmitter).emit(
        'error',
        new Error('Disconnected'),
      ),
    ).not.toThrow();
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('Disconnected'),
    );
    await store.close();
    expect(store.pool.end).toHaveBeenCalledTimes(1);
  });
  it('observes queued failures immediately but still rejects when the graph awaits them', async () => {
    const store = new AgentCheckpointStore(jest.fn());
    const pending = store.saver.putWrites(
      { configurable: { thread_id: 'test' } },
      [],
      'task',
    );
    // LangGraph waits for queued writes at the end of its loop, not at creation.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(pending).rejects.toThrow('Database connection limit');
    await store.close();
  });
});
