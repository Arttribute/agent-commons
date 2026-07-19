import { Test, TestingModule } from '@nestjs/testing';
import { CreditService } from './credit.service';
import { DatabaseService } from '~/modules/database/database.service';
import * as schema from '#/models/schema';

function makeDb(existing?: unknown, balance = 0, accountCreated = false) {
  const insertReturning = jest.fn().mockResolvedValue([{ entryId: 'entry-1' }]);
  const findFirst = jest.fn().mockResolvedValue(existing);
  const ledgerValues = jest.fn((values) => ({
    returning: insertReturning,
    // Drizzle insert builders are awaitable; a plain value is sufficient for
    // the onboarding insert, which does not request returned columns.
    values,
  }));
  const accountUpdateSet = jest.fn().mockReturnValue({
    where: jest.fn().mockResolvedValue(undefined),
  });
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
      insert: jest.fn((table) =>
        table === schema.creditAccount
          ? {
              values: jest.fn().mockReturnValue({
                onConflictDoNothing: jest.fn().mockReturnValue({
                  returning: jest
                    .fn()
                    .mockResolvedValue(
                      accountCreated ? [{ principalId: 'usr_new' }] : [],
                    ),
                }),
              }),
            }
          : { values: ledgerValues },
      ),
      update: jest.fn().mockReturnValue({ set: accountUpdateSet }),
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
    _ledgerValues: ledgerValues,
    _accountUpdateSet: accountUpdateSet,
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

  it('atomically grants 500 credits when a canonical user account is created', async () => {
    const db = makeDb(undefined, 500, true);
    const service = await makeService(db);

    const result = await service.getBalance({ principalId: 'usr_new' });

    expect(result.balance).toBe(500);
    expect(db._ledgerValues).toHaveBeenCalledWith(
      expect.objectContaining({
        principalId: 'usr_new',
        amount: 500,
        eventType: 'new_user_welcome',
        idempotencyKey: 'new-user-welcome:usr_new',
      }),
    );
    expect(db._accountUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 500, lifetimeGranted: 500 }),
    );
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
