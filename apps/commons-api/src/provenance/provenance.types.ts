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

export interface ProvenanceSourceReference {
  url: string;
  domain: string;
  title?: string;
  rank?: number;
  publishedAt?: string;
  contentHash?: string;
}

export interface ProvenanceLineageMetadata {
  schemaVersion: 1;
  kind:
    | 'web_search'
    | 'workflow'
    | 'decision'
    | 'delegation'
    | 'library_retrieval'
    | 'knowledge_retrieval'
    | 'tool';
  tool?: { name: string; provider?: string; invocationId?: string };
  query?: { text: string; sha256?: string };
  sources?: ProvenanceSourceReference[];
  workflow?: {
    workflowId: string;
    executionId?: string;
    nodeId?: string;
    nodeType?: string;
    version?: number | string;
    definitionHash?: string;
    parentExecutionId?: string;
  };
  decision?: {
    type: 'condition' | 'human_approval' | 'policy' | 'routing';
    outcome: string | boolean;
    rule?: string;
    alternatives?: string[];
    /** Safe, reportable human-in-the-loop context. Approval credentials are forbidden. */
    approval?: {
      requesterId?: string;
      reviewerId?: string;
      reviewerType?: 'human' | 'agent' | 'service';
      prompt?: string;
      questionIds?: string[];
      responseFieldNames?: string[];
      responseHash?: string;
      note?: string;
      reason?: string;
    };
  };
  delegation?: {
    fromAgentId?: string;
    toAgentId: string;
    role?: string;
    architecture?: string;
    handoffPolicy?: string;
    contextPolicy?: string;
  };
  library?: {
    query: string;
    algorithm: 'hybrid' | 'semantic' | 'lexical';
    semanticWeight?: number;
    lexicalWeight?: number;
    embedding?: {
      model: string;
      dimensions: number;
      normalizationVersion: string;
      computedBy: 'agent-commons' | 'provenancekit' | 'external';
      vectorIncluded: false;
    };
    results: Array<{
      itemId: string;
      name?: string;
      kind?: string;
      sourceSessionId?: string;
      sourceUri?: string;
      sourceType?: string;
      contentHash?: string;
      embeddingModel?: string;
      embeddingCacheKey?: string;
      chunkIndex?: number;
      score: number;
      percentageMatch: number;
      rank: number;
    }>;
  };
  knowledge?: {
    query: string;
    algorithm: 'hybrid_graph' | 'semantic' | 'lexical' | 'graph';
    semanticWeight?: number;
    lexicalWeight?: number;
    graphExpansion?: boolean;
    embedding?: {
      model: string;
      dimensions: number;
      normalizationVersion: string;
      computedBy: 'agent-commons' | 'external';
      vectorIncluded: false;
    };
    results: Array<{
      spaceId: string;
      documentId: string;
      path?: string;
      title?: string;
      heading?: string;
      contentHash?: string;
      revision?: number;
      embeddingModel?: string;
      chunkIndex?: number;
      score: number;
      percentageMatch: number;
      rank: number;
      matchedBy?: string[];
    }>;
  };
}

export interface StartProvenanceRunInput {
  traceId: string;
  sessionId?: string;
  agentId?: string;
  scopeType?: 'agent_run' | 'workflow' | 'task' | 'cli' | 'sdk' | string;
  scopeId?: string;
  initiator?: string;
  workspaceId?: string;
  provider: string;
  modelId: string;
  options?: ProvenanceRunOptions;
  input?: unknown;
  metadata?: Record<string, unknown>;
  lineage?: ProvenanceLineageMetadata;
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
  /** Principal responsible for this event. Defaults to the run's agent/runtime. */
  performedBy?: {
    type: 'human' | 'agent' | 'service' | 'runtime';
    id?: string;
    role?: string;
  };
  /** Typed, user-visible lineage. Never include credentials or private reasoning. */
  lineage?: ProvenanceLineageMetadata;
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
