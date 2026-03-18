import { Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { ModelConfig } from '../model-provider.interface';

/**
 * Builds a LangChain ChatOpenAI instance from a ModelConfig.
 * Supports BYOK (bring your own key) via config.apiKey.
 */
export function buildOpenAIModel(config: ModelConfig): ChatOpenAI {
  const logger = new Logger('OpenAIProvider');

  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('No OpenAI API key found — requests will fail');
  }

  return new ChatOpenAI({
    model: config.modelId,
    apiKey,
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens,
    topP: config.topP,
    presencePenalty: config.presencePenalty,
    frequencyPenalty: config.frequencyPenalty,
    streaming: true,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });
}
