import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  TransferAllowanceService,
  usdcUnits,
} from './transfer-allowance.service';

const recipient = '0x4413c8be289ea99935b02a934ceb5d3298260d86';

function allowance(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    recipients: [],
    max_transfer_units: '2000000',
    budget_units: '5000000',
    spent_units: '0',
    ...overrides,
  };
}

/** Fake transaction that answers each SQL statement in order. */
function serviceWith(responses: unknown[][]) {
  const statements: string[] = [];
  const tx = {
    execute: jest.fn(async (query: any) => {
      statements.push(
        (query.queryChunks ?? [])
          .map((c: any) => (Array.isArray(c?.value) ? c.value.join('') : ''))
          .join(' '),
      );
      return responses.shift() ?? [];
    }),
  };
  const db = {
    execute: jest.fn(),
    transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return {
    service: new TransferAllowanceService(db as any),
    tx,
    db,
    statements,
  };
}

const request = {
  agentId: 'agent',
  walletId: '22222222-2222-2222-2222-222222222222',
  chainId: '84532',
  to: recipient,
  amountUnits: 1_000_000n,
  idempotencyKey: 'run-1:call-1',
};

describe('transfer allowance reservation', () => {
  it('reserves budget from an allowance that covers recipient and amount', async () => {
    const transfer = { id: 't1', state: 'reserved' };
    const { service, statements } = serviceWith([
      [allowance()],
      [],
      [transfer],
      [],
    ]);
    await expect(service.reserve(request)).resolves.toEqual({
      transfer,
      replayed: false,
    });
    expect(statements[0]).toContain('FOR UPDATE');
    expect(statements[3]).toContain('spent_units = spent_units +');
  });

  it('returns the earlier transfer for a repeated tool call instead of paying twice', async () => {
    const previous = { id: 't0', state: 'confirmed' };
    const { service, tx } = serviceWith([[allowance()], [previous]]);
    await expect(service.reserve(request)).resolves.toEqual({
      transfer: previous,
      replayed: true,
    });
    expect(tx.execute).toHaveBeenCalledTimes(2);
  });

  it.each([
    [[], 'No active transfer allowance'],
    [
      [allowance({ recipients: ['0x' + '9'.repeat(40)] })],
      'not on the owner-approved list',
    ],
    [[allowance({ max_transfer_units: '500000' })], 'maximum per transfer'],
    [[allowance({ spent_units: '4500000' })], 'remaining transfer budget'],
  ])('refuses spending outside the allowance', async (rows, message) => {
    const { service, tx } = serviceWith([rows, []]);
    const result = service.reserve(request);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(result).rejects.toThrow(message as string);
    // Nothing is inserted or charged.
    expect(tx.execute.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('transfer allowance creation', () => {
  const service = new TransferAllowanceService({ execute: jest.fn() } as any);
  const valid = {
    walletId: '22222222-2222-2222-2222-222222222222',
    chainId: '84532',
    budget: '10',
    maxPerTransfer: '2',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
  it.each([
    [{ chainId: '8453' }, 'limited to Base Sepolia'],
    [{ maxPerTransfer: '11' }, 'cannot exceed the total budget'],
    [
      { expiresAt: new Date(Date.now() + 40 * 86400000).toISOString() },
      'within 30 days',
    ],
    [{ recipients: ['not-an-address'] }, 'Recipients must be'],
    [{ budget: '1.1234567' }, 'at most 6 decimals'],
  ])('rejects %j', async (patch, message) => {
    await expect(
      service.create('agent', 'owner', { ...valid, ...patch }),
    ).rejects.toThrow(message);
  });

  it('parses USDC amounts into 6-decimal units', () => {
    expect(usdcUnits('1')).toBe(1_000_000n);
    expect(usdcUnits('0.25')).toBe(250_000n);
    expect(() => usdcUnits('0')).toThrow(BadRequestException);
    expect(() => usdcUnits('-1')).toThrow(BadRequestException);
  });
});
