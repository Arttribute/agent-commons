import { Logger } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { ModelConfig } from '../model-provider.interface';

/**
 * Maps the platform reasoningEffort to Groq's `reasoning_effort`, which only
 * some hosted models accept (per Groq docs: openai/gpt-oss-* take
 * low/medium/high; qwen3 takes none/default). Other models — including the
 * Llama family — reject the parameter, so they get undefined.
 */
function groqReasoningEffort(
  modelId: string,
  effort: ModelConfig['reasoningEffort'],
): 'none' | 'default' | 'low' | 'medium' | 'high' | undefined {
  if (!effort) return undefined;
  const id = modelId.toLowerCase();

  if (id.includes('gpt-oss')) {
    if (effort === 'none' || effort === 'minimal' || effort === 'low') {
      return 'low';
    }
    return effort === 'medium' ? 'medium' : 'high';
  }
  if (id.includes('qwen3')) {
    return effort === 'none' || effort === 'minimal' ? 'none' : 'default';
  }
  return undefined;
}

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
    reasoningEffort: groqReasoningEffort(config.modelId, config.reasoningEffort),
  });
}
