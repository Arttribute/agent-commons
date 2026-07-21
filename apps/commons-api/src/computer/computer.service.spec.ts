import { BadRequestException } from '@nestjs/common';
import { ComputerService } from './computer.service';

function dbMock() {
  const insertValues = jest.fn().mockResolvedValue(undefined);
  return {
    insertValues,
    insert: jest.fn().mockReturnValue({
      values: insertValues,
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

describe('ComputerService', () => {
  let service: ComputerService;
  let db: ReturnType<typeof dbMock>;

  beforeEach(() => {
    db = dbMock();
    service = new ComputerService(
      db as any,
      { decrypt: jest.fn() } as any,
      { getEntitlements: jest.fn() } as any,
      { getBalance: jest.fn() } as any,
    );
    jest.spyOn(service as any, 'assertCapability').mockResolvedValue({
      enabled: true,
      allowTerminal: true,
      allowFilesystem: true,
      allowBrowser: true,
      networkAccess: 'standard',
    });
  });

  it('runs a command against the agent persistent computer when computerId is omitted', async () => {
    const computer = {
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      sessionId: null,
      lifecycle: 'persistent',
      status: 'running',
      commonOsAgentId: 'commonos_agent_1',
    };
    jest.spyOn(service, 'listInstances').mockResolvedValue([computer] as any);
    const sendInstruction = jest
      .spyOn(service, 'sendInstruction')
      .mockResolvedValue({ status: 'completed', response: 'ok' } as any);

    await service.runCommand({
      agentId: 'agent_1',
      sessionId: '22222222-2222-4222-8222-222222222222',
      command: 'pwd',
    });

    expect(sendInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent_1',
        computerId: '11111111-1111-4111-8111-111111111111',
        sessionId: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('returns a clear error when no active computer can be resolved', async () => {
    jest.spyOn(service, 'listInstances').mockResolvedValue([] as any);

    await expect(
      service.runCommand({
        agentId: 'agent_1',
        sessionId: '22222222-2222-4222-8222-222222222222',
        command: 'pwd',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows the same persistent computer to continue across chat sessions', async () => {
    jest.spyOn(service, 'getInstance').mockResolvedValue({
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      sessionId: null,
      lifecycle: 'persistent',
      status: 'running',
      commonOsAgentId: 'commonos_agent_1',
    } as any);
    const sendInstruction = jest
      .spyOn(service, 'sendInstruction')
      .mockResolvedValue({ status: 'completed', response: 'ok' } as any);

    await service.runCommand({
      agentId: 'agent_1',
      computerId: '11111111-1111-4111-8111-111111111111',
      sessionId: '33333333-3333-4333-8333-333333333333',
      command: 'pwd',
    });

    expect(sendInstruction).toHaveBeenCalledWith(
      expect.objectContaining({
        computerId: '11111111-1111-4111-8111-111111111111',
        sessionId: '33333333-3333-4333-8333-333333333333',
      }),
    );
  });

  it('does not use the computer id as an Agent Commons session id for unscoped commands', async () => {
    const computer = {
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      sessionId: null,
      status: 'running',
      commonOsAgentId: 'commonos_agent_1',
      metadata: {},
    };
    jest.spyOn(service, 'getInstance').mockResolvedValue(computer as any);
    jest.spyOn(service, 'refreshInstance').mockResolvedValue(computer as any);
    const commonOsRequest = jest
      .spyOn(service as any, 'commonOsComputerRequest')
      .mockResolvedValueOnce({ _id: 'msg_1', sessionId: 'runtime_session_1' })
      .mockResolvedValueOnce({
        message: {
          _id: 'msg_1',
          status: 'responded',
          response: 'ok',
          respondedAt: '2026-07-03T20:00:00.000Z',
        },
        events: [],
      });

    await service.sendInstruction({
      agentId: 'agent_1',
      computerId: computer.computerId,
      instruction: 'run pwd',
      eventType: 'terminal.command',
      summary: 'pwd',
    });

    expect(commonOsRequest).toHaveBeenNthCalledWith(
      1,
      'POST',
      '/computers/commonos_agent_1/instructions',
      undefined,
      { content: 'run pwd' },
      'agent_1',
    );
    expect(commonOsRequest).toHaveBeenNthCalledWith(
      2,
      'GET',
      '/computers/commonos_agent_1/instructions/msg_1/snapshot',
      undefined,
      undefined,
      'agent_1',
    );
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: undefined }),
    );
  });

  it('proxies channel setup while the model runtime is still prewarming', async () => {
    const computer = {
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      status: 'starting',
      commonOsAgentId: 'commonos_agent_1',
    };
    jest
      .spyOn(service, 'getAssignedComputer')
      .mockResolvedValue(computer as any);
    jest.spyOn(service, 'refreshInstance').mockResolvedValue(computer as any);
    const commonOsRequest = jest
      .spyOn(service as any, 'commonOsComputerRequest')
      .mockResolvedValue({ status: 'starting', runtimeStatus: 'Pending' });

    await expect(
      service.runtimeChannelAction({
        agentId: 'agent_1',
        channel: 'whatsapp',
        action: 'connect',
      }),
    ).resolves.toEqual({ status: 'starting', runtimeStatus: 'Pending' });
    expect(commonOsRequest).toHaveBeenCalledWith(
      'POST',
      '/computers/commonos_agent_1/runtime-channels/whatsapp/connect',
      undefined,
      {},
      'agent_1',
    );
  });

  it('maps friendly profiles to bounded elastic resource ceilings', () => {
    const normalized = (service as any).normalizeConfigPatch(
      { resourceProfile: 'performance', resourceMode: 'elastic' },
      { storageLimit: '20Gi' },
    );

    expect(normalized).toEqual(
      expect.objectContaining({
        resourceProfile: 'performance',
        resourceMode: 'elastic',
        cpuRequest: '1',
        cpuLimit: '4',
        memoryRequest: '2Gi',
        memoryLimit: '8Gi',
        storageLimit: '50Gi',
        gpuCount: 0,
        defaultMode: 'persistent',
        maxConcurrentComputers: 1,
      }),
    );
  });

  it('keeps persistent storage when moving to a smaller compute profile', () => {
    expect(
      (service as any).normalizeConfigPatch(
        { resourceProfile: 'starter' },
        { storageLimit: '20Gi' },
      ).storageLimit,
    ).toBe('20Gi');

    expect(() =>
      (service as any).normalizeConfigPatch(
        { storageLimit: '10Gi' },
        { storageLimit: '20Gi' },
      ),
    ).toThrow(BadRequestException);
  });

  it('enables a computer against the effective profile when the patch omits one', async () => {
    // Reproduces the "undefined computer profile" upgrade error: the UI enable
    // toggle sends only `{ enabled: true }`, so the normalized patch carries no
    // resourceProfile. The entitlement check must fall back to the persisted
    // profile ('standard') instead of validating `undefined`.
    const getEntitlements = jest.fn().mockResolvedValue({
      computerUse: true,
      allowedProfiles: ['starter', 'standard'],
      maxComputerAgents: 1,
      maxConcurrentComputers: 1,
      modelTiers: ['standard'],
      maxConcurrentRuns: 4,
    });
    (service as any).entitlements = { getEntitlements };

    jest
      .spyOn(service as any, 'assertAgent')
      .mockResolvedValue({ agentId: 'agent_1', ownerUserId: 'user_1' });
    jest.spyOn(service, 'getConfig').mockResolvedValue({
      configId: 'cfg_1',
      agentId: 'agent_1',
      enabled: false,
      resourceProfile: 'standard',
      resourceMode: 'elastic',
      storageLimit: '20Gi',
    } as any);
    jest.spyOn(service as any, 'assertComputerSlot').mockResolvedValue(undefined);
    jest.spyOn(service, 'getAssignedComputer').mockResolvedValue(null as any);

    const returning = jest
      .fn()
      .mockResolvedValue([
        { configId: 'cfg_1', enabled: true, resourceProfile: 'standard' },
      ]);
    db.update.mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({ returning }),
      }),
    });

    await expect(
      service.updateConfig('agent_1', { enabled: true }),
    ).resolves.toEqual(
      expect.objectContaining({ enabled: true, resourceProfile: 'standard' }),
    );
    // Enforcement still ran — the paid plan was actually consulted.
    expect(getEntitlements).toHaveBeenCalledWith('user_1');
  });

  it('persists stop intent and supplies the legacy fleet fallback', async () => {
    const previousFleetId = process.env.COMMON_OS_FLEET_ID;
    process.env.COMMON_OS_FLEET_ID = 'fleet_1';
    const returning = jest.fn().mockResolvedValue([
      {
        computerId: '11111111-1111-4111-8111-111111111111',
        agentId: 'agent_1',
        status: 'stopped',
        desiredState: 'stopped',
      },
    ]);
    const set = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({ returning }),
    });
    db.update.mockReturnValue({ set });
    jest.spyOn(service, 'getInstance').mockResolvedValue({
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      sessionId: null,
      status: 'running',
      desiredState: 'running',
      commonOsAgentId: 'commonos_agent_1',
    } as any);
    const commonOsRequest = jest
      .spyOn(service as any, 'commonOsComputerRequest')
      .mockResolvedValue({ desiredState: 'stopped' });

    try {
      await service.stopComputer({
        agentId: 'agent_1',
        computerId: '11111111-1111-4111-8111-111111111111',
        actorType: 'service',
      });
    } finally {
      if (previousFleetId === undefined) delete process.env.COMMON_OS_FLEET_ID;
      else process.env.COMMON_OS_FLEET_ID = previousFleetId;
    }

    expect(set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'stopping', desiredState: 'stopped' }),
    );
    expect(commonOsRequest).toHaveBeenCalledWith(
      'PATCH',
      '/computers/commonos_agent_1',
      '/fleets/fleet_1/agents/commonos_agent_1',
      { desiredState: 'stopped' },
      'agent_1',
    );
  });
});
