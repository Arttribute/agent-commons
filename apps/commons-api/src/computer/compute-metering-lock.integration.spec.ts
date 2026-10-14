import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ComputeMeteringLock } from './compute-metering-lock';

const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

integration('compute metering locks with real Postgres', () => {
  let application: Pool;
  let locks: ComputeMeteringLock;
  let otherWorker: ComputeMeteringLock;

  beforeEach(() => {
    application = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 1000 });
    locks = new ComputeMeteringLock({ connectionString: databaseUrl });
    otherWorker = new ComputeMeteringLock({ connectionString: databaseUrl });
  });

  afterEach(async () => {
    await Promise.all([application.end(), locks.onModuleDestroy(), otherWorker.onModuleDestroy()]);
  });

  it('keeps application queries and credit transactions available while lock actions queue', async () => {
    const started = deferred();
    const finish = deferred();
    const id = randomUUID();
    const first = locks.withInstanceLock(id, async () => {
      started.resolve();
      await finish.promise;
      // CreditService opens another transaction while metering owns its lock.
      const client = await application.connect();
      try {
        await client.query('BEGIN');
        await client.query('select 1');
        await client.query('COMMIT');
        return 'charged';
      } finally { client.release(); }
    });
    await started.promise;
    const queued = Array.from({ length: 4 }, () => locks.withInstanceLock(id, async () => 'settled'));
    try {
      const response = await application.query('select 1 as available');
      expect(response.rows[0].available).toBe(1);
    } finally { finish.resolve(); }
    expect(await first).toBe('charged');
    expect(await Promise.all(queued)).toEqual(Array(4).fill('settled'));
  });

  it('skips a busy computer across workers and acquires it after the action finishes', async () => {
    const started = deferred();
    const finish = deferred();
    const id = randomUUID();
    const first = locks.withInstanceLock(id, async () => { started.resolve(); await finish.promise; });
    await started.promise;
    const action = jest.fn().mockResolvedValue('metered');
    try {
      expect(await otherWorker.withInstanceLock(id, action, true)).toBeUndefined();
      expect(action).not.toHaveBeenCalled();
    } finally { finish.resolve(); await first; }
    expect(await otherWorker.withInstanceLock(id, action, true)).toBe('metered');
  });

  it('releases the lock after a credit action fails', async () => {
    const id = randomUUID();
    await expect(locks.withInstanceLock(id, async () => { throw new Error('Credit unavailable'); }))
      .rejects.toThrow('Credit unavailable');
    expect(await otherWorker.withInstanceLock(id, async () => 'recovered', true)).toBe('recovered');
  });

  it('bounds foreground lock waits without blocking application reads', async () => {
    const started = deferred();
    const finish = deferred();
    const id = randomUUID();
    const first = locks.withInstanceLock(id, async () => { started.resolve(); await finish.promise; });
    await started.promise;
    try {
      await expect(otherWorker.withInstanceLock(id, async () => 'settled'))
        .rejects.toMatchObject({ code: '55P03' });
      expect((await application.query('select 1 as available')).rows[0].available).toBe(1);
    } finally { finish.resolve(); await first; }
  }, 10_000);
});
