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
