import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

describe('agent chat transcript access', () => {
  const chat = { sessionId: 'session-1', initiator: 'user-1', history: [{ role: 'user', content: 'private' }] };

  it('returns a transcript only to its authenticated owner', async () => {
    const service = Object.create(AgentService.prototype) as any;
    service.session = { getSession: jest.fn().mockResolvedValue(chat) };

    await expect(service.getAgentChatSession('session-1', 'user-1')).resolves.toBe(chat);
    await expect(service.getAgentChatSession('session-1', 'user-2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not read a transcript without a caller identity', async () => {
    const controller = Object.create(AgentController.prototype) as any;
    controller.agent = { getAgentChatSession: jest.fn() };

    await expect(controller.getAgentSessionFullChat('session-1', { headers: {} })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(controller.agent.getAgentChatSession).not.toHaveBeenCalled();
  });
});
