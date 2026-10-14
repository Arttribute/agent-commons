import { SessionService } from './session.service';
import { ModelProviderFactory } from '../modules/model-provider/model-provider.factory';

describe('space session model selection', () => {
  const factory = new ModelProviderFactory();
  const agent = { provider: 'anthropic' as const, modelId: 'claude-sonnet-4-6' };
  let values: jest.Mock;
  let findFirst: jest.Mock;
  let service: SessionService;

  beforeEach(() => {
    findFirst = jest.fn().mockResolvedValue(undefined);
    values = jest.fn().mockImplementation((value) => ({
      returning: jest.fn().mockResolvedValue([value]),
    }));
    service = new SessionService({
      query: { session: { findFirst } },
      insert: jest.fn().mockReturnValue({ values }),
    } as any, {} as any);
  });

  it('uses the saved agent provider for a new space conversation and follows later changes', async () => {
    const { session, created } = await service.getOrCreateAgentSpaceSession({ agentId: 'agent-1', spaceId: 'space-1' });
    expect(created).toBe(true);
    expect(session.model).toEqual({ source: 'agent' });
    expect(factory.resolveSessionModel(session.model, agent)).toMatchObject(agent);
    const updatedAgent = { provider: 'ollama' as const, modelId: 'qwen3.5:2b-q4_K_M' };
    expect(factory.resolveSessionModel(session.model, updatedAgent)).toMatchObject(updatedAgent);
  });

  it('preserves an explicit initial model selection', async () => {
    const model = { source: 'session', provider: 'openai', modelId: 'gpt-5.4-mini' };
    const { session } = await service.getOrCreateAgentSpaceSession({ agentId: 'agent-1', spaceId: 'space-1', model: model as any });
    expect(session.model).toEqual(model);
    expect(factory.resolveSessionModel(session.model, agent)).toMatchObject({ provider: 'openai', modelId: 'gpt-5.4-mini' });
  });

  it('leaves an existing space conversation and its explicit legacy selection intact', async () => {
    const existing = { sessionId: 'existing', model: { name: 'gpt-4o' } };
    findFirst.mockResolvedValue(existing);
    const result = await service.getOrCreateAgentSpaceSession({ agentId: 'agent-1', spaceId: 'space-1' });
    expect(result).toEqual({ session: existing, created: false });
    expect(values).not.toHaveBeenCalled();
  });
});
