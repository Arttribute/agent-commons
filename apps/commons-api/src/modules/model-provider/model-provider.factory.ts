import { Injectable, Logger } from '@nestjs/common';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ModelConfig, ModelProviderName } from './model-provider.interface';
import { buildOpenAIModel } from './providers/openai.provider';
import { buildAnthropicModel } from './providers/anthropic.provider';
import { buildOllamaModel } from './providers/ollama.provider';
import { buildGoogleModel } from './providers/google.provider';
import { buildGroqModel } from './providers/groq.provider';
import { buildMistralModel } from './providers/mistral.provider';

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  provider: 'openai',
  modelId: 'gpt-5.4-mini',
};

@Injectable()
export class ModelProviderFactory {
  private readonly logger = new Logger(ModelProviderFactory.name);

  /**
   * Build a LangChain chat model from a ModelConfig.
   * Falls back to DEFAULT_MODEL_CONFIG if no config provided.
   */
  build(config?: Partial<ModelConfig>): BaseChatModel {
    const resolved: ModelConfig = {
      ...DEFAULT_MODEL_CONFIG,
      ...config,
    };

    this.logger.debug(
      `Building model: ${resolved.provider}/${resolved.modelId}`,
    );

    switch (resolved.provider as ModelProviderName) {
      case 'openai':
      case 'openrouter':
      case 'xai':
      case 'custom':
        return buildOpenAIModel(resolved);
      case 'anthropic':
        return buildAnthropicModel(resolved);
      case 'google':
        return buildGoogleModel(resolved) as unknown as BaseChatModel;
      case 'groq':
        return buildGroqModel(resolved);
      case 'mistral':
        return buildMistralModel(resolved);
      case 'ollama':
        return buildOllamaModel(resolved);
      default: {
        this.logger.warn(
          `Unknown provider "${resolved.provider}", falling back to OpenAI`,
        );
        return buildOpenAIModel({ ...resolved, provider: 'openai' });
      }
    }
  }

  /**
   * Convenience: build from a session model JSONB (supports both old {name} and new {provider, modelId} formats).
   */
  buildFromSessionModel(
    sessionModel: Record<string, any> | null | undefined,
    agentConfig?: Partial<ModelConfig>,
  ): BaseChatModel {
    return this.build(this.resolveSessionModel(sessionModel, agentConfig));
  }

  /** Resolve the exact model configuration used for both billing and runtime. */
  resolveSessionModel(
    sessionModel: Record<string, any> | null | undefined,
    agentConfig?: Partial<ModelConfig>,
  ): ModelConfig {
    if (!sessionModel) {
      return { ...DEFAULT_MODEL_CONFIG, ...agentConfig };
    }

    // Support legacy format: { name: 'gpt-4o' }
    const provider =
      sessionModel.provider ??
      this.inferProviderFromModelName(sessionModel.name) ??
      'openai';
    const modelId =
      sessionModel.modelId ?? sessionModel.name ?? DEFAULT_MODEL_CONFIG.modelId;

    return {
      provider,
      modelId,
      apiKey: sessionModel.apiKey ?? agentConfig?.apiKey,
      baseUrl: sessionModel.baseUrl ?? agentConfig?.baseUrl,
      temperature: sessionModel.temperature ?? agentConfig?.temperature,
      maxTokens: sessionModel.maxTokens ?? agentConfig?.maxTokens,
      topP: sessionModel.topP ?? agentConfig?.topP,
      presencePenalty:
        sessionModel.presencePenalty ?? agentConfig?.presencePenalty,
      frequencyPenalty:
        sessionModel.frequencyPenalty ?? agentConfig?.frequencyPenalty,
      reasoningEffort:
        sessionModel.reasoningEffort ?? agentConfig?.reasoningEffort,
      verbosity: sessionModel.verbosity ?? agentConfig?.verbosity,
    };
  }

  /** Infer provider from a legacy model name string */
  private inferProviderFromModelName(
    name?: string,
  ): ModelProviderName | undefined {
    if (!name) return undefined;
    if (
      name.startsWith('gpt-') ||
      name.startsWith('o1') ||
      name.startsWith('o3')
    )
      return 'openai';
    if (name.startsWith('grok-')) return 'xai';
    if (name.startsWith('claude-')) return 'anthropic';
    if (name.startsWith('gemini-')) return 'google';
    if (name.startsWith('mistral-') || name.startsWith('mixtral-'))
      return 'mistral';
    if (name.startsWith('llama') || name.startsWith('qwen')) return 'ollama';
    return undefined;
  }
}
