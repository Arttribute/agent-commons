import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as schema from '#/models/schema';
import { CreditService } from './credit.service';
import { ReferralService, referralEmailHash } from './referral.service';

jest.setTimeout(60_000);
const url = process.env.REFERRAL_TEST_DATABASE_URL;
(url ? describe : describe.skip)('referrals against PostgreSQL', () => {
  const namespace = `referral_test_${randomUUID().replace(/-/g, '')}`;
  let client: ReturnType<typeof postgres>;
  let referrals: ReferralService;
  let credits: CreditService;
  let code: string;
  beforeAll(async () => {
    client = postgres(url!, { max: 8, connection: { search_path: namespace }, onnotice: () => {}, ssl: process.env.REFERRAL_TEST_SSL === 'require' ? { rejectUnauthorized: false } : false });
    await client.unsafe(`create schema ${namespace}`);
    await client.unsafe(readFileSync('migrations/add-credit-ledger.sql', 'utf8').replace('create extension if not exists "uuid-ossp";', ''));
    await client.unsafe(`
      alter table credit_ledger_entry add remaining_amount integer, add transfer_id uuid;
      create table credit_account (principal_id text primary key, balance integer not null default 0,
        reserved integer not null default 0, lifetime_granted bigint not null default 0,
        lifetime_spent bigint not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create table credit_reservation (reservation_id uuid primary key default gen_random_uuid(),
        principal_id text not null, amount integer not null, captured_amount integer not null default 0,
        status text not null default 'active', purpose text not null, idempotency_key text not null,
        agent_id text, session_id uuid, metadata jsonb default '{}', expires_at timestamptz not null,
        created_at timestamptz default now(), updated_at timestamptz default now());
    `);
    await client.unsafe(readFileSync('migrations/versioned/044_referral_program.sql', 'utf8'));
    const db = drizzle(client, { schema }) as any;
    credits = new CreditService(db);
    referrals = new ReferralService(db, credits);
  }, 30_000);
  afterAll(async () => {
    if (client) { await client.unsafe(`drop schema ${namespace} cascade`); await client.end(); }
  });
  beforeEach(async () => {
    await client.unsafe('truncate referral_signup, referral_invitation, referral_profile, credit_ledger_entry, credit_account, credit_reservation');
    await referrals.activate({ principalId: 'usr_referrer', email: 'owner@gmail.com', emailVerified: true, firstActivation: false, activatedAt: new Date().toISOString() });
    code = (await referrals.summary('usr_referrer')).code;
  });
  const activation = (id = 'usr_friend', email = 'friend@example.com') => ({ principalId: id, email, emailVerified: true, firstActivation: true, activatedAt: new Date().toISOString(), code });

  it('starts new users at 1,000 credits once under concurrent requests without refilling spent credits', async () => {
    const principalId = 'usr_new_customer';
    const balances = await Promise.all(Array.from({ length: 8 }, () => credits.getBalance({ principalId })));
    expect(balances.every((balance) => balance.balance === 1000)).toBe(true);
    expect(await client`select amount,remaining_amount from credit_ledger_entry where principal_id=${principalId} and event_type='new_user_welcome'`).toEqual([
      { amount: 1000, remaining_amount: 1000 },
    ]);
    await credits.debit({ principalId, amount: 100, eventType: 'agent_run_usage', sourcePlatform: 'agent_commons', idempotencyKey: 'new-user-spend' });
    expect((await credits.getBalance({ principalId })).balance).toBe(900);
    expect((await client`select * from credit_ledger_entry where principal_id=${principalId} and event_type='new_user_welcome'`)).toHaveLength(1);
  });

  it('preserves an existing user balance after the welcome amount increases', async () => {
    await client`insert into credit_account (principal_id,balance,lifetime_granted) values ('usr_existing_customer',42,500)`;
    expect((await credits.getBalance({ principalId: 'usr_existing_customer' })).balance).toBe(42);
    expect((await client`select * from credit_ledger_entry where principal_id='usr_existing_customer'`)).toHaveLength(0);
    expect(Number((await client`select lifetime_granted from credit_account where principal_id='usr_existing_customer'`)[0].lifetime_granted)).toBe(500);
  });

  it('grants a total of 100,000 at signup once under concurrent callbacks without refilling spent credits', async () => {
    const input = { principalId: 'usr_signup_customer', signedUpAt: '2026-11-17T00:00:00+03:00', createdBy: 'signup_service' };
    const results = await Promise.all(Array.from({ length: 8 }, () => credits.grantSignupCredits(input)));
    expect(new Set(results.map((entry) => entry.entryId)).size).toBe(1);
    expect((await credits.getBalance(input)).balance).toBe(100_000);
    expect(Number((await client`select sum(amount) as total from credit_ledger_entry where principal_id=${input.principalId}`)[0].total)).toBe(100_000);
    await credits.debit({ principalId: input.principalId, amount: 100, eventType: 'agent_run_usage', sourcePlatform: 'agent_commons', idempotencyKey: 'signup-spend' });
    await credits.grantSignupCredits(input);
    expect((await credits.getBalance(input)).balance).toBe(99_900);
  });

  it('sets the database default to GPT-5.5 without changing existing agents before the API rollout', async () => {
    await client.unsafe(`create table agent (agent_id text primary key, model_provider text default 'openai', model_id text default 'gpt-5.4-mini', is_default boolean default false);
      insert into agent (agent_id,is_default,model_id) values ('copilot',true,'gpt-5.4-mini'),('custom',false,'gpt-5.4');`);
    await client.unsafe(readFileSync('migrations/versioned/049_gpt_55_default.sql', 'utf8'));
    await client`insert into agent (agent_id) values ('new-agent')`;
    expect(await client`select agent_id,model_id from agent order by agent_id`).toEqual([
      { agent_id: 'copilot', model_id: 'gpt-5.4-mini' },
      { agent_id: 'custom', model_id: 'gpt-5.4' },
      { agent_id: 'new-agent', model_id: 'gpt-5.5' },
    ]);
    await client.unsafe('drop table agent');
  });

  it('includes earlier welcome credits and preserves unrelated gifts when bringing today’s signup to 100,000', async () => {
    const input = { principalId: 'usr_signup_early', signedUpAt: '2026-11-17T00:00:00+03:00', createdBy: 'signup_service' };
    await credits.getBalance(input);
    await credits.grant({ principalId: input.principalId, amount: 2000, eventType: 'admin_grant', sourcePlatform: 'system', idempotencyKey: 'signup-gift' });
    await credits.debit({ principalId: input.principalId, amount: 100, eventType: 'agent_run_usage', sourcePlatform: 'agent_commons', idempotencyKey: 'early-signup-spend' });
    await credits.grantSignupCredits(input);
    expect((await credits.getBalance(input)).balance).toBe(101_900);
  });

  it('rejects older or invalid signup dates and non-user principals without creating credit accounts', async () => {
    for (const input of [
      { principalId: 'usr_before_cutoff', signedUpAt: '2026-11-16T23:59:59+03:00' },
      { principalId: 'usr_invalid_date', signedUpAt: 'not-a-date' },
      { principalId: 'usr_future_date', signedUpAt: '2999-01-01T00:00:00Z' },
      { principalId: 'svc_signup_service', signedUpAt: '2026-11-17T00:00:00+03:00' },
    ]) {
      await expect(credits.grantSignupCredits({ ...input, createdBy: 'signup_service' })).rejects.toMatchObject({ status: 400 });
      expect((await client`select * from credit_account where principal_id=${input.principalId}`)).toHaveLength(0);
    }
  });

  it('awards exactly 1,000 credits once under parallel signup callbacks', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => referrals.activate(activation())));
    expect(results.filter((result) => result.rewarded)).toHaveLength(1);
    expect((await credits.getBalance({ principalId: 'usr_referrer' })).balance).toBe(2000);
    expect((await referrals.summary('usr_referrer')).earned).toBe(1000);
    expect((await client`select * from referral_signup`)).toHaveLength(1);
    expect((await client`select * from credit_ledger_entry where event_type='referral_signup'`)).toHaveLength(1);
  });

  it('does not reward self referrals, aliases, existing accounts or unverified signups', async () => {
    expect((await referrals.activate(activation('usr_referrer', 'owner@gmail.com'))).rewarded).toBe(false);
    expect((await referrals.activate(activation('usr_alias', 'o.w.ner+alias@googlemail.com'))).rewarded).toBe(false);
    expect((await referrals.activate({ ...activation(), firstActivation: false })).rewarded).toBe(false);
    expect((await referrals.activate({ ...activation(), emailVerified: false })).rewarded).toBe(false);
    await credits.getBalance({ principalId: 'usr_existing' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await referrals.activate(activation('usr_existing'))).rewarded).toBe(false);
    expect((await referrals.summary('usr_referrer')).earned).toBe(0);
  });

  it('deduplicates verified email aliases and competing referrers globally', async () => {
    await referrals.activate({ ...activation('usr_second', 'second@example.com'), firstActivation: false });
    const secondCode = (await referrals.summary('usr_second')).code;
    const results = await Promise.all([
      referrals.activate(activation('usr_first', 'new.friend@gmail.com')),
      referrals.activate({ ...activation('usr_duplicate', 'newfriend+invite@googlemail.com'), code: secondCode }),
    ]);
    expect(results.filter((result) => result.rewarded)).toHaveLength(1);
    expect((await client`select * from referral_signup`)).toHaveLength(1);
  });

  it('retries an attested signup even if its welcome account was provisioned during an outage', async () => {
    const input = activation();
    await credits.getBalance({ principalId: input.principalId });
    // Set the attested ordering explicitly; the database may run on a
    // container whose wall clock differs slightly from the test runner's.
    await client`update credit_account set created_at=${new Date(Date.parse(input.activatedAt) + 1000)} where principal_id=${input.principalId}`;
    expect((await referrals.activate(input)).rewarded).toBe(true);
  });

  it('rolls back the ledger and balance when signup persistence fails', async () => {
    await client.unsafe("create function reject_signup() returns trigger language plpgsql as $$ begin raise exception 'test persistence failure'; end; $$; create trigger fail_signup before insert on referral_signup for each row execute function reject_signup()");
    try {
      await expect(referrals.activate(activation())).rejects.toThrow();
      expect((await client`select * from credit_ledger_entry where event_type='referral_signup'`)).toHaveLength(0);
      expect((await client`select * from credit_account where principal_id='usr_referrer'`)).toHaveLength(0);
    } finally { await client.unsafe('drop trigger fail_signup on referral_signup; drop function reject_signup()'); }
  });

  it('reserves one email under concurrent sends, retains its idempotency key, and enforces a daily limit', async () => {
    const invitations = await Promise.all(Array.from({ length: 6 }, () => referrals.reserveInvitation('usr_referrer', ' Friend@Example.com ')));
    expect(new Set(invitations.map((invite) => invite.invitationId)).size).toBe(1);
    await referrals.completeInvitation('usr_referrer', invitations[0].invitationId, true);
    expect((await referrals.reserveInvitation('usr_referrer', 'friend@example.com')).alreadySent).toBe(true);
    for (let i = 0; i < 9; i++) await referrals.reserveInvitation('usr_referrer', `friend${i}@example.com`);
    await expect(referrals.reserveInvitation('usr_referrer', 'one-too-many@example.com')).rejects.toMatchObject({ status: 429 });
  });
});

describe('referral email identity', () => {
  it('normalizes Gmail dots, plus aliases, case and legacy domain', () => {
    expect(referralEmailHash(' New.Friend+invite@Googlemail.com ')).toBe(referralEmailHash('newfriend@gmail.com'));
  });
  it('does not collapse meaningful dots on other providers', () => {
    expect(referralEmailHash('new.friend@example.com')).not.toBe(referralEmailHash('newfriend@example.com'));
  });
});
