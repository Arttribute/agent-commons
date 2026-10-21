import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import * as schema from '#/models/schema';
import { ToolKeyService } from './tool-key.service';
import { EncryptionService } from '../modules/encryption/encryption.service';

const url = process.env.RESOURCE_UPGRADE_TEST_DATABASE_URL;
(url ? describe : describe.skip)('owner-level vault keys against migrated PostgreSQL', () => {
  const namespace = `vault_${randomUUID().replace(/-/g, '')}`;
  let client: ReturnType<typeof postgres>;
  let service: ToolKeyService;
  const oldMaster = process.env.TOOL_KEY_ENCRYPTION_MASTER;
  beforeAll(async () => {
    if (!url?.includes('127.0.0.1:15432')) throw new Error('Use isolated local PostgreSQL at port 15432');
    client = postgres(url, {max: 1, onnotice: () => {}});
    await client.unsafe(`CREATE SCHEMA "${namespace}"; SET search_path TO "${namespace}", public;`);
    const baseline = readFileSync('migrations/versioned/000_baseline.sql', 'utf8');
    const table = baseline.match(/CREATE TABLE public\.tool_key \([\s\S]*?\n\);/)![0]
      .replace('public.tool_key', 'tool_key').replace('extensions.uuid_generate_v4()', 'gen_random_uuid()');
    await client.unsafe(table);
    await client.unsafe('ALTER TABLE tool_key ADD PRIMARY KEY(key_id); ALTER TABLE tool_key ADD UNIQUE(tool_id, owner_id, owner_type);');
    process.env.TOOL_KEY_ENCRYPTION_MASTER = randomBytes(32).toString('hex');
    service = new ToolKeyService(drizzle(client, {schema}) as any, new EncryptionService());
  });
  afterAll(async () => {
    if (oldMaster === undefined) delete process.env.TOOL_KEY_ENCRYPTION_MASTER; else process.env.TOOL_KEY_ENCRYPTION_MASTER = oldMaster;
    if (client) {await client.unsafe(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`); await client.end();}
  });
  it('reproduces the legacy insert failure, then encrypts multiple owner-level credentials without weakening ownership', async () => {
    const input = {keyName: 'common-business:digitax:test:a', value: 'fixture-secret-one', ownerId: 'owner-a', ownerType: 'user' as const};
    await expect(service.createKey(input)).rejects.toThrow('Failed to create key');
    const migration = readFileSync('migrations/versioned/045_global_tool_keys.sql', 'utf8');
    await client.unsafe(migration); await client.unsafe(migration);
    const first = await service.createKey(input);
    const second = await service.createKey({...input, keyName: 'common-business:digitax:test:b', value: 'fixture-secret-two'});
    expect(first.keyId).not.toBe(second.keyId);
    expect(first.toolId).toBeNull();
    expect(JSON.stringify(first)).not.toContain('fixture-secret-one');
    const [stored] = await client`SELECT encrypted_value FROM tool_key WHERE key_id=${first.keyId}`;
    expect(stored.encrypted_value).not.toContain('fixture-secret-one');
    expect(await service.getDecryptedKey(first.keyId)).toBe('fixture-secret-one');
    await expect(service.getKeyMetadata(first.keyId, {ownerId: 'owner-b', ownerType: 'user'})).rejects.toThrow('not found');
    expect(await service.listKeys('owner-a', 'user')).toHaveLength(2);
    expect(await service.listKeys('owner-b', 'user')).toHaveLength(0);
  });
});
