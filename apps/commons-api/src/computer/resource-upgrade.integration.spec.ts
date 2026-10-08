import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { copilotChange } from '#/models/schema';
import { ResourceUpgradeService } from './resource-upgrade.service';

const url = process.env.RESOURCE_UPGRADE_TEST_DATABASE_URL;
(url ? describe : describe.skip)('resource proposals against migrated PostgreSQL', () => {
  const namespace = `compute_approval_${randomUUID().replace(/-/g, '')}`;
  let client: ReturnType<typeof postgres>;
  let service: ResourceUpgradeService;
  const computers = { assertTemporaryResourceProfile: jest.fn().mockResolvedValue(undefined), getConfig: jest.fn().mockResolvedValue({ enabled: true, allowAgentStart: true, resourceProfile: 'starter', metadata: {} }), updateConfig: jest.fn() };
  beforeAll(async () => {
    if (!url?.includes('127.0.0.1:15432')) throw new Error('Use isolated local PostgreSQL at port 15432');
    client = postgres(url, { max: 1, onnotice: () => {} });
    await client.unsafe(`CREATE SCHEMA "${namespace}"; SET search_path TO "${namespace}", public; CREATE TABLE agent(agent_id text PRIMARY KEY, owner_user_id text);`);
    await client.unsafe(readFileSync('migrations/versioned/009_native_commons_copilot.sql', 'utf8'));
    await client.unsafe(readFileSync('migrations/versioned/012_copilot_change_session.sql', 'utf8'));
    await client`INSERT INTO agent(agent_id,owner_user_id) VALUES('acceptance-agent','acceptance-owner')`;
    const agent = pgTable('agent', { agentId: text('agent_id').primaryKey(), ownerUserId: text('owner_user_id') });
    service = new ResourceUpgradeService(drizzle(client, { schema: { agent, copilotChange } }) as any, computers as any, {} as any, {} as any);
  });
  afterAll(async () => {
    if (client) { await client.unsafe(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`); await client.end(); }
  });
  it('reproduces the old constraint failure, then persists reviewable CPU and GPU requests', async () => {
    const request = { agentId: 'acceptance-agent', ownerId: 'acceptance-owner', sessionId: '11111111-1111-4111-8111-111111111111', profile: 'performance' as const, minutes: 5, reason: 'Verify temporary resources without activation' };
    await expect(service.request(request)).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23514', constraint_name: 'copilot_change_scope_check' }) });
    const migration = readFileSync('migrations/versioned/043_computer_approval_scope.sql', 'utf8');
    await client.unsafe(migration);
    await client.unsafe(migration); // Retry-safe migration.
    for (const profile of ['performance', 'gpu'] as const) {
      const result = await service.request({ ...request, profile });
      expect(result).toMatchObject({ requiresConfirmation: true, changes: [expect.objectContaining({ scope: 'computers', status: 'pending', sessionId: request.sessionId, after: expect.objectContaining({ profile }) })] });
    }
    expect(await service.pending(request.agentId, request.ownerId)).toHaveLength(2);
    expect(computers.updateConfig).not.toHaveBeenCalled();
    await expect(client`INSERT INTO copilot_change(agent_id,owner_user_id,scope,resource_type,action,title) VALUES('acceptance-agent','acceptance-owner','invalid-scope','computer','update','Rejected')`).rejects.toThrow(/copilot_change_scope_check/);
  });
});
