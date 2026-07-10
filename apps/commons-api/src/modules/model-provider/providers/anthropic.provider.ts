import { Logger } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { ModelConfig } from '../model-provider.interface';

/**
 * Claude 4.6+ / 5 family: adaptive thinking + `output_config.effort`.
 * `budget_tokens` is deprecated on 4.6 and rejected (400) on 4.7+/Sonnet 5/Fable.
 */
const ADAPTIVE_FAMILY =
  /^claude-(opus-4-[6-9]|opus-[5-9]|sonnet-4-[6-9]|sonnet-[5-9]|fable-\d|mythos-\d)/;

/**
 * Models that reject temperature/top_p outright (Opus 4.7+, Sonnet 5+,
 * Fable/Mythos). Sending them returns a 400, so sampling params must be
 * omitted entirely for these — regardless of thinking configuration.
 */
const NO_SAMPLING_FAMILY =
  /^claude-(opus-4-[7-9]|opus-[5-9]|sonnet-[5-9]|fable-\d|mythos-\d)/;

/** Pre-4.6 models where thinking is opt-in via a manual token budget. */
const BUDGET_THINKING_FAMILY =
  /^claude-(3-7-sonnet|opus-4-[015]|sonnet-4-[05]|haiku-4-5)/;

/** Manual thinking budgets per effort level (min accepted by the API is 1024). */
const THINKING_BUDGET_TOKENS: Record<string, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
  xhigh: 32768,
};

/**
 * Builds a LangChain ChatAnthropic instance from a ModelConfig.
 * Supports BYOK via config.apiKey.
 *
 * reasoningEffort mapping:
 * - 4.6+/5 family — none/minimal/low run at `effort: low` with no explicit
 *   thinking config (fastest first token); medium+ enable adaptive thinking
 *   with a matching effort. Unset keeps the model's own defaults.
 * - Pre-4.6 thinking models — low+ enable `{type: enabled, budget_tokens}`;
 *   sampling params are omitted (extended thinking requires default sampling)
 *   and maxTokens is raised above the budget.
 * - Non-thinking models ignore the hint entirely.
 */
export function buildAnthropicModel(config: ModelConfig): ChatAnthropic {
  const logger = new Logger('AnthropicProvider');

  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('No Anthropic API key found — requests will fail');
  }

  const effort = config.reasoningEffort;
  const extra: Record<string, any> = {};
  let maxTokens = config.maxTokens ?? 8096;
  let omitSampling = NO_SAMPLING_FAMILY.test(config.modelId);

  if (ADAPTIVE_FAMILY.test(config.modelId)) {
    if (effort === 'none' || effort === 'minimal' || effort === 'low') {
      extra.outputConfig = { effort: 'low' };
    } else if (effort) {
      extra.thinking = { type: 'adaptive' };
      // xhigh only exists on Opus 4.7+/Sonnet 5/Fable — clamp to high on 4.6.
      extra.outputConfig = {
        effort:
          effort === 'xhigh' && !NO_SAMPLING_FAMILY.test(config.modelId)
            ? 'high'
            : effort,
      };
    }
  } else if (
    BUDGET_THINKING_FAMILY.test(config.modelId) &&
    effort &&
    effort !== 'none' &&
    effort !== 'minimal'
  ) {
    const budget = THINKING_BUDGET_TOKENS[effort] ?? 8192;
    extra.thinking = { type: 'enabled', budget_tokens: budget };
    maxTokens = Math.max(maxTokens, budget + 4096);
    omitSampling = true;
  }

  return new ChatAnthropic({
    model: config.modelId,
    apiKey,
    temperature: omitSampling ? undefined : (config.temperature ?? 0),
    maxTokens,
    topP: omitSampling ? undefined : config.topP,
    streaming: true,
    ...extra,
  });
}
