import { Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ModelConfig } from '../model-provider.interface';

/**
 * Builds a LangChain ChatOpenAI instance from a ModelConfig.
 * Supports BYOK (bring your own key) via config.apiKey.
 */
export function buildOpenAIModel(config: ModelConfig): ChatOpenAI {
  const logger = new Logger('OpenAIProvider');

  const providerDefaults: Record<string, { apiKey?: string; baseURL?: string }> = {
    openai: { apiKey: process.env.OPENAI_API_KEY },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    },
    xai: {
      apiKey: process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1',
    },
    custom: {},
  };
  const defaults = providerDefaults[config.provider] ?? providerDefaults.openai;
  const apiKey = config.apiKey ?? defaults.apiKey;
  const baseURL = config.baseUrl ?? defaults.baseURL;
  if (!apiKey) {
    logger.warn(`No API key found for ${config.provider} — requests may fail`);
  }
  if (config.provider === 'custom' && !baseURL) {
    throw new Error('Custom model providers require modelBaseUrl');
  }
  const isGpt5 = config.provider === 'openai' && config.modelId.startsWith('gpt-5');

  return new ChatOpenAI({
    model: config.modelId,
    apiKey,
    // GPT-5 reasoning models choose their own sampling parameters. Sending
    // legacy temperature/top-p/penalty defaults can make otherwise valid
    // requests fail on newer model snapshots.
    temperature: isGpt5 ? undefined : config.temperature ?? 0,
    maxTokens: config.maxTokens,
    topP: isGpt5 ? undefined : config.topP,
    presencePenalty: isGpt5 ? undefined : config.presencePenalty,
    frequencyPenalty: isGpt5 ? undefined : config.frequencyPenalty,
    streaming: true,
    configuration: baseURL ? { baseURL } : undefined,
  });
}
