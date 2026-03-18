import { Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ModelConfig } from '../model-provider.interface';

/**
 * Builds a LangChain ChatAnthropic instance from a ModelConfig.
 * Supports BYOK via config.apiKey.
 */
export function buildAnthropicModel(config: ModelConfig): ChatAnthropic {
  const logger = new Logger('AnthropicProvider');

  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('No Anthropic API key found — requests will fail');
  }

  return new ChatAnthropic({
    model: config.modelId,
    apiKey,
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens ?? 8096,
    topP: config.topP,
    streaming: true,
  });
}
