export type ModelProviderName = 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama';

export interface ModelConfig {
  provider: ModelProviderName;
  modelId: string;
  apiKey?: string;          // BYOK — user's own key; falls back to platform env var
  baseUrl?: string;         // For Ollama or custom OpenAI-compatible endpoints
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface StreamEvent {
  type: 'token' | 'tool_use' | 'tool_result' | 'agent_step' | 'done' | 'error';
  content?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
  stepIndex?: number;
  sessionId?: string;
  totalTokens?: number;
  durationMs?: number;
  costUsd?: number;
  message?: string;
  retryable?: boolean;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
}
