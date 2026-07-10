import { Logger } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ModelConfig } from '../model-provider.interface';

/**
 * Maps the platform reasoningEffort to Gemini thinking controls.
 *
 * - Gemini 3.x uses `thinkingLevel` (LOW/HIGH; budgets are deprecated there).
 * - Gemini 2.5 uses `thinkingBudget` in tokens. Flash variants can disable
 *   thinking with 0; Pro cannot go below 128. 2.5 models think dynamically by
 *   default, so trivial turns pay seconds of thinking unless capped here.
 * - Older Gemini (2.0/1.5) has no thinking controls — return undefined.
 * - `medium` (and unset) keep the model's own dynamic default.
 */
function thinkingConfigFor(
  modelId: string,
  effort: ModelConfig['reasoningEffort'],
): Record<string, any> | undefined {
  if (!effort || effort === 'medium') return undefined;
  const id = modelId.toLowerCase();

  if (/gemini-3/.test(id)) {
    if (effort === 'none' || effort === 'minimal' || effort === 'low') {
      return { thinkingLevel: 'LOW' };
    }
    return { thinkingLevel: 'HIGH' };
  }

  if (/gemini-2\.5/.test(id)) {
    const isPro = /gemini-2\.5-pro/.test(id);
    if (effort === 'none' || effort === 'minimal') {
      return { thinkingBudget: isPro ? 128 : 0 };
    }
    if (effort === 'low') return { thinkingBudget: 1024 };
    if (effort === 'high') return { thinkingBudget: isPro ? 16384 : 12288 };
    return { thinkingBudget: isPro ? 32768 : 24576 }; // xhigh
  }

  return undefined;
}

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
    thinkingConfig: thinkingConfigFor(config.modelId, config.reasoningEffort),
  });
}
