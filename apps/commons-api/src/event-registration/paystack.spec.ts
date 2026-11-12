import { createHmac } from 'node:crypto';
import { validPaystackSignature } from './paystack.service';
import { checkoutInput, eventConfigSchema, parse } from './event-policy';

describe('event payment boundaries', () => {
  const raw = Buffer.from(
    '{"event":"charge.success","data":{"amount":800000}}',
  );
  const key = 'sk_test_only_a_fixture';
  it('authenticates the exact raw webhook, rejecting malformed and forged signatures', () => {
    const signature = createHmac('sha512', key).update(raw).digest('hex');
    expect(validPaystackSignature(raw, { legacy: signature }, key)).toBe(true);
    expect(
      validPaystackSignature(
        Buffer.concat([raw, Buffer.from(' ')]),
        { legacy: signature },
        key,
      ),
    ).toBe(false);
    for (const invalid of ['', 'x', '0'.repeat(128), 'z'.repeat(128)])
      expect(validPaystackSignature(raw, { legacy: invalid }, key)).toBe(false);
  });
  it('checks modern webhook timestamps and does not fall back from a bad modern signature', () => {
    const signing = 'whsec_fixture',
      stamp = '1700000000',
      now = 1700000000000;
    const signature = createHmac('sha512', signing)
      .update(stamp + '.')
      .update(raw)
      .digest('hex');
    expect(
      validPaystackSignature(
        raw,
        { modern: `t=${stamp},v1=whk_one:${signature}` },
        key,
        signing,
        now,
      ),
    ).toBe(true);
    expect(
      validPaystackSignature(
        raw,
        { modern: `t=${stamp},v1=whk_one:${signature}` },
        key,
        signing,
        now + 301000,
      ),
    ).toBe(false);
    expect(
      validPaystackSignature(
        raw,
        {
          legacy: createHmac('sha512', key).update(raw).digest('hex'),
          modern: `t=${stamp},v1=whk_bad:${'0'.repeat(128)}`,
        },
        key,
        signing,
        now,
      ),
    ).toBe(false);
  });
  const config = parse(eventConfigSchema, {
    title: 'Camp',
    amountMinor: 800000,
    capacity: 30,
    agreementText: 'I am the parent or guardian and agree.',
    fields: [
      {
        key: 'age',
        type: 'select',
        label: 'Age',
        required: true,
        options: ['7–9', '10–13'],
      },
    ],
  });
  const input = {
    idempotencyKey: 'unique-checkout-12345',
    name: 'Parent Example',
    email: 'Parent@example.invalid',
    phone: '+254700000000',
    participants: [{ age: '7–9', unrequestedSensitiveField: 'discard me' }],
    agreed: true,
  };
  it('collects only configured participant fields and normalizes adult contact', () => {
    const result = checkoutInput(config, input);
    expect(result.participants).toEqual([{ age: '7–9' }]);
    expect(result.contact.email).toBe('parent@example.invalid');
    expect(result).not.toHaveProperty('amountMinor');
  });
  it('requires consent, validates choices and bounds group size', () => {
    expect(() => checkoutInput(config, { ...input, agreed: false })).toThrow();
    expect(() =>
      checkoutInput(config, { ...input, participants: [{ age: '3' }] }),
    ).toThrow();
    expect(() =>
      checkoutInput(config, { ...input, participants: [] }),
    ).toThrow();
    expect(() =>
      checkoutInput(config, {
        ...input,
        participants: Array(5).fill({ age: '7–9' }),
      }),
    ).toThrow();
    expect(() =>
      checkoutInput(config, { ...input, website: 'bot.example' }),
    ).toThrow();
  });
  it('prevents an idempotency token silently reusing an old price or a changed agreement', () => {
    const original = checkoutInput(config, input).hash;
    expect(
      checkoutInput({ ...config, amountMinor: 900000 }, input).hash,
    ).not.toBe(original);
    expect(
      checkoutInput(
        { ...config, agreementText: 'A new consent agreement.' },
        input,
      ).hash,
    ).not.toBe(original);
  });
});
