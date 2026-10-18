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
    await new Promise((resolve) => setTimeout(resolve, 5));
    await credits.getBalance({ principalId: input.principalId });
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
