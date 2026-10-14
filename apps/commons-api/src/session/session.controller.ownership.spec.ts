import { NotFoundException } from '@nestjs/common';
import { SessionController } from './session.controller';

describe('SessionController ownership', () => {
  const session = {
    sessionId: 'session-1',
    agentId: 'agent-1',
    initiator: 'alice',
    history: [{ role: 'user', content: 'Private note' }],
  };
  const sessions = {
    getSessionWithContent: jest.fn().mockResolvedValue(session),
    getSessionWithGoalsAndTasks: jest.fn().mockResolvedValue(session),
    getSessionsByAgentId: jest.fn().mockResolvedValue([session]),
    getSessionsByInitiator: jest.fn().mockResolvedValue([session]),
    getLatestMessagePerAgent: jest.fn().mockResolvedValue([
      { agentId: 'agent-1', sessionId: 'session-1', role: 'ai', text: 'Done' },
    ]),
  };
  const suggestions = { suggest: jest.fn().mockResolvedValue({ suggestions: [{ text: 'Draft the launch email' }] }) };
  const controller = new SessionController(sessions as any, {} as any, suggestions as any);

  beforeEach(() => jest.clearAllMocks());

  it('hides a transcript and full session from another user', async () => {
    const request = {
      principal: { principalType: 'user', principalId: 'bob' },
      headers: {},
    } as any;
    await expect(
      controller.getSessionWithContent('session-1', request),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.getSessionWithGoalsAndTasks('session-1', request),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessions.getSessionWithGoalsAndTasks).not.toHaveBeenCalled();
  });

  it('applies a delegated user to service calls and agent session lists', async () => {
    const request = {
      principal: { principalType: 'service', principalId: 'web-app' },
      headers: { 'x-owner-id': 'bob' },
    } as any;
    await expect(
      controller.getSessionWithContent('session-1', request),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await controller.getSessionsByAgentId('agent-1', request)).data,
    ).toEqual([]);
    await expect(
      controller.getSessionsByInitiator('alice', request),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows chat previews only to the signed-in person', async () => {
    const other = {
      principal: { principalType: 'service', principalId: 'web-app' },
      headers: { 'x-owner-id': 'bob' },
    } as any;
    await expect(
      controller.getLatestMessagePerAgent('alice', other),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(sessions.getLatestMessagePerAgent).not.toHaveBeenCalled();
    const owner = {
      principal: { principalType: 'service', principalId: 'web-app' },
      headers: { 'x-owner-id': 'alice' },
    } as any;
    const result = await controller.getLatestMessagePerAgent('alice', owner);
    expect(sessions.getLatestMessagePerAgent).toHaveBeenCalledWith({ initiator: 'alice' });
    expect(result.data[0].text).toBe('Done');
  });

  it('writes start suggestions only for the signed-in person', async () => {
    const other = {
      principal: { principalType: 'service', principalId: 'web-app' },
      headers: { 'x-owner-id': 'bob' },
    } as any;
    await expect(
      controller.getStartSuggestions('alice', { connectedApps: ['Gmail'] }, other),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(suggestions.suggest).not.toHaveBeenCalled();

    const owner = {
      principal: { principalType: 'service', principalId: 'web-app' },
      headers: { 'x-owner-id': 'alice' },
    } as any;
    const result = await controller.getStartSuggestions('alice', { connectedApps: ['Gmail', 3] }, owner);
    expect(suggestions.suggest).toHaveBeenCalledWith('alice', ['Gmail']);
    expect(result.data.suggestions[0].text).toBe('Draft the launch email');
  });

  it('allows the owning user to read their session', async () => {
    const request = {
      principal: { principalType: 'user', principalId: 'alice' },
      headers: {},
    } as any;
    expect(
      (await controller.getSessionWithContent('session-1', request)).data,
    ).toEqual(session);
  });
});
