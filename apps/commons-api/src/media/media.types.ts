export type MediaKind = 'image' | 'video' | 'audio' | 'music';
export type MediaOperation = 'generate' | 'transform';

export type MediaSettingField = {
  key: string;
  label: string;
  type: 'select' | 'number' | 'boolean' | 'text';
  default?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
};

export type MediaModelDescriptor = {
  /** Stable Commons identifier. Provider model names are not always unique by modality. */
  modelKey: string;
  provider: string;
  /** Exact model identifier sent to the upstream provider. */
  modelId: string;
  displayName: string;
  description: string;
  kind: MediaKind;
  operations: MediaOperation[];
  inputKinds: MediaKind[];
  maxInputs: number;
  tier: 'fast' | 'standard' | 'frontier';
  async: boolean;
  settings: MediaSettingField[];
  pricing: {
    unit: 'image' | 'second' | 'request' | 'audio_token' | 'million_video_tokens';
    usd: number;
    note: string;
    sourceUrl: string;
    settlement: 'catalog' | 'provider_usage';
    variants?: Record<string, number>;
    requiresOverride?: boolean;
  };
  badges?: string[];
};

export type MediaInputAsset = {
  itemId: string;
  name: string;
  kind: string;
  mimeType: string;
  /** Short-lived, provider-readable URL for large video/audio references. */
  url?: string;
  buffer: Buffer;
};

export type MediaGenerateRequest = {
  model: MediaModelDescriptor;
  prompt: string;
  operation: MediaOperation;
  inputs: MediaInputAsset[];
  settings: Record<string, unknown>;
  onProgress?: (progress: number, providerOperationId?: string) => Promise<void>;
};

export type MediaProviderOutput = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  providerOperationId?: string;
  metadata?: Record<string, unknown>;
  billing?: {
    actualCostUsd: number;
    quantity: number;
    unit: string;
    unitPriceUsd: number;
    source: 'catalog' | 'provider_usage';
    providerUsage?: Record<string, unknown>;
  };
};

export interface MediaProviderAdapter {
  readonly id: string;
  supports(modelId: string): boolean;
  generate(input: MediaGenerateRequest): Promise<MediaProviderOutput>;
}

export type CreateMediaGenerationInput = {
  projectId?: string;
  provider?: string;
  /** Preferred stable catalog identifier; modelId remains accepted for older clients. */
  modelKey?: string;
  modelId?: string;
  prompt: string;
  operation?: MediaOperation;
  inputItemIds?: string[];
  settings?: Record<string, unknown>;
  agentId?: string;
  sessionId?: string;
  toolCallId?: string;
};

export type MediaPrincipal = {
  principalId: string;
  principalType: 'user' | 'agent' | 'service';
  workspaceId?: string | null;
  /** Optional agent acting on behalf of the authorized principal. */
  actorId?: string;
};
