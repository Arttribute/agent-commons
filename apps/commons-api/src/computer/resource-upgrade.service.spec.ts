import { ResourceUpgradeService } from './resource-upgrade.service';

describe('temporary computer resource approval and cleanup', () => {
  function setup(policy = {}) {
    const service = Object.create(ResourceUpgradeService.prototype) as any;
    const proposal = {
      changeId: 'proposal',
      agentId: 'agent',
      resourceType: 'computer',
      status: 'pending',
    };
    const values = jest
      .fn()
      .mockReturnValue({ returning: jest.fn().mockResolvedValue([proposal]) });
    service.db = {
      query: {
        agent: {
          findFirst: jest.fn().mockResolvedValue({ ownerUserId: 'owner' }),
        },
      },
      insert: jest.fn().mockReturnValue({ values }),
      execute: jest.fn().mockResolvedValue([{ config_id: 'config' }]),
    };
    service.computers = {
      getConfig: jest
        .fn()
        .mockResolvedValue({
          enabled: true,
          allowAgentStart: true,
          resourceProfile: 'standard',
          metadata: { resourceUpgradePolicy: policy },
        }),
      getAssignedComputer: jest
        .fn()
        .mockResolvedValue({ resourceProfile: 'gpu' }),
      updateConfig: jest.fn(),
      stopAssignedComputer: jest.fn().mockResolvedValue({ status: 'stopped' }),
    };
    service.metering = { settleForResourceChange: jest.fn() };
    service.credits = {
      getBalance: jest.fn().mockResolvedValue({ available: 10000 }),
    };
    service.logger = { error: jest.fn() };
    return { service, values, proposal };
  }
  const gpuRequest = {
    agentId: 'agent',
    ownerId: 'owner',
    sessionId: 'chat',
    profile: 'gpu',
    minutes: 5,
    reason: 'Training a neural network on the approved data',
  };

  it('persists a reviewable GPU request without activating resources under the default policy', async () => {
    const { service, values, proposal } = setup();
    const result = await service.request(gpuRequest);
    expect(result).toEqual(
      expect.objectContaining({
        requiresConfirmation: true,
        changes: [proposal],
      }),
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: 'owner',
        sessionId: 'chat',
        after: expect.objectContaining({ profile: 'gpu', minutes: 5 }),
      }),
    );
    expect(service.computers.updateConfig).not.toHaveBeenCalled();
  });
  it('prevents shared viewers from spending the computer owner’s resources', async () => {
    const { service, values } = setup({ gpuAccess: 'auto' });
    await expect(
      service.request({ ...gpuRequest, ownerId: 'viewer' }),
    ).rejects.toThrow(/Only the computer owner/);
    expect(values).not.toHaveBeenCalled();
  });
  it('does not interpret automatic CPU access as permission to activate GPU', async () => {
    const { service } = setup({ cpuAccess: 'auto' });
    const accept = jest.spyOn(service, 'accept');
    expect((await service.request(gpuRequest)).requiresConfirmation).toBe(true);
    expect(accept).not.toHaveBeenCalled();
  });
  it('refuses compute use from another chat, owner, or an expired lease', async () => {
    const { service } = setup();
    service.computers.getConfig.mockResolvedValue({
      metadata: {
        resourceUpgradeLease: {
          leaseId: 'lease',
          ownerId: 'owner',
          sessionId: 'chat',
          state: 'active',
          endsAt: new Date(Date.now() + 60000).toISOString(),
        },
      },
    });
    await expect(
      service.bindRun('agent', 'owner', 'other-chat', 'run'),
    ).rejects.toThrow(/another owner or chat/);
    await expect(
      service.bindRun('agent', 'other-owner', 'chat', 'run'),
    ).rejects.toThrow(/another owner or chat/);
    await service.bindRun('agent', 'owner', 'chat', 'run');
    expect(service.db.execute).toHaveBeenCalledTimes(1);
    service.computers.getConfig.mockResolvedValue({
      metadata: {
        resourceUpgradeLease: {
          ownerId: 'owner',
          sessionId: 'chat',
          state: 'active',
          endsAt: new Date(0).toISOString(),
        },
      },
    });
    await expect(
      service.bindRun('agent', 'owner', 'chat', 'run'),
    ).rejects.toThrow(/expired/);
  });
  it('stops the computer when restoring its original profile fails', async () => {
    const { service } = setup();
    service.computers.getConfig.mockResolvedValue({
      storageLimit: '20Gi',
      metadata: {
        resourceUpgradeLease: {
          leaseId: 'lease',
          ownerId: 'owner',
          sessionId: 'chat',
          baseline: { resourceProfile: 'standard' },
        },
      },
    });
    service.computers.updateConfig.mockRejectedValue(
      new Error('Resize unavailable'),
    );
    await expect(service.release('agent', 'owner', 'chat')).rejects.toThrow(
      /Resize unavailable/,
    );
    expect(service.computers.stopAssignedComputer).toHaveBeenCalledWith({
      agentId: 'agent',
      actorType: 'service',
    });
  });
  it('releases only the lease used by the completed run', async () => {
    const { service } = setup();
    service.computers.getConfig.mockResolvedValue({
      metadata: {
        resourceUpgradeLease: {
          leaseId: 'lease',
          ownerId: 'owner',
          sessionId: 'chat',
          runId: 'our-run',
        },
      },
    });
    const release = jest
      .spyOn(service, 'release')
      .mockResolvedValue({ released: true });
    await service.finishRun('agent', 'other-run');
    expect(release).not.toHaveBeenCalled();
    await service.finishRun('agent', 'our-run');
    expect(release).toHaveBeenCalledWith('agent', 'owner', 'chat', 'lease');
  });
});
