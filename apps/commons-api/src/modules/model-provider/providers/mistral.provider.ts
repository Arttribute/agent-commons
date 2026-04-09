import { Logger } from '@nestjs/common';
import { ChatMistralAI } from '@langchain/mistralai';
import { ModelConfig } from '../model-provider.interface';

export function buildMistralModel(config: ModelConfig): ChatMistralAI {
  const logger = new Logger('MistralProvider');

  const apiKey = config.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    logger.warn('No Mistral API key found — requests will fail');
  }

  return new ChatMistralAI({
    model: config.modelId,
    apiKey,
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens,
    topP: config.topP,
    streaming: true,
  });
}
