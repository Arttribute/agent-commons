import { ModelProviderName } from './model-provider.interface';

export interface ModelRegistryEntry {
  provider: ModelProviderName;
  modelId: string;
  displayName: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
  inputPricePer1kTokens: number;   // USD
  outputPricePer1kTokens: number;  // USD
  tier: 'frontier' | 'standard' | 'fast' | 'local';
}

export const MODEL_REGISTRY: ModelRegistryEntry[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    provider: 'anthropic',
    modelId: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.015,
    outputPricePer1kTokens: 0.075,
    tier: 'frontier',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.003,
    outputPricePer1kTokens: 0.015,
    tier: 'standard',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.0008,
    outputPricePer1kTokens: 0.004,
    tier: 'fast',
  },
  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.0025,
    outputPricePer1kTokens: 0.01,
    tier: 'frontier',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.00015,
    outputPricePer1kTokens: 0.0006,
    tier: 'fast',
  },
  // ── Google ─────────────────────────────────────────────────────────────────
  {
    provider: 'google',
    modelId: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.0001,
    outputPricePer1kTokens: 0.0004,
    tier: 'fast',
  },
  {
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1000000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: true,
    inputPricePer1kTokens: 0.00125,
    outputPricePer1kTokens: 0.005,
    tier: 'frontier',
  },
  // ── Mistral ────────────────────────────────────────────────────────────────
  {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    displayName: 'Mistral Large',
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    inputPricePer1kTokens: 0.002,
    outputPricePer1kTokens: 0.006,
    tier: 'standard',
  },
  // ── Groq ───────────────────────────────────────────────────────────────────
  {
    provider: 'groq',
    modelId: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B (Groq)',
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    inputPricePer1kTokens: 0.00059,
    outputPricePer1kTokens: 0.00079,
    tier: 'fast',
  },
  // ── Ollama (local) ─────────────────────────────────────────────────────────
  {
    provider: 'ollama',
    modelId: 'llama3.2',
    displayName: 'Llama 3.2 (Local)',
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    inputPricePer1kTokens: 0,
    outputPricePer1kTokens: 0,
    tier: 'local',
  },
  {
    provider: 'ollama',
    modelId: 'qwen2.5',
    displayName: 'Qwen 2.5 (Local)',
    contextWindow: 128000,
    supportsTools: true,
    supportsStreaming: true,
    supportsVision: false,
    inputPricePer1kTokens: 0,
    outputPricePer1kTokens: 0,
    tier: 'local',
  },
];

export function getModelInfo(provider: ModelProviderName, modelId: string): ModelRegistryEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.modelId === modelId);
}

export function calculateCost(
  provider: ModelProviderName,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = getModelInfo(provider, modelId);
  if (!model) return 0;
  return (
    (inputTokens / 1000) * model.inputPricePer1kTokens +
    (outputTokens / 1000) * model.outputPricePer1kTokens
  );
}
