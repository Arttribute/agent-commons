export interface NormalizedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  source: string;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function firstNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function fromUsageObject(usage: any, source: string): NormalizedTokenUsage | null {
  if (!usage || typeof usage !== 'object') return null;

  const inputTokenDetails = usage.input_token_details ?? usage.inputTokenDetails ?? {};
  const promptTokenDetails = usage.prompt_tokens_details ?? usage.promptTokenDetails ?? {};
  const outputTokenDetails = usage.output_token_details ?? usage.outputTokenDetails ?? {};

  const inputTokens = firstNumber(
    usage.input_tokens,
    usage.inputTokens,
    usage.prompt_tokens,
    usage.promptTokens,
  );
  const outputTokens = firstNumber(
    usage.output_tokens,
    usage.outputTokens,
    usage.completion_tokens,
    usage.completionTokens,
  );
  const cachedTokens = firstNumber(
    usage.cached_tokens,
    usage.cachedTokens,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    inputTokenDetails.cache_read,
    inputTokenDetails.cacheRead,
    inputTokenDetails.cache_read_input_tokens,
    inputTokenDetails.cacheReadInputTokens,
    promptTokenDetails.cached_tokens,
    promptTokenDetails.cachedTokens,
  );
  const totalTokens = firstNumber(
    usage.total_tokens,
    usage.totalTokens,
    inputTokens + outputTokens,
    outputTokenDetails.total_tokens,
  );

  if (inputTokens + outputTokens + totalTokens === 0) return null;

  return {
    inputTokens,
    outputTokens,
    cachedTokens: Math.min(cachedTokens, inputTokens),
    totalTokens: totalTokens || inputTokens + outputTokens,
    source,
  };
}

export function extractTokenUsageFromLLMResult(result: any): NormalizedTokenUsage | null {
  const candidates: Array<[any, string]> = [
    [result?.llmOutput?.tokenUsage, 'llmOutput.tokenUsage'],
    [result?.llmOutput?.usage, 'llmOutput.usage'],
    [result?.llmOutput?.estimatedTokenUsage, 'llmOutput.estimatedTokenUsage'],
    [result?.generations?.[0]?.[0]?.message?.usage_metadata, 'generations.message.usage_metadata'],
    [result?.generations?.[0]?.[0]?.message?.response_metadata?.usage, 'generations.message.response_metadata.usage'],
    [result?.generations?.[0]?.[0]?.message?.response_metadata?.token_usage, 'generations.message.response_metadata.token_usage'],
    [result?.generations?.[0]?.[0]?.generationInfo?.usage, 'generations.generationInfo.usage'],
    [result?.generations?.[0]?.[0]?.generationInfo?.token_usage, 'generations.generationInfo.token_usage'],
  ];

  for (const [candidate, source] of candidates) {
    const usage = fromUsageObject(candidate, source);
    if (usage) return usage;
  }

  return null;
}
