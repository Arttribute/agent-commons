import { ModelProviderFactory } from './model-provider.factory';
import { MODEL_REGISTRY } from './model-registry';
describe('per-turn platform model selection', () => {
  const factory = new ModelProviderFactory();
  it('agent-inherited sessions follow the current agent model while explicit overrides stay fixed', () => {
    const agent = { provider: 'anthropic' as const, modelId: 'claude-sonnet-4-6', apiKey: 'agent-key' };
    expect(factory.resolveSessionModel({ source: 'agent', provider: 'openai', modelId: 'old-default' }, agent)).toMatchObject(agent);
    expect(factory.resolveSessionModel({ source: 'session', provider: 'openai', modelId: 'gpt-5.4-mini' }, agent)).toMatchObject({ provider: 'openai', modelId: 'gpt-5.4-mini', apiKey: undefined, baseUrl: undefined });
  });
  it('resolves a catalog model without copying supplied credentials or an arbitrary endpoint', () => {
    const model = MODEL_REGISTRY.find((m) => m.tier !== 'local')!;
    const selected = factory.resolveRunModel({
      provider: model.provider,
      modelId: model.modelId,
      apiKey: 'must-not-cross-provider',
      baseUrl: 'https://untrusted.invalid',
    });
    expect(selected).toEqual({
      provider: model.provider,
      modelId: model.modelId,
    });
  });
  it('rejects malformed or unavailable selections', () => {
    expect(() =>
      factory.resolveRunModel({ provider: 'custom', modelId: 'unknown' }),
    ).toThrow();
    expect(() => factory.resolveRunModel(null)).toThrow();
  });
  it('keeps the hosted free endpoint private and caps its output', () => {
    const previousUrl = process.env.HOSTED_FREE_MODEL_BASE_URL;
    const previousKey = process.env.HOSTED_FREE_MODEL_API_KEY;
    try {
      delete process.env.HOSTED_FREE_MODEL_BASE_URL;
      delete process.env.HOSTED_FREE_MODEL_API_KEY;
      expect(() => factory.resolveRunModel({ provider: 'hosted-free', modelId: 'Qwen/Qwen3-1.7B-FP8' })).toThrow();
      process.env.HOSTED_FREE_MODEL_BASE_URL = 'http://free-model.internal/v1';
      process.env.HOSTED_FREE_MODEL_API_KEY = 'private-test-key';
      expect(factory.resolveRunModel({
        provider: 'hosted-free', modelId: 'Qwen/Qwen3-1.7B-FP8',
        apiKey: 'attacker-key', baseUrl: 'https://attacker.invalid', maxTokens: 99999,
      })).toEqual({ provider: 'hosted-free', modelId: 'Qwen/Qwen3-1.7B-FP8', maxTokens: 2048 });
    } finally {
      if (previousUrl === undefined) delete process.env.HOSTED_FREE_MODEL_BASE_URL;
      else process.env.HOSTED_FREE_MODEL_BASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.HOSTED_FREE_MODEL_API_KEY;
      else process.env.HOSTED_FREE_MODEL_API_KEY = previousKey;
    }
  });
});
