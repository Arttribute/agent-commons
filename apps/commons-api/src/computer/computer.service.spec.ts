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
});
