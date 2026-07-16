import { Test, TestingModule } from '@nestjs/testing';
import { CreditService } from './credit.service';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';

function makeDb(existing?: unknown, balance = 0) {
  const insertReturning = jest.fn().mockResolvedValue([{ entryId: 'entry-1' }]);
  const findFirst = jest.fn().mockResolvedValue(existing);
  const transaction = jest.fn((callback) =>
    callback({
      execute: jest.fn().mockResolvedValue([]),
      query: { creditLedgerEntry: { findFirst } },
      select: jest.fn().mockReturnValue({
        from: jest.fn((table) => ({
          where: jest.fn(() => ({
            for: jest
              .fn()
              .mockResolvedValue(
                table === schema.creditAccount
                  ? [{ principalId: 'user-1', balance, reserved: 0 }]
                  : [],
              ),
          })),
        })),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
          returning: insertReturning,
        }),
      }),
      update: jest.fn(),
    }),
  );
  return {
    transaction,
    query: {
      creditLedgerEntry: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([{ balance }]),
      }),
    }),
    _insertReturning: insertReturning,
    _findFirst: findFirst,
  };
}

describe('CreditService', () => {
  async function makeService(db: ReturnType<typeof makeDb>) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreditService, { provide: DatabaseService, useValue: db }],
    }).compile();
    return module.get(CreditService);
  }

  it('returns an existing ledger entry for the same idempotency key', async () => {
    const db = makeDb({ entryId: 'existing-entry' }, 100);
    const service = await makeService(db);

    const result = await service.grant({
      principalId: 'user-1',
      amount: 100,
      eventType: 'admin_grant',
      sourcePlatform: 'system',
      idempotencyKey: 'idem-1',
    });

    expect(result).toHaveProperty('entryId', 'existing-entry');
    expect(db._insertReturning).not.toHaveBeenCalled();
  });

  it('rejects debits that would overdraw the balance', async () => {
    const db = makeDb(undefined, 10);
    const service = await makeService(db);

    await expect(
      service.debit({
        principalId: 'user-1',
        amount: 25,
        eventType: 'agent_run_usage',
        sourcePlatform: 'agent_commons',
        idempotencyKey: 'usage-1',
      }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('fails closed when the credit conversion configuration is invalid', async () => {
    const previous = process.env.CREDIT_UNITS_PER_USD;
    process.env.CREDIT_UNITS_PER_USD = 'not-a-number';
    const service = await makeService(makeDb());
    try {
      expect(() => service.creditsForUsd(0.01)).toThrow(
        'Usage pricing is temporarily unavailable.',
      );
    } finally {
      if (previous === undefined) delete process.env.CREDIT_UNITS_PER_USD;
      else process.env.CREDIT_UNITS_PER_USD = previous;
    }
  });
});
