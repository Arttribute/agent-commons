import { extractTokenUsageFromLLMResult } from './token-usage.util';

describe('extractTokenUsageFromLLMResult', () => {
  it('normalizes OpenAI llmOutput tokenUsage', () => {
    const usage = extractTokenUsageFromLLMResult({
      llmOutput: {
        tokenUsage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125,
          prompt_tokens_details: { cached_tokens: 40 },
        },
      },
    });

    expect(usage).toEqual({
      inputTokens: 100,
      outputTokens: 25,
      cachedTokens: 40,
      totalTokens: 125,
      source: 'llmOutput.tokenUsage',
    });
  });

  it('normalizes LangChain usage_metadata', () => {
    const usage = extractTokenUsageFromLLMResult({
      generations: [[{
        message: {
          usage_metadata: {
            input_tokens: 200,
            output_tokens: 50,
            input_token_details: { cache_read: 80 },
          },
        },
      }]],
    });

    expect(usage).toEqual({
      inputTokens: 200,
      outputTokens: 50,
      cachedTokens: 80,
      totalTokens: 250,
      source: 'generations.message.usage_metadata',
    });
  });

  it('normalizes Anthropic-style response metadata', () => {
    const usage = extractTokenUsageFromLLMResult({
      generations: [[{
        message: {
          response_metadata: {
            usage: {
              input_tokens: 300,
              output_tokens: 75,
              cache_read_input_tokens: 120,
            },
          },
        },
      }]],
    });

    expect(usage).toMatchObject({
      inputTokens: 300,
      outputTokens: 75,
      cachedTokens: 120,
      totalTokens: 375,
    });
  });

  it('returns null instead of estimating when provider usage is absent', () => {
    expect(extractTokenUsageFromLLMResult({ generations: [[{ text: 'hello' }]] })).toBeNull();
  });
});
