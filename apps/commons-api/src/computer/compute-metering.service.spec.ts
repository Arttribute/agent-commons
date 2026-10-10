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
    jest.useRealTimers();
    if (previousMaxCatchUp === undefined) {
      delete process.env.COMPUTE_MAX_CATCH_UP_MINUTES;
    } else {
      process.env.COMPUTE_MAX_CATCH_UP_MINUTES = previousMaxCatchUp;
    }
  });

  it('does not queue another tick while a previous scan is still running', async () => {
    const db = (service as any).db;
    let finishScan!: (rows: unknown[]) => void;
    const scan = new Promise<unknown[]>((resolve) => { finishScan = resolve; });
    const selection = {
      from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(), for: jest.fn().mockReturnValue(scan),
    };
    db.transaction = jest.fn().mockImplementation((callback) => callback({ select: () => selection }));
    const first = service.tick();
    await Promise.all([service.tick(), service.tick(), service.tick()]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    finishScan([]);
    await first;
    await service.tick();
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('allows the next scheduled tick after a failed scan', async () => {
    const db = (service as any).db;
    db.transaction = jest.fn().mockRejectedValueOnce(new Error('Scan unavailable'))
      .mockResolvedValueOnce([]);
    await expect(service.tick()).rejects.toThrow('Scan unavailable');
    await service.tick();
    expect(db.transaction).toHaveBeenCalledTimes(2);
  });

  it('defers a computer locked by another worker and meters it on a later tick', async () => {
    const current = { computerId: 'computer', agentId: 'agent', ownerUserId: 'owner', resourceProfile: 'standard', status: 'running', startedAt: new Date(now.getTime() - 90_000), meteredThroughAt: new Date(now.getTime() - 90_000) };
    jest.useFakeTimers({ now });
    const db = (service as any).db;
    const selection = {
      from: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(), for: jest.fn().mockResolvedValue([current]),
    };
    const execute = jest.fn().mockResolvedValueOnce([{ locked: false }])
      .mockResolvedValueOnce([{ locked: true }]);
    db.transaction = jest.fn().mockImplementation((callback) => callback({ select: () => selection, execute }));
    db.query = { agentComputerInstance: { findFirst: jest.fn().mockResolvedValue(current) } };
    await service.tick();
    expect(db.query.agentComputerInstance.findFirst).not.toHaveBeenCalled();
    expect(credits.record).not.toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
    await service.tick();
    expect(credits.record).toHaveBeenCalledTimes(1);
    expect(credits.record).toHaveBeenCalledWith(expect.objectContaining({ amount: 7, idempotencyKey: `compute:computer:${current.meteredThroughAt.toISOString()}` }));
    expect(updateSet).toHaveBeenCalled();
  });

  it('closes unbilled time at the old price before changing resource profiles', async () => {
    jest.useFakeTimers({ now });
    const current = { computerId: 'computer', agentId: 'agent', ownerUserId: 'owner', resourceProfile: 'standard', status: 'running', startedAt: new Date(now.getTime() - 90_000), meteredThroughAt: new Date(now.getTime() - 90_000) };
    const db = (service as any).db;
    const execute = jest.fn().mockResolvedValue([]);
    db.transaction = jest.fn().mockImplementation((callback) => callback({ execute }));
    db.query = { agentComputerInstance: { findFirst: jest.fn().mockResolvedValue(current) } };
    (service as any).computers.getAssignedComputer = jest.fn().mockResolvedValue(current);
    await service.settleForResourceChange('agent');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(credits.record).toHaveBeenCalledWith(expect.objectContaining({ amount: 14, description: 'Computer use (standard) 2m' }));
    expect(updateSet).toHaveBeenLastCalledWith(expect.objectContaining({ meteredThroughAt: now }));
    current.resourceProfile = 'gpu';
    current.meteredThroughAt = now;
    jest.setSystemTime(new Date(now.getTime() + 30_000));
    await service.settleForResourceChange('agent');
    expect(credits.record).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 70, description: 'Computer use (gpu) 1m' }));
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
