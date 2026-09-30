import { AgentService } from './agent.service';

describe('AgentService computer-backed runtime plan enforcement', () => {
  function serviceWithPlanGate(error: Error) {
    const service = Object.create(AgentService.prototype) as AgentService;
    const assertComputerPlan = jest.fn().mockRejectedValue(error);
    const insert = jest.fn();

    Object.assign(service as any, {
      computerService: { assertComputerPlan },
      db: { insert },
    });

    return { service, assertComputerPlan, insert };
  }

  it.each(['openclaw', 'hermes', 'custom'] as const)(
    'blocks direct %s creation before writing an agent',
    async (runtimeType) => {
      const paywall = new Error('paid plan required');
      const { service, assertComputerPlan, insert } =
        serviceWithPlanGate(paywall);

      await expect(
        service.createAgent({
          value: {
            name: 'Managed agent',
            owner: 'legacy-owner',
            ownerUserId: 'user-1',
            runtimeType,
          } as any,
        }),
      ).rejects.toBe(paywall);

      expect(assertComputerPlan).toHaveBeenCalledWith(
        'user-1',
        expect.stringContaining('requires a paid plan'),
      );
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it('blocks changing an existing agent to a computer-backed runtime', async () => {
    const paywall = new Error('paid plan required');
    const { service, assertComputerPlan } = serviceWithPlanGate(paywall);
    const update = jest.fn();
    (service as any).getAgent = jest.fn().mockResolvedValue({
      agentId: 'agent-1',
      owner: 'legacy-owner',
      ownerUserId: 'user-1',
      runtimeType: 'native',
      isSystemManaged: false,
    });
    (service as any).db.update = update;

    await expect(
      service.updateAgent('agent-1', { runtimeType: 'hermes' } as any),
    ).rejects.toBe(paywall);

    expect(assertComputerPlan).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('requires a paid plan'),
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AgentService CLI result handoff', () => {
  const requestId = '4b52c1bd-86f0-4684-b637-01db882df5b7';

  function serviceWithResultStore(rows: unknown[]) {
    const service = Object.create(AgentService.prototype) as AgentService;
    const execute = jest.fn().mockResolvedValue(rows);
    const pendingCliToolRequests = new Map<string, (result: string) => void>();
    Object.assign(service as any, { db: { execute }, pendingCliToolRequests });
    return { service, execute, pendingCliToolRequests };
  }

  it('accepts a result on another API replica through the shared database', async () => {
    const { service, execute } = serviceWithResultStore([{ request_id: requestId }]);
    expect(await service.resolveCliToolRequest(requestId, 'command output')).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects an expired or already answered request', async () => {
    const { service } = serviceWithResultStore([]);
    expect(await service.resolveCliToolRequest(requestId, 'duplicate')).toBe(false);
  });

  it('resolves a request on its owning replica without a database round trip', async () => {
    const { service, execute, pendingCliToolRequests } = serviceWithResultStore([]);
    const resolve = jest.fn();
    pendingCliToolRequests.set(requestId, resolve);
    expect(await service.resolveCliToolRequest(requestId, '5')).toBe(true);
    expect(resolve).toHaveBeenCalledWith('5');
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs and oversized tool output before touching the database', async () => {
    const { service, execute } = serviceWithResultStore([]);
    expect(await service.resolveCliToolRequest('invalid', 'text')).toBe(false);
    expect(await service.resolveCliToolRequest(requestId, 'x'.repeat(1_000_001))).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
