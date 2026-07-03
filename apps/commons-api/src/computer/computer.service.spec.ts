import { BadRequestException } from '@nestjs/common';
import { ComputerService } from './computer.service';

function dbMock() {
  return {
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
});
