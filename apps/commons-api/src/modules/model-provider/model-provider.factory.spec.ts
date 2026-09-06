import { ModelProviderFactory } from './model-provider.factory';
import { MODEL_REGISTRY } from './model-registry';
describe('per-turn platform model selection', () => {
  const factory = new ModelProviderFactory();
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
});
