import { Logger } from '@nestjs/common';
import { ChatOllama } from '@langchain/ollama';
import { ModelConfig } from '../model-provider.interface';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

/**
 * Local model families that support Ollama's `think` option. Setting `think`
 * on a model without thinking support is an Ollama error, so anything outside
 * this list keeps the parameter unset.
 */
const THINKING_MODELS = /deepseek-r1|qwen3|gpt-oss|magistral|exaone-deep|cogito|smallthinker/i;

/**
 * Builds a LangChain ChatOllama instance for local model inference.
 * baseUrl defaults to http://localhost:11434 or OLLAMA_BASE_URL env var.
 *
 * These models think by default, which also leaks <think> text into chat
 * output — so none/minimal turns it off and any higher effort keeps it on
 * explicitly.
 */
export function buildOllamaModel(config: ModelConfig): ChatOllama {
  const logger = new Logger('OllamaProvider');

  const baseUrl = config.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL;
  logger.debug(`Using Ollama at ${baseUrl} with model ${config.modelId}`);

  const effort = config.reasoningEffort;
  const think =
    effort && THINKING_MODELS.test(config.modelId)
      ? !(effort === 'none' || effort === 'minimal')
      : undefined;

  return new ChatOllama({
    model: config.modelId,
    baseUrl,
    temperature: config.temperature ?? 0,
    numPredict: config.maxTokens,
    think,
  });
}
