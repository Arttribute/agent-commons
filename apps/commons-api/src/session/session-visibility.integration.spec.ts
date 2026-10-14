import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import * as schema from '#/models/schema';
import { SessionService } from './session.service';
import { SessionSuggestionsService } from './session-suggestions.service';

jest.setTimeout(60_000);
const url = process.env.REFERRAL_TEST_DATABASE_URL;
(url ? describe : describe.skip)('product session visibility against PostgreSQL', () => {
  const namespace = `session_visibility_${randomUUID().replace(/-/g, '')}`;
  let client: ReturnType<typeof postgres>;
  let service: SessionService;
  let db: any;
  beforeAll(async () => {
    client = postgres(url!, { max: 2, connection: { search_path: namespace }, onnotice: () => {}, ssl: process.env.REFERRAL_TEST_SSL === 'require' ? { rejectUnauthorized: false } : false });
    await client.unsafe(`create schema ${namespace}`);
    await client.unsafe(`
      create table agent (agent_id text primary key, name text);
      create table session (session_id uuid primary key default gen_random_uuid(), agent_id text, initiator text,
        initiator_type text, title text, project_id text, created_at timestamptz default now(), updated_at timestamptz default now());
      insert into agent values ('active_agent','Commons Copilot');
      insert into session (agent_id,initiator,initiator_type,title) values
        ('active_agent','usr_alice','web','Current product chat'),
        ('active_agent','usr_alice','cli','Old AGC CLI chat'),
        ('timeline_game_master','usr_alice','web','Old Arcade system chat'),
        ('active_agent','usr_alice','commonos','Common OS chat'),
        ('active_agent','usr_bob','web','Another account chat');
    `);
    db = drizzle(client, { schema });
    service = new SessionService(db, {} as any);
  }, 30_000);
  afterAll(async () => { if (client) { await client.unsafe(`drop schema ${namespace} cascade`); await client.end(); } });

  it('excludes other products and orphaned Arcade/system sessions from user and agent lists', async () => {
    expect((await service.getSessionsByInitiator({ initiator: 'usr_alice', commonsSurface: true })).map((session) => session.title)).toEqual(['Current product chat']);
    expect((await service.getSessionsByAgentAndInitiator({ initiator: 'usr_alice', agentId: 'active_agent', commonsSurface: true })).map((session) => session.title)).toEqual(['Current product chat']);
    expect(await service.getSessionsByInitiator({ initiator: 'usr_alice' })).toHaveLength(4);
  });

  it('applies the same product boundary to personalized chat suggestions', async () => {
    const invoke = jest.fn().mockResolvedValue({ content: '{"suggestions":[{"text":"Research a topic","kind":"research"}]}' });
    const suggestions = new SessionSuggestionsService(db, { build: () => ({ invoke }) } as any);
    await suggestions.suggest('usr_alice');
    const context = invoke.mock.calls[0][0][1].content;
    expect(context).toContain('Current product chat');
    expect(context).not.toContain('Old AGC');
    expect(context).not.toContain('Arcade');
    expect(context).not.toContain('Common OS');
  });

  it('includes project membership in summaries so project chats do not leak into ungrouped recents', async () => {
    await client`update session set project_id='project_example' where title='Current product chat'`;
    const [session] = await service.getSessionsByInitiator({ initiator: 'usr_alice', commonsSurface: true });
    expect(session.projectId).toBe('project_example');
  });
});
