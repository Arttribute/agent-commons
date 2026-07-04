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
    service = new ComputerService(db as any);
  });

  it('runs a command against the active session computer when computerId is omitted', async () => {
    const computer = {
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      sessionId: '22222222-2222-4222-8222-222222222222',
      lifecycle: 'ephemeral',
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

  it('rejects a selected computer that belongs to another session', async () => {
    jest.spyOn(service, 'getInstance').mockResolvedValue({
      computerId: '11111111-1111-4111-8111-111111111111',
      agentId: 'agent_1',
      sessionId: '22222222-2222-4222-8222-222222222222',
      lifecycle: 'ephemeral',
      status: 'running',
      commonOsAgentId: 'commonos_agent_1',
    } as any);

    await expect(
      service.runCommand({
        agentId: 'agent_1',
        computerId: '11111111-1111-4111-8111-111111111111',
        sessionId: '33333333-3333-4333-8333-333333333333',
        command: 'pwd',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
      .mockResolvedValueOnce([
        {
          _id: 'msg_1',
          status: 'responded',
          response: 'ok',
          respondedAt: '2026-07-03T20:00:00.000Z',
        },
      ]);

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
    );
    expect(db.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: undefined }),
    );
  });
});
