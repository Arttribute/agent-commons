// ─── Core Types ───────────────────────────────────────────────────────────────

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama';

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface Agent {
  agentId: string;
  name: string;
  owner?: string;
  instructions?: string;
  persona?: string;
  avatar?: string;
  modelProvider: ModelProvider;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  commonTools?: string[];
  externalTools?: string[];
  isLiaison?: boolean;
  externalUrl?: string;
  createdAt: string;
}

export interface CreateAgentParams {
  name: string;
  instructions?: string;
  persona?: string;
  owner?: string;
  modelProvider?: ModelProvider;
  modelId?: string;
  modelApiKey?: string;
  modelBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  commonTools?: string[];
  avatar?: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  agentId: string;
  initiator: string;
  title?: string;
  model: ModelConfig & { name?: string };
  createdAt: string;
}

// ─── Run / Stream ─────────────────────────────────────────────────────────────

export interface RunParams {
  agentId: string;
  messages: ChatMessage[];
  sessionId?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
}

export type StreamEventType =
  | 'token'
  | 'toolStart'
  | 'toolEnd'
  | 'agent_step'
  | 'final'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'status'
  | 'heartbeat'
  | 'error';

export interface StreamEvent {
  type: StreamEventType;
  role?: string;
  content?: string;
  toolName?: string;
  input?: string;
  output?: any;
  timestamp?: string;
  payload?: any;
  message?: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface Workflow {
  workflowId: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  ownerId: string;
  ownerType: 'user' | 'agent';
  isPublic?: boolean;
  category?: string;
  tags?: string[];
  createdAt: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  outputMapping?: Record<string, string>;
}

export type WorkflowNodeType =
  | 'tool'         // invoke a registered tool
  | 'input'        // pass-through: outputs the workflow inputData
  | 'output'       // pass-through: marks final output
  | 'condition'    // evaluates config.expression → { result: boolean }; routes true/false branch
  | 'transform'    // field mapping via config.mapping; no tool call
  | 'loop'         // iterates config.iterations times or over config.itemsPath array
  | 'agent_processor' // runs an LLM inference step via config.agentId
  | 'human_approval'; // pauses execution until approved/rejected

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType | string;
  toolId?: string;
  position?: { x: number; y: number };
  config?: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** For condition nodes: 'true' routes the true branch, 'false' the false branch */
  sourceHandle?: string;
  targetHandle?: string;
  mapping?: Record<string, string>;
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'awaiting_approval';
  startedAt?: string;
  completedAt?: string;
  outputData?: any;
  nodeResults?: Record<string, any>;
  errorMessage?: string;
  currentNode?: string;
  /** Set when status is 'awaiting_approval' */
  pausedAtNode?: string;
  approvalToken?: string;
}

// ─── Task ─────────────────────────────────────────────────────────────────────

export interface Task {
  taskId: string;
  agentId: string;
  sessionId: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  executionMode: 'single' | 'workflow' | 'sequential';
  workflowId?: string;
  cronExpression?: string;
  isRecurring?: boolean;
  priority?: number;
  timeoutMs?: number;
  progress?: number;
  resultContent?: any;
  summary?: string;
  errorMessage?: string;
  createdBy: string;
  createdByType: 'user' | 'agent';
  createdAt: string;
}

export interface CreateTaskParams {
  agentId: string;
  sessionId: string;
  title: string;
  description?: string;
  executionMode?: 'single' | 'workflow' | 'sequential';
  workflowId?: string;
  workflowInputs?: Record<string, any>;
  cronExpression?: string;
  scheduledFor?: Date;
  isRecurring?: boolean;
  dependsOn?: string[];
  tools?: string[];
  toolConstraintType?: 'hard' | 'soft' | 'none';
  toolInstructions?: string;
  priority?: number;
  /** Max execution time in milliseconds for workflow tasks */
  timeoutMs?: number;
  createdBy: string;
  createdByType: 'user' | 'agent';
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

export interface Tool {
  toolId: string;
  name: string;
  displayName?: string;
  description?: string;
  schema: any;
  owner?: string;
  isPublic?: boolean;
  tags?: string[];
  createdAt: string;
}

export interface CreateToolParams {
  name: string;
  displayName?: string;
  description?: string;
  schema: any;
  owner?: string;
  ownerType?: 'user' | 'agent';
  visibility?: 'private' | 'public' | 'platform';
  tags?: string[];
}

// ─── Tool Key ─────────────────────────────────────────────────────────────────

export interface ToolKey {
  keyId: string;
  toolId?: string;
  ownerId: string;
  ownerType: 'user' | 'agent';
  keyName: string;
  displayName?: string;
  description?: string;
  maskedValue?: string;
  isActive?: boolean;
  usageCount?: number;
  createdAt: string;
}

export interface CreateToolKeyParams {
  toolId?: string;
  ownerId: string;
  ownerType: 'user' | 'agent';
  keyName: string;
  value: string;
  displayName?: string;
  description?: string;
  keyType?: string;
}

// ─── Tool Permission ──────────────────────────────────────────────────────────

export interface ToolPermission {
  id: string;
  toolId: string;
  subjectId: string;
  subjectType: 'user' | 'agent';
  permission: 'read' | 'execute' | 'admin';
  grantedBy?: string;
  createdAt: string;
  expiresAt?: string;
}

// ─── A2A Protocol ─────────────────────────────────────────────────────────────

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface A2ATextPart { type: 'text'; text: string; metadata?: Record<string, any> }
export interface A2ADataPart { type: 'data'; data: Record<string, any>; metadata?: Record<string, any> }
export interface A2AFilePart {
  type: 'file';
  file: { name?: string; mimeType?: string; bytes?: string; uri?: string };
  metadata?: Record<string, any>;
}
export type A2AMessagePart = A2ATextPart | A2ADataPart | A2AFilePart;

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2AMessagePart[];
  contextId?: string;
  messageId?: string;
  taskId?: string;
  metadata?: Record<string, any>;
}

