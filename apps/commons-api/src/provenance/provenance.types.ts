export type ProvenanceCaptureMode = 'off' | 'metadata' | 'full';

export interface ProvenanceRunOptions {
  /** Off disables capture; metadata is the privacy-preserving default. */
  mode?: ProvenanceCaptureMode;
  /** Explicit request to anchor the completed EAA bundle through a sink. */
  onchain?: boolean;
}

export type ProvenanceEventCategory =
  | 'input'
  | 'context'
  | 'model'
  | 'tool'
  | 'output'
  | 'system'
  | 'error';

export interface StartProvenanceRunInput {
  traceId: string;
  sessionId: string;
  agentId: string;
  initiator?: string;
  workspaceId?: string;
  provider: string;
  modelId: string;
  options?: ProvenanceRunOptions;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface RecordProvenanceEventInput {
  category: ProvenanceEventCategory;
  eventType: string;
  name: string;
  phase?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  spanId?: string;
  parentSpanId?: string;
  summary?: string;
  payload?: unknown;
  result?: unknown;
  content?: unknown;
  startedAt?: Date;
  endedAt?: Date;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}

export interface FinishProvenanceRunInput {
  status: 'completed' | 'failed' | 'cancelled';
  output?: unknown;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  error?: string;
}
