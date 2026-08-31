import { ComputeMeteringService } from './compute-metering.service';

describe('ComputeMeteringService', () => {
  const now = new Date('2026-08-16T20:13:29.000Z');
  const previousMaxCatchUp = process.env.COMPUTE_MAX_CATCH_UP_MINUTES;
  let service: ComputeMeteringService;
  let credits: {
    getBalance: jest.Mock;
    record: jest.Mock;
  };
  let insertValues: jest.Mock;
  let updateSet: jest.Mock;

  beforeEach(() => {
    insertValues = jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
    });
    updateSet = jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });
    const db = {
      insert: jest.fn().mockReturnValue({ values: insertValues }),
      update: jest.fn().mockReturnValue({ set: updateSet }),
    };
    credits = {
      getBalance: jest
        .fn()
        .mockResolvedValue({ balance: 10_000, reserved: 0, available: 10_000 }),
      record: jest.fn().mockResolvedValue({ entryId: 'entry_1' }),
    };
    service = new ComputeMeteringService(
      db as any,
      credits as any,
      { stopComputer: jest.fn() } as any,
    );
    delete process.env.COMPUTE_MAX_CATCH_UP_MINUTES;
  });

  afterEach(() => {
    if (previousMaxCatchUp === undefined) {
      delete process.env.COMPUTE_MAX_CATCH_UP_MINUTES;
    } else {
      process.env.COMPUTE_MAX_CATCH_UP_MINUTES = previousMaxCatchUp;
    }
  });

  it('caps a stale cursor instead of charging the entire inactive gap', async () => {
    const staleCursor = new Date(now.getTime() - 642 * 60_000);

    await (service as any).meterInstance(
      {
        computerId: '11111111-1111-4111-8111-111111111111',
        agentId: 'agent_1',
        ownerUserId: 'user_1',
        workspaceId: null,
        resourceProfile: 'standard',
        startedAt: staleCursor,
        meteredThroughAt: staleCursor,
        status: 'running',
      },
      now,
    );

    expect(credits.record).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 70,
        description: 'Computer use (standard) 10m',
        idempotencyKey: `compute:11111111-1111-4111-8111-111111111111:${staleCursor.toISOString()}`,
        metadata: expect.objectContaining({
          minutes: 10,
          perMin: 7,
          catchUpCappedFromMinutes: 642,
        }),
      }),
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        intervalStart: new Date(now.getTime() - 10 * 60_000),
        intervalEnd: now,
        minutes: 10,
        creditsCharged: 70,
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ meteredThroughAt: now }),
    );
  });

  it('charges ordinary minute intervals without rebasing them', async () => {
    const cursor = new Date(now.getTime() - 3 * 60_000);

    await (service as any).meterInstance(
      {
        computerId: '22222222-2222-4222-8222-222222222222',
        agentId: 'agent_1',
        ownerUserId: 'user_1',
        workspaceId: null,
        resourceProfile: 'standard',
        startedAt: cursor,
        meteredThroughAt: cursor,
        status: 'running',
      },
      now,
    );

    expect(credits.record).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 21,
        description: 'Computer use (standard) 3m',
        metadata: {
          computerId: '22222222-2222-4222-8222-222222222222',
          minutes: 3,
          perMin: 7,
        },
      }),
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ meteredThroughAt: now }),
    );
  });
});
