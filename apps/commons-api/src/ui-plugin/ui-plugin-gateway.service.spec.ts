jest.mock('~/agent/runtime/runtime-dispatcher.service', () => ({
  RuntimeDispatcherService: class {},
}));
jest.mock('~/memory/memory.service', () => ({ MemoryService: class {} }));
jest.mock('~/credit/credit.service', () => ({ CreditService: class {} }));
jest.mock('./app-data/app-data.service', () => ({ AppDataService: class {} }));
jest.mock('./app-network/app-network.service', () => ({
  AppNetworkService: class {},
}));
jest.mock('./ui-plugin.service', () => ({ UiPluginService: class {} }));

import {
  requiresApproval,
  UiPluginGatewayService,
} from './ui-plugin-gateway.service';

describe('requiresApproval', () => {
  it('never asks for reads and follows the owner choice for writes', () => {
    expect(
      requiresApproval(
        { name: 'tasks.read', approval: 'ask' },
        'tasks.list',
        {},
      ),
    ).toBe(false);
    expect(
      requiresApproval(
        { name: 'agents.run', approval: 'ask' },
        'agents.run',
        {},
      ),
    ).toBe(true);
    expect(
      requiresApproval(
        { name: 'agents.run', approval: 'auto' },
        'agents.run',
        {},
      ),
    ).toBe(false);
    expect(requiresApproval({ name: 'agents.run' }, 'agents.run', {})).toBe(
      true,
    );
  });

  it('asks only for external requests that can change data', () => {
    const grant = {
      name: 'network.request' as const,
      approval: 'ask' as const,
    };
    expect(requiresApproval(grant, 'http.request', { method: 'GET' })).toBe(
      false,
    );
    expect(requiresApproval(grant, 'http.request', { method: 'POST' })).toBe(
      true,
    );
  });
});

describe('UiPluginGatewayService.dispatch', () => {
  function gateway(effectiveCapabilities: any[]) {
    const plugins = {
      getActiveForOwner: jest.fn().mockResolvedValue({
        pluginId: 'plugin-1',
        effectiveCapabilities,
      }),
    };
    const credits = {
      getBalance: jest.fn().mockResolvedValue({
        available: 5,
        balance: 6,
        reserved: 1,
        currency: 'credits',
      }),
    };
    const service = new UiPluginGatewayService(
      {} as any,
      plugins as any,
      {} as any,
      {} as any,
      credits as any,
      {} as any,
      {} as any,
    );
    return { service, credits };
  }

  it('rejects methods the owner did not grant', async () => {
    const { service } = gateway([]);
    await expect(
      service.dispatch('user-1', 'plugin-1', { method: 'credits.get' }),
    ).rejects.toMatchObject({ code: -32001 });
  });

  it('rejects methods outside the gateway', async () => {
    const { service } = gateway([{ name: 'tasks.read' }]);
    await expect(
      service.dispatch('user-1', 'plugin-1', { method: 'tasks.list' }),
    ).rejects.toMatchObject({ code: -32601 });
  });

  it('requires approval before an agent run', async () => {
    const { service } = gateway([{ name: 'agents.run', approval: 'ask' }]);
    await expect(
      service.dispatch('user-1', 'plugin-1', {
        method: 'agents.run',
        params: { agentId: 'a', prompt: 'hi' },
      }),
    ).rejects.toMatchObject({ code: -32004 });
  });

  it('serves granted reads for the calling owner', async () => {
    const { service, credits } = gateway([{ name: 'credits.read' }]);
    await expect(
      service.dispatch('user-1', 'plugin-1', { method: 'credits.get' }),
    ).resolves.toEqual({
      available: 5,
      balance: 6,
      reserved: 1,
      currency: 'credits',
    });
    expect(credits.getBalance).toHaveBeenCalledWith({ principalId: 'user-1' });
  });
});
