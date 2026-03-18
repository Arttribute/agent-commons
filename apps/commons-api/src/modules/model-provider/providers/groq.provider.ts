import { Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { ModelConfig } from '../model-provider.interface';

export function buildGroqModel(config: ModelConfig): ChatGroq {
  const logger = new Logger('GroqProvider');

  const apiKey = config.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.warn('No Groq API key found — requests will fail');
  }

  return new ChatGroq({
    model: config.modelId,
    apiKey,
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens,
    streaming: true,
  });
}