export interface A2AArtifact {
  artifactId?: string;
  name?: string;
  description?: string;
  parts: A2AMessagePart[];
  index?: number;
  metadata?: Record<string, any>;
}

export interface A2ATask {
  id: string;
  contextId?: string;
  status: {
    state: A2ATaskState;
    message?: A2AMessage;
    timestamp?: string;
  };
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, any>;
}

export interface A2ASkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  version: string;
  capabilities: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
}

export interface A2ASendTaskParams {
  id?: string;
  message: A2AMessage;
  pushNotification?: { url: string; token?: string };
}

// ─── MCP ──────────────────────────────────────────────────────────────────────

export type McpConnectionType = 'stdio' | 'sse' | 'http' | 'streamable-http';

export interface McpServer {
  serverId: string;
  name: string;
  description?: string;
  connectionType: McpConnectionType;
  connectionConfig: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
  toolsCount: number;
  capabilities?: Record<string, any>;
  isPublic: boolean;
  ownerId: string;
  ownerType: 'user' | 'agent';
  createdAt: string;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

// ─── SDK Config ───────────────────────────────────────────────────────────────

export interface CommonsClientConfig {
  baseUrl: string;
  apiKey?: string;
  initiator?: string;
  /** Fetch implementation — defaults to global fetch */
  fetch?: typeof fetch;
}

// ─── Skill ────────────────────────────────────────────────────────────────────

export interface Skill {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  triggers: string[];
  ownerId?: string | null;
  ownerType: string;
  isPublic: boolean;
  isActive: boolean;
  version: string;
  tags: string[];
  icon?: string | null;
  usageCount: number;
  source: string;
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillIndex {
  skillId: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  icon?: string | null;
  triggers: string[];
}

export interface CreateSkillParams {
  slug: string;
  name: string;
  description: string;
  instructions: string;
  tools?: string[];
  triggers?: string[];
  ownerId?: string;
  ownerType?: 'platform' | 'user' | 'agent';
  isPublic?: boolean;
  tags?: string[];
  icon?: string;
  source?: string;
  sourceUrl?: string;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export type MemoryType = 'episodic' | 'semantic' | 'procedural';
export type MemorySourceType = 'auto' | 'manual';

export interface AgentMemory {
  memoryId: string;
  agentId: string;
  sessionId?: string;
  memoryType: MemoryType;
  content: string;
  summary: string;
  importanceScore: number;
  accessCount: number;
  lastAccessedAt?: string;
  tags: string[];
  sourceType: MemorySourceType;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStats {
  total: number;
  episodic: number;
  semantic: number;
  procedural: number;
  avgImportance: number;
}

export interface CreateMemoryParams {
  agentId: string;
  sessionId?: string;
  memoryType?: MemoryType;
  content: string;
  summary: string;
  importanceScore?: number;
  tags?: string[];
}

export interface UpdateMemoryParams {
  content?: string;
  summary?: string;
  importanceScore?: number;
  tags?: string[];
  isActive?: boolean;
  memoryType?: MemoryType;
}

// ─── Usage / Observability ────────────────────────────────────────────────────

export interface UsageEvent {
  eventId: string;
  agentId: string;
  sessionId?: string;
  taskId?: string;
  workflowExecutionId?: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  isByok: boolean;
  durationMs?: number;
  /** Trace ID — links all LLM calls in a single runAgent() invocation. */
  traceId?: string;
  createdAt: string;
}

export interface UsageAggregation {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
  events: UsageEvent[];
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export type WalletType = 'eoa' | 'erc4337' | 'external';

export interface AgentWallet {
  id: string;
  agentId: string;
  walletType: WalletType;
  address: string;
  smartAccountAddress?: string | null;
  chainId: string;
  label?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface WalletBalance {
  address: string;
  chainId: string;
  native: string;  // ETH formatted
  usdc: string;    // USDC formatted (6 decimals)
}

export interface CreateWalletParams {
  agentId: string;
  walletType?: WalletType;
  label?: string;
  /** For 'external' wallets: the owner-provided address */
  externalAddress?: string;
  chainId?: string;
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export type ApiKeyPrincipalType = 'user' | 'agent';

export interface ApiKey {
  id: string;
  label?: string | null;
  principalId: string;
  principalType: ApiKeyPrincipalType;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface CreateApiKeyParams {
  principalId: string;
  principalType: ApiKeyPrincipalType;
  label?: string;
}

/** Returned only on creation — the plaintext key is never available again. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}
