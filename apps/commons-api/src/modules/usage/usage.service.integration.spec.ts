import { readFileSync } from 'node:fs';
import { HttpStatus } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { UsageService } from './usage.service';

const freeModel = { provider: 'hosted-free', modelId: 'Qwen/Qwen3-1.7B-FP8', isByok: false };

describe('hosted free quota with real SQL', () => {
  let postgres: PGlite;
  let service: UsageService;
  let healthFetch: jest.SpyInstance;
  const originalEnv = { ...process.env };
  const credits = { reserve: jest.fn(), ensureReservationCapacity: jest.fn(), finalizeReservation: jest.fn() };

  beforeAll(async () => {
    postgres = new PGlite();
    await postgres.exec(readFileSync('migrations/versioned/038_hosted_free_model_quota.sql', 'utf8'));
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
    service = new UsageService(db as any, credits as any, {
      getEntitlements: async () => ({ modelTiers: ['free'], maxConcurrentRuns: 2 }),
    } as any);
    process.env.HOSTED_FREE_MODEL_BASE_URL = 'http://free-model.internal/v1';
    process.env.HOSTED_FREE_MODEL_API_KEY = 'test-key';
    process.env.HOSTED_FREE_DAILY_REQUESTS = '1';
    process.env.HOSTED_FREE_GLOBAL_DAILY_REQUESTS = '2';
    healthFetch = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
  });

  afterAll(async () => {
    healthFetch?.mockRestore();
    process.env = originalEnv;
    await postgres?.close();
  });

  it('rolls back both counters when either allowance is exhausted and never reserves credits', async () => {
    const start = (principalId: string, traceId: string) => service.authorizeAgentRun({
      ...freeModel, principalId, traceId, agentId: 'agent-1',
    });
    expect((await start('user-1', 'run-1'))?.reservationId).toBe('hosted-free:run-1');
    await expect(start('user-1', 'run-2')).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect((await start('user-2', 'run-3'))?.reservationId).toBe('hosted-free:run-3');
    await expect(start('user-3', 'run-4')).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    const counts = await postgres.query<{ scope: string; scope_id: string; request_count: number }>(
      'SELECT scope, scope_id, request_count FROM hosted_free_daily_quota ORDER BY scope, scope_id',
    );
    expect(counts.rows).toEqual([
      { scope: 'global', scope_id: '*', request_count: 2 },
      { scope: 'user', scope_id: 'user-1', request_count: 1 },
      { scope: 'user', scope_id: 'user-2', request_count: 1 },
    ]);

    await expect(service.authorizeModelCall({
      reservationId: 'hosted-free:run-1', ...freeModel,
      prompts: ['x'.repeat(24_000)], maxOutputTokens: 2_048,
    })).rejects.toMatchObject({ status: HttpStatus.PAYLOAD_TOO_LARGE });

    await service.authorizeModelCall({ reservationId: 'hosted-free:run-1', ...freeModel, prompts: ['Hello'], maxOutputTokens: 4 });
    const tokenRows = await postgres.query<{ scope: string; scope_id: string; reserved_tokens: string }>(
      'SELECT scope, scope_id, reserved_tokens FROM hosted_free_daily_quota WHERE reserved_tokens > 0 ORDER BY scope, scope_id',
    );
    expect(tokenRows.rows.map((row) => ({ ...row, reserved_tokens: Number(row.reserved_tokens) }))).toEqual([
      { scope: 'global', scope_id: '*', reserved_tokens: 6 },
      { scope: 'user', scope_id: 'user-1', reserved_tokens: 6 },
    ]);

    await service.finalizeAgentRun('hosted-free:run-1');
    const finished = await postgres.query<{ finished_at: string | null }>('SELECT finished_at FROM hosted_free_run WHERE trace_id = $1', ['run-1']);
    expect(finished.rows[0].finished_at).not.toBeNull();
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(credits.ensureReservationCapacity).not.toHaveBeenCalled();
    expect(credits.finalizeReservation).not.toHaveBeenCalled();
  });
});
