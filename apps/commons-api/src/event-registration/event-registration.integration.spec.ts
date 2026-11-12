import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { NotFoundException } from '@nestjs/common';
import { EncryptionService } from '~/modules/encryption/encryption.service';
import { EventRegistrationService } from './event-registration.service';
import type { VerifiedCharge } from './paystack.service';
jest.mock('~/project/project.service', () => ({ ProjectService: class {} }));

const url = process.env.EVENT_REGISTRATION_TEST_DATABASE_URL;
(url ? describe : describe.skip)('event registrations with PostgreSQL', () => {
  const namespace = 'event_test_' + randomUUID().replaceAll('-', '');
  const projectId = randomUUID(),
    otherProjectId = randomUUID(),
    owner = 'owner-test',
    other = 'other-test';
  const key = 'sk_test_' + 'a'.repeat(40);
  const previousMaster = process.env.TOOL_KEY_ENCRYPTION_MASTER;
  let admin: ReturnType<typeof postgres>,
    client: ReturnType<typeof postgres>,
    service: EventRegistrationService,
    accountId: string;
  let sequence = 0;
  const charges = new Map<string, VerifiedCharge>();
  const provider = {
    call: jest.fn(async () => []),
    initialize: jest.fn(async (_key: string, body: any) => {
      charges.set(body.reference, {
        ...body,
        domain: 'test',
        id: ++sequence,
        status: 'success',
      });
      return {
        reference: body.reference,
        authorization_url: 'https://checkout.paystack.com/' + body.reference,
      };
    }),
    verify: jest.fn(async (_key: string, ref: string) => charges.get(ref)!),
  };
  const config = (patch = {}) => ({
    title: 'Integration camp',
    amountMinor: 800000,
    capacity: 2,
    currency: 'KES',
    agreementText: 'I have authority to book and agree to these terms.',
    fields: [],
    ...patch,
  });
  const checkout = (participants = 1, idempotencyKey = randomUUID()) => ({
    idempotencyKey,
    name: 'Test Parent',
    email: 'parent@example.invalid',
    phone: '+254700000000',
    participants: Array.from({ length: participants }, () => ({})),
    agreed: true,
  });
  const event = async (patch = {}) =>
    service.save(owner, projectId, {
      slug: 'test-' + randomUUID(),
      config: config(patch),
      status: 'open',
    });
  beforeAll(async () => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(url!).hostname))
      throw new Error('Integration tests require isolated local PostgreSQL');
    admin = postgres(url!, { max: 1 });
    await admin.unsafe(`CREATE SCHEMA "${namespace}"`);
    client = postgres(url!, { max: 4, connection: { search_path: namespace } });
    await client.unsafe(
      'CREATE TABLE project (project_id uuid PRIMARY KEY, deleted_at timestamptz); CREATE TABLE project_page (page_id uuid PRIMARY KEY, project_id uuid, slug text, status text, deleted_at timestamptz)',
    );
    await client.unsafe(
      readFileSync(
        join(
          __dirname,
          '../../migrations/versioned/047_event_registrations.sql',
        ),
        'utf8',
      ),
    );
    await client`INSERT INTO project (project_id) VALUES (${projectId}),(${otherProjectId})`;
    process.env.TOOL_KEY_ENCRYPTION_MASTER = '12'.repeat(32);
    const projects = {
      requireProject: async (principal: string, id: string) => {
        if (
          !(
            (principal === owner && id === projectId) ||
            (principal === other && id === otherProjectId)
          )
        )
          throw new NotFoundException();
        return {};
      },
    };
    service = new EventRegistrationService(
      drizzle(client) as any,
      projects as any,
      new EncryptionService(),
      provider as any,
    );
    accountId = (
      (await service.connectPaystack(owner, projectId, {
        secretKey: key,
      })) as any
    ).accountId;
  });
  afterAll(async () => {
    if (previousMaster === undefined)
      delete process.env.TOOL_KEY_ENCRYPTION_MASTER;
    else process.env.TOOL_KEY_ENCRYPTION_MASTER = previousMaster;
    await client?.end();
    if (admin) {
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
      await admin.end();
    }
  });
  it('serializes concurrent reservations and cannot oversell the last place', async () => {
    const e = await event();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.checkout(e.slug, checkout())),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(6);
    expect((await service.publicEvent(e.slug)).available).toBe(0);
  });
  it('a double click returns the same checkout and only reserves once', async () => {
    const e = await event();
    const body = checkout();
    const [a, b] = await Promise.all([
      service.checkout(e.slug, body),
      service.checkout(e.slug, body),
    ]);
    expect(a.reference).toBe(b.reference);
    expect((await service.publicEvent(e.slug)).available).toBe(1);
    await expect(
      service.checkout(e.slug, { ...body, email: 'different@example.invalid' }),
    ).rejects.toThrow('details changed');
  });
  it('confirms a verified payment once, including concurrent callbacks', async () => {
    const e = await event();
    const r = await service.checkout(e.slug, checkout());
    const [a, b] = await Promise.all([
      service.verify(e.slug, r.reference),
      service.verify(e.slug, r.reference),
    ]);
    expect(a.status).toBe('confirmed');
    expect(b.status).toBe('confirmed');
    const output = await service.status(e.slug, r.reference);
    expect(output.paymentStatus).toBe('paid');
    expect(output).not.toHaveProperty('contact');
    expect(output).not.toHaveProperty('participants');
    expect((await service.publicEvent(e.slug)).available).toBe(1);
  });
  it('does not fulfill test/live mismatches or substitute payments', async () => {
    const e = await event();
    const r = await service.checkout(e.slug, checkout());
    const charge = charges.get(r.reference)!;
    charges.set(r.reference, { ...charge, domain: 'live' });
    await expect(service.verify(e.slug, r.reference)).rejects.toThrow(
      'could not be matched',
    );
    charges.set(r.reference, {
      ...charge,
      metadata: { ...charge.metadata, registrationId: randomUUID() },
    });
    await expect(service.verify(e.slug, r.reference)).rejects.toThrow(
      'could not be matched',
    );
    expect((await service.status(e.slug, r.reference)).status).toBe('pending');
  });
  it('holds wrong-amount and wrong-currency payments for review, never confirmation', async () => {
    for (const patch of [{ amount: 1 }, { currency: 'NGN' }]) {
      const e = await event(),
        r = await service.checkout(e.slug, checkout()),
        charge = charges.get(r.reference)!;
      charges.set(r.reference, { ...charge, ...patch });
      const receipt = await service.verify(e.slug, r.reference);
      expect(receipt.status).toBe('review');
      expect(receipt.paymentStatus).toBe('paid');
      expect((await service.publicEvent(e.slug)).available).toBe(2);
    }
  });
  it('does not confirm a late payment after an expired hold has been sold', async () => {
    const e = await event({ capacity: 1 }),
      late = await service.checkout(e.slug, checkout());
    await client`UPDATE event_registration SET expires_at=now()-interval '1 minute' WHERE reference=${late.reference}`;
    const fresh = await service.checkout(e.slug, checkout());
    await service.verify(e.slug, fresh.reference);
    const result = await service.verify(e.slug, late.reference);
    expect(result.status).toBe('review');
    expect(result.paymentStatus).toBe('paid');
    expect((await service.publicEvent(e.slug)).available).toBe(0);
  });
  it('releases a failed initialization and confirms free events without Paystack', async () => {
    const e = await event({ capacity: 1 });
    provider.initialize.mockRejectedValueOnce(new Error('Provider offline'));
    await expect(service.checkout(e.slug, checkout())).rejects.toThrow(
      'Provider offline',
    );
    expect((await service.publicEvent(e.slug)).available).toBe(1);
    const free = await event({ amountMinor: 0 });
    const previous = provider.initialize.mock.calls.length;
    const result = await service.checkout(free.slug, checkout());
    expect(result.status).toBe('confirmed');
    expect(result.paymentStatus).toBe('free');
    expect(provider.initialize.mock.calls).toHaveLength(previous);
  });
  it('enforces project ownership and does not expose another event receipt', async () => {
    const e = await event(),
      r = await service.checkout(e.slug, checkout()),
      e2 = await event();
    await expect(
      service.registrations(other, projectId, e.eventId),
    ).rejects.toThrow();
    await expect(service.status(e2.slug, r.reference)).rejects.toThrow(
      'Booking not found',
    );
    const data = await service.registrations(owner, projectId, e.eventId);
    expect(data.registrations).toHaveLength(1);
  });
  it('verifies raw signed notifications and ignores repeats', async () => {
    const e = await event(),
      r = await service.checkout(e.slug, checkout());
    const raw = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: { reference: r.reference },
      }),
    );
    const legacy = createHmac('sha512', key).update(raw).digest('hex');
    await expect(
      service.webhook(accountId, raw, { legacy: 'bad' }),
    ).rejects.toThrow('Invalid payment signature');
    await service.webhook(accountId, raw, { legacy });
    await service.webhook(accountId, raw, { legacy });
    expect((await service.status(e.slug, r.reference)).status).toBe(
      'confirmed',
    );
  });
  it('quotes percent and fixed discounts on the server and binds the final payment amount', async () => {
    const e = await event({ capacity: 10 });
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'team90',
      amountType: 'percent',
      amount: 90,
      maxRedemptions: 5,
    });
    const q = await service.quote(e.slug, { quantity: 2, code: ' team90 ' });
    expect(q).toMatchObject({
      amountMinor: 160000,
      originalAmountMinor: 1600000,
      discountAmountMinor: 1440000,
      discountCode: 'TEAM90',
    });
    expect(q).not.toHaveProperty('discountId');
    const r = await service.checkout(e.slug, {
      ...checkout(2),
      discountCode: 'team90',
      expectedAmountMinor: q.amountMinor,
    });
    expect(r.amountMinor).toBe(160000);
    expect((await service.verify(e.slug, r.reference)).status).toBe(
      'confirmed',
    );
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'FIXED',
      amountType: 'fixed',
      amount: 1000,
    });
    expect(
      (await service.quote(e.slug, { quantity: 2, code: 'FIXED' })).amountMinor,
    ).toBe(1500000);
    await expect(
      service.checkout(e.slug, {
        ...checkout(),
        discountCode: 'TEAM90',
        expectedAmountMinor: 1,
      }),
    ).rejects.toThrow('price changed');
    expect(await service.publicEvent(e.slug)).not.toHaveProperty('discounts');
  });
  it('serializes the last discount redemption, releasing expired holds without over-redeeming', async () => {
    const e = await event({ capacity: 10 });
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'LIMITED',
      amountType: 'percent',
      amount: 90,
      maxRedemptions: 1,
    });
    const body = () => ({
      ...checkout(),
      discountCode: 'LIMITED',
      expectedAmountMinor: 80000,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => service.checkout(e.slug, body())),
    );
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const first = results.find(
      (x) => x.status === 'fulfilled',
    ) as PromiseFulfilledResult<any>;
    await client`UPDATE event_registration SET expires_at=now()-interval '1 minute' WHERE reference=${first.value.reference}`;
    const second = await service.checkout(e.slug, body());
    expect(second.amountMinor).toBe(80000);
    expect((await service.verify(e.slug, first.value.reference)).status).toBe(
      'review',
    );
  });
  it('rejects invalid, expired and disabled codes and confirms a full discount without Paystack', async () => {
    const e = await event({ capacity: 10 });
    await expect(
      service.quote(e.slug, { quantity: 1, code: 'MISSING' }),
    ).rejects.toThrow('not available');
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'EXPIRED',
      amountType: 'percent',
      amount: 25,
      expiresAt: '2020-01-01T00:00:00Z',
    });
    await expect(
      service.quote(e.slug, { quantity: 1, code: 'EXPIRED' }),
    ).rejects.toThrow('not available');
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'DISABLED',
      amountType: 'percent',
      amount: 25,
      active: false,
    });
    await expect(
      service.quote(e.slug, { quantity: 1, code: 'DISABLED' }),
    ).rejects.toThrow('not available');
    await expect(
      service.saveDiscount(other, projectId, e.eventId, {
        code: 'BAD',
        amountType: 'percent',
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'GIFT',
      amountType: 'fixed',
      amount: 999999,
    });
    const r = await service.checkout(e.slug, {
      ...checkout(),
      discountCode: 'GIFT',
      expectedAmountMinor: 0,
    });
    expect(r).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'free',
      amountMinor: 0,
      discountAmountMinor: 800000,
    });
  });
  it('can reduce one KSh 8,000 registration to exactly KSh 10 for a live team test', async () => {
    const e = await event();
    await service.saveDiscount(owner, projectId, e.eventId, {
      code: 'CAMPTEAM10',
      label: 'Team checkout test',
      amountType: 'fixed',
      amount: 7990,
      maxRedemptions: 5,
    });
    const q = await service.quote(e.slug, { quantity: 1, code: 'campteam10' });
    expect(q.amountMinor).toBe(1000);
    const r = await service.checkout(e.slug, {
      ...checkout(),
      discountCode: q.discountCode,
      expectedAmountMinor: q.amountMinor,
    });
    expect(r).toMatchObject({
      amountMinor: 1000,
      originalAmountMinor: 800000,
      discountAmountMinor: 799000,
      discountCode: 'CAMPTEAM10',
    });
    expect((await service.verify(e.slug, r.reference)).paymentStatus).toBe(
      'paid',
    );
  });
});
