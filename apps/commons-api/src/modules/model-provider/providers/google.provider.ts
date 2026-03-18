import { Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ModelConfig } from '../model-provider.interface';

export function buildGoogleModel(config: ModelConfig): ChatGoogleGenerativeAI {
  const logger = new Logger('GoogleProvider');

  const apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.warn('No Google API key found — requests will fail');
  }

  return new ChatGoogleGenerativeAI({
    model: config.modelId,
    apiKey,
    temperature: config.temperature ?? 0,
    maxOutputTokens: config.maxTokens,
    topP: config.topP,
    streaming: true,
  });
}
