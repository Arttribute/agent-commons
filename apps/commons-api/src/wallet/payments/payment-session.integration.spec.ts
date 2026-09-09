import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { PaymentSessionService } from './payment-session.service';
const url = process.env.PAYMENT_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Postgres payment budget concurrency', () => {
  let client: ReturnType<typeof postgres>, service: PaymentSessionService;
  const agent = 'payment-test-agent',
    wallet = '11111111-1111-4111-8111-111111111111';
  beforeAll(async () => {
    if (!url?.includes('127.0.0.1:15432'))
      throw new Error('Tests require isolated local Postgres at port 15432');
    client = postgres(url, { max: 10 });
    await client.unsafe(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE TABLE IF NOT EXISTS agent(agent_id text PRIMARY KEY); CREATE TABLE IF NOT EXISTS agent_wallet(id uuid PRIMARY KEY,agent_id text REFERENCES agent(agent_id),is_active boolean,wallet_type text,encrypted_private_key text);',
    );
    await client.unsafe(
      readFileSync(
        'migrations/versioned/033_wallet_payment_sessions.sql',
        'utf8',
      ),
    );
    await client`INSERT INTO agent VALUES(${agent}) ON CONFLICT DO NOTHING`;
    await client`INSERT INTO agent_wallet VALUES(${wallet},${agent},true,'eoa','enc:test') ON CONFLICT DO NOTHING`;
    service = new PaymentSessionService(drizzle(client) as any);
  });
  afterAll(async () => {
    await client`DELETE FROM agent WHERE agent_id=${agent}`.catch(() => {});
    await client.end();
  });
  it('reserves atomically across concurrent callers and rejects duplicate requests', async () => {
    const policy = {
      network: 'eip155:84532' as const,
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x1111111111111111111111111111111111111111',
      origin: 'https://payments.test',
      maxPaymentUnits: '600',
    };
    const created = await service.create(
      agent,
      wallet,
      'runtime-1',
      policy,
      '1000',
      new Date(Date.now() + 60000).toISOString(),
    );
    const session = await service.load(
      agent,
      created.id as string,
      'runtime-1',
    );
    const results = await Promise.allSettled([
      service.reserve(session, 'request-a', '600', 'https://payments.test'),
      service.reserve(session, 'request-b', '600', 'https://payments.test'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const updated = await service.load(agent, session.id, 'runtime-1');
    expect(BigInt(updated.reserved_units)).toBe(600n);
    const key = results[0].status === 'fulfilled' ? 'request-a' : 'request-b';
    await expect(
      service.reserve(session, key, '1', 'https://payments.test'),
    ).rejects.toThrow('already attempted');
    await expect(
      service.load(agent, session.id, 'different-runtime'),
    ).rejects.toThrow();
    await service.revoke(agent, session.id);
    await expect(
      service.reserve(session, 'request-c', '1', 'https://payments.test'),
    ).rejects.toThrow('expired or revoked');
    await expect(
      service.load(agent, session.id, 'runtime-1'),
    ).rejects.toThrow();
  });
});
