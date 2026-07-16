import { calculateCost, getModelInfo } from './model-registry';

describe('model registry billing', () => {
  it('uses the current GPT-5.4 mini token prices', () => {
    expect(calculateCost('openai', 'gpt-5.4-mini', 1_000_000, 1_000_000)).toBe(
      5.25,
    );
  });

  it('applies GPT-5.4 long-context multipliers to the full request', () => {
    expect(calculateCost('openai', 'gpt-5.4', 300_000, 10_000)).toBeCloseTo(
      1.725,
      10,
    );
  });

  it('charges cached input at the provider cache-read rate', () => {
    expect(
      calculateCost('openai', 'gpt-5.4', 100_000, 1_000, 80_000),
    ).toBeCloseTo(0.085, 10);
    expect(
      calculateCost('anthropic', 'claude-sonnet-4-6', 100_000, 1_000, 80_000),
    ).toBeCloseTo(0.099, 10);
  });

  it('uses current Claude Opus 4.6 and Haiku 4.5 prices', () => {
    expect(
      calculateCost('anthropic', 'claude-opus-4-6', 1000, 1000),
    ).toBeCloseTo(0.03, 10);
    expect(
      calculateCost('anthropic', 'claude-haiku-4-5-20251001', 1000, 1000),
    ).toBeCloseTo(0.006, 10);
  });

  it('never invents a zero price for an unknown managed model', () => {
    expect(getModelInfo('openai', 'not-configured')).toBeUndefined();
  });
});
