import { Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ModelConfig } from '../model-provider.interface';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Builds a LangChain ChatOllama instance for local model inference.
 * baseUrl defaults to http://localhost:11434 or OLLAMA_BASE_URL env var.
 */
export function buildOllamaModel(config: ModelConfig): ChatOllama {
  const logger = new Logger('OllamaProvider');

  const baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  logger.debug(`Using Ollama at ${baseUrl} with model ${config.modelId}`);

  return new ChatOllama({
    model: config.modelId,
    baseUrl,
    temperature: config.temperature ?? 0,
    numPredict: config.maxTokens,
  });
}
