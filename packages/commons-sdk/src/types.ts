// ─── Core Types ───────────────────────────────────────────────────────────────

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "groq"
  | "ollama"
  | "openrouter"
  | "xai"
  | "custom";

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  verbosity?: "low" | "medium" | "high";
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export type AgentRuntimeType = "native" | "openclaw" | "hermes" | "custom";
export type AgentRuntimeStatus =
  | "disabled"
  | "provisioning"
  | "starting"
  | "ready"
  | "degraded"
  | "stopped"
  | "failed";

export interface AgentRuntimeConfig {
  deploymentMode?: "managed" | "external";
  channelPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  enabledPlugins?: string[];
  enabledToolsets?: string[];
  memoryMode?: "native" | "platform" | "hybrid";
  metadata?: Record<string, string | number | boolean>;
}

export interface AgentRuntime {
  runtimeType: AgentRuntimeType;
  version?: string | null;
  status: AgentRuntimeStatus;
  config: AgentRuntimeConfig;
  capabilities: Record<string, boolean>;
  updatedAt?: string | null;
  managed: boolean;
  computer?: AgentComputer | null;
}

export interface Agent {
  agentId: string;
  name: string;
  owner?: string;
  instructions?: string;
  persona?: string;
  greeting?: string;
  conversationStarters?: string[];
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
  runtimeType?: AgentRuntimeType;
  runtimeVersion?: string | null;
  runtimeStatus?: AgentRuntimeStatus;
  runtimeConfig?: AgentRuntimeConfig;
  runtimeCapabilities?: Record<string, boolean>;
}

// ─── Agent Computer ─────────────────────────────────────────────────────────

/** Agent computers are durable. Runtime pods may be replaced, but this identity persists. */
export type AgentComputerLifecycle = "persistent";
export type ComputerPersistence = AgentComputerLifecycle;
export type ComputerLifecycle = AgentComputerLifecycle;

export type ComputerResourceProfile =
  | "starter"
  | "standard"
  | "performance"
  | "gpu";
export type ComputerResourceMode = "fixed" | "elastic";
export type AgentComputerResourceProfile = ComputerResourceProfile;
export type AgentComputerResourceMode = ComputerResourceMode;

/**
 * Common accelerator names. Providers may expose additional values without
 * requiring an SDK release, so string extensions remain valid.
 */
export type ComputerGpuType =
  | "nvidia-t4"
  | "nvidia-l4"
  | "nvidia-a10"
  | "nvidia-a100"
  | "nvidia-h100"
  | "nvidia-h200"
  | "nvidia-b200"
  | (string & {});

export interface ComputerGpu {
  count: number;
  type?: ComputerGpuType;
}

export type AgentComputerGpuType = ComputerGpuType;
export type AgentComputerGpu = ComputerGpu;

/** Public, provider-neutral resource units. */
export interface ComputerResources {
  vcpu: number;
  memoryGiB: number;
  storageGiB: number;
  gpu?: ComputerGpu | null;
}

export type AgentComputerResources = ComputerResources;

export interface ComputerResourceUpdate {
  vcpu?: number;
  memoryGiB?: number;
  storageGiB?: number;
  gpu?: ComputerGpu | null;
}

export type AgentComputerDesiredState = "running" | "sleeping" | "disabled";
export type AgentComputerStatus =
  | "disabled"
  | "provisioning"
  | "starting"
  | "running"
  | "idle"
  | "sleeping"
  | "resizing"
  | "restarting"
  | "stopping"
  | "error"
  | "unavailable"
  // Deprecated wire states retained while older API deployments are upgraded.
  | "stopped"
  | "terminated"
  | "failed";

export type ComputerNetworkAccess =
  | "standard"
  | "restricted"
  | "disabled"
  | (string & {});

/**
 * Mutable computer settings only. Server-owned identity, provider, billing,
 * timestamps, and runtime fields intentionally cannot be submitted here.
 */
export interface ComputerConfigUpdate {
  enabled?: boolean;
  autoWake?: boolean;
  allowAgentUse?: boolean;
  allowBrowser?: boolean;
  allowTerminal?: boolean;
  allowFilesystem?: boolean;
  networkAccess?: ComputerNetworkAccess;
  resourceProfile?: ComputerResourceProfile;
  resourceMode?: ComputerResourceMode;
  resources?: ComputerResourceUpdate;
}

export interface AgentComputerConfig {
  configId: string;
  agentId: string;
  enabled: boolean;
  /** @deprecated Computers are always persistent. */
  defaultMode: AgentComputerLifecycle | "ephemeral";
  /** @deprecated Use autoWake. */
  autoStart: boolean;
  /** @deprecated Use allowAgentUse. */
  allowAgentStart: boolean;
  /** @deprecated The singleton computer is selected implicitly. */
  allowUserSelect: boolean;
  allowBrowser: boolean;
  allowTerminal: boolean;
  allowFilesystem: boolean;
  networkAccess: ComputerNetworkAccess;
  /** @deprecated The singleton limit is always one. */
  maxPersistentComputers: number;
  /** @deprecated Ephemeral computers are no longer supported. */
  maxEphemeralComputers: number;
  /** @deprecated The singleton limit is always one. */
  maxConcurrentComputers: number;
  /** @deprecated Use the service's sleep policy. */
  idleTtlMinutes: number;
  /** @deprecated Persistent computers are not scoped to chat sessions. */
  sessionTtlMinutes: number;
  image?: string | null;
  /** @deprecated Provider quantities are represented by resources. */
  cpuLimit?: string | null;
  /** @deprecated Provider quantities are represented by resources. */
  memoryLimit?: string | null;
  /** @deprecated Provider quantities are represented by resources. */
  storageLimit?: string | null;
  region?: string | null;
  provider: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;

  persistence?: ComputerPersistence;
  autoWake?: boolean;
  allowAgentUse?: boolean;
  resourceProfile?: ComputerResourceProfile;
  resourceMode?: ComputerResourceMode;
  resources?: ComputerResources;
  cpuRequest?: string | null;
  memoryRequest?: string | null;
  gpuType?: ComputerGpuType | null;
  gpuCount?: number;
  billingMode?: "tier" | "usage" | (string & {});
}

export interface AgentComputerBrowser {
  status?: "off" | "starting" | "on" | "error";
  url?: string | null;
  title?: string | null;
  screenshot?: string | null;
  lastAction?: string | null;
  error?: string | null;
  updatedAt?: string | null;
}

export interface AgentComputerTerminal {
  lastCommand?: string | null;
  lastExitCode?: number | null;
  lastOutput?: string | null;
  updatedAt?: string | null;
}

/** The one persistent cloud computer assigned to an agent. */
export interface AgentComputer {
  computerId: string;
  agentId: string;
  enabled: boolean;
  persistence: ComputerPersistence;
  desiredState: AgentComputerDesiredState;
  status: AgentComputerStatus;
  resourceProfile: ComputerResourceProfile;
  resourceMode: ComputerResourceMode;
  resources: ComputerResources;
  provider?: string;
  cloudProvider?: string | null;
  region?: string | null;
  runtimeId?: string | null;
  runtimeGeneration?: number;
  namespaceId?: string | null;
  workspaceRoot?: string | null;
  browser?: AgentComputerBrowser | null;
  terminal?: AgentComputerTerminal | null;
  lastActivityAt?: string | null;
  startedAt?: string | null;
  sleptAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Use AgentComputer. */
export interface AgentComputerInstance {
  computerId: string;
  agentId: string;
  sessionId?: string | null;
  ownerUserId?: string | null;
  workspaceId?: string | null;
  name: string;
  /** @deprecated Ephemeral values may be read from historical records only. */
  lifecycle: AgentComputerLifecycle | "ephemeral";
  status: AgentComputerStatus;
  provider: string;
  cloudProvider?: string | null;
  region?: string | null;
  namespaceId?: string | null;
  podName?: string | null;
  image?: string | null;
  cpuLimit?: string | null;
  memoryLimit?: string | null;
  storageLimit?: string | null;
  workspaceRoot?: string | null;
  workspaceSnapshot?: string | null;
  browser?: AgentComputerBrowser | null;
  terminal?: AgentComputerTerminal | null;
  metadata?: Record<string, any> | null;
  lastActivityAt?: string | null;
  expiresAt?: string | null;
  startedAt?: string | null;
  stoppedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;

  canonical?: boolean;
  enabled?: boolean;
  persistence?: ComputerPersistence;
  desiredState?: AgentComputerDesiredState;
  resourceProfile?: ComputerResourceProfile;
  resourceMode?: ComputerResourceMode;
  resources?: ComputerResources;
  cpuRequest?: string | null;
  memoryRequest?: string | null;
  gpuType?: ComputerGpuType | null;
  gpuCount?: number;
  runtimeId?: string | null;
  runtimeGeneration?: number;
  persistentVolumeId?: string | null;
  computeTenantId?: string | null;
  computeCellId?: string | null;
}

export interface ComputerActionParams {
  reason?: string;
}

export interface ComputerResizeParams {
  resourceProfile?: ComputerResourceProfile;
  resourceMode?: ComputerResourceMode;
  resources?: ComputerResourceUpdate;
}

export interface ComputerCommandParams {
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
}

export interface ComputerFile {
  path: string;
  content: string;
}

export interface ComputerBrowserOpenParams {
  url: string;
}

export interface AgentComputerEvent {
  eventId: string;
  computerId: string;
  agentId: string;
  sessionId?: string | null;
  eventType: string;
  actorType: string;
  actorId?: string | null;
  summary?: string | null;
  payload?: Record<string, any> | null;
  createdAt: string;
}

export interface CreateAgentParams {
  name: string;
  instructions?: string;
  persona?: string;
  greeting?: string;
  conversationStarters?: string[];
  owner?: string;
  ownerUserId?: string;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
  modelProvider?: ModelProvider;
  modelId?: string;
  modelApiKey?: string;
  modelBaseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  commonTools?: string[];
  avatar?: string;
  runtimeType?: AgentRuntimeType;
  runtimeVersion?: string;
  runtimeConfig?: AgentRuntimeConfig;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  agentId: string;
  initiator: string;
  title?: string;
  model: ModelConfig & { name?: string };
  createdAt: string;
  /** 'cli' | 'web' — origin of the session, used for filtering in the UI */
  source?: "cli" | "web";
  /** Same as source; returned from the backend column `initiator_type` */
  initiatorType?: "cli" | "web";
}

// ─── Run / Stream ─────────────────────────────────────────────────────────────

export interface RunParams {
  agentId: string;
  messages: ChatMessage[];
  sessionId?: string;
  initiatorId?: string;
  computerRequest?: {
    enabled: boolean;
    /** @deprecated The agent's singleton computer is selected implicitly. */
    computerIds?: string[];
    /** @deprecated Computers are always persistent; this value is ignored. */
    lifecycle?: AgentComputerLifecycle | "ephemeral";
  };
  /** Uploaded file references. Raw file bytes must be uploaded separately. */
  attachments?: Array<{ fileId: string }>;
  /** Extra text injected into the agent's system prompt. Used by the CLI to deliver the local tools manifest. */
  cliContext?: string;
  /** Caller-owned function catalog executed through cli_tool_request events. */
  cliTools?: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
        | Record<string, any>
      >;
  tool_call_id?: string;
  name?: string;
}

export type StreamEventType =
  | "token"
  | "tool"
  | "toolProgress"
  | "toolStart"
  | "toolEnd"
  | "agent_step"
  | "run_started"
  | "final"
  | "completed"
  | "failed"
  | "cancelled"
  | "status"
  | "keepalive"
  | "cli_tool_request"
  | "error";

export interface StreamEvent {
  type: StreamEventType;
  /** Identifies the run; pass to POST /v1/agents/runs/:runId/stream to resume a dropped stream. */
  runId?: string;
  /** Monotonic per-run sequence number; resume with `after: <last seen seq>` to avoid duplicates. */
  seq?: number;
  phase?: "commentary" | "final_answer" | string;
  role?: string;
  content?: string;
  stage?: string;
  status?: "queued" | "running" | "completed" | "failed" | string;
  name?: string;
  toolName?: string;
  tool?: string;
  toolCallId?: string;
  input?: string;
  args?: any;
  output?: any;
  result?: any;
  requestId?: string;
  timestamp?: string;
  sessionId?: string;
  payload?: any;
  message?: string;
  detail?: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface Workflow {
  workflowId: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  ownerId: string;
  ownerType: "user" | "agent";
  isPublic?: boolean;
  category?: string;
  tags?: string[];
  createdAt: string;
}

export interface WorkflowDefinition {
  startNodeId?: string;
  endNodeId?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  outputMapping?: Record<string, string>;
}

export type WorkflowNodeType =
  | "tool" // invoke a registered tool
  | "input" // pass-through: outputs the workflow inputData
  | "output" // pass-through: marks final output
  | "condition" // evaluates config.expression → { result: boolean }; routes true/false branch
  | "transform" // field mapping via config.mapping; no tool call
  | "loop" // iterates config.iterations times or over config.itemsPath array
  | "agent_processor" // runs an LLM inference step via config.agentId
  | "workflow" // invokes another saved workflow
  | "human_approval"; // pauses execution until approved/rejected

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType | string;
  toolId?: string;
  toolName?: string;
  agentId?: string;
  agentAvatar?: string;
  workflowId?: string;
  label?: string;
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
  /** Runtime target types used for dynamic (`any`) values and safe coercion. */
  targetTypes?: Record<string, string>;
  mappingMode?: "exact" | "dynamic" | "coerce";
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status:
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "awaiting_approval";
  startedAt?: string;
  completedAt?: string;
  outputData?: any;
  /** Alias returned by the immediate execute/status REST response. */
  result?: any;
  nodeResults?: Record<string, any>;
  /** Alias returned by the immediate execute/status REST response. */
  stepResults?: Record<string, any>;
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
  status:
    | "pending"
    | "started"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  executionMode: "single" | "workflow" | "sequential";
  workflowId?: string;
  cronExpression?: string;
  isRecurring?: boolean;
  scheduledFor?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  actualStart?: string;
  actualEnd?: string;
  estimatedDuration?: number;
  dependsOn?: string[];
  metadata?: Record<string, any>;
  priority?: number;
  timeoutMs?: number;
  progress?: number;
  resultContent?: any;
  summary?: string;
  errorMessage?: string;
  createdBy: string;
  createdByType: "user" | "agent";
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTaskParams {
  agentId: string;
  sessionId: string;
  title: string;
  description?: string;
  executionMode?: "single" | "workflow" | "sequential";
  workflowId?: string;
  workflowInputs?: Record<string, any>;
  cronExpression?: string;
  scheduledFor?: Date;
  isRecurring?: boolean;
  dependsOn?: string[];
  tools?: string[];
  toolConstraintType?: "hard" | "soft" | "none";
  toolInstructions?: string;
  priority?: number;
  /** Max execution time in milliseconds for workflow tasks */
  timeoutMs?: number;
  createdBy: string;
  createdByType: "user" | "agent";
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
  apiSpec?: {
    baseUrl: string;
    path: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | string;
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    bodyTemplate?: any;
    authType?: "none" | "bearer" | "api-key" | "basic" | "oauth2" | string;
    authKeyName?: string;
    oauthProviderKey?: string;
    oauthScopes?: string[];
    oauthTokenLocation?: "header" | "query" | "body";
    oauthTokenKey?: string;
    oauthTokenPrefix?: string;
  };
  category?: string;
  icon?: string;
  inputSchema?: any;
  outputSchema?: any;
  owner?: string;
  ownerType?: "user" | "agent";
  visibility?: "private" | "public" | "platform";
  tags?: string[];
  version?: string;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
}

// ─── Tool Key ─────────────────────────────────────────────────────────────────

export interface ToolKey {
  keyId: string;
  toolId?: string;
  ownerId: string;
  ownerType: "user" | "agent";
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
  ownerType: "user" | "agent";
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
  subjectType: "user" | "agent";
  permission: "read" | "execute" | "admin";
  grantedBy?: string;
  createdAt: string;
  expiresAt?: string;
}

// ─── A2A Protocol ─────────────────────────────────────────────────────────────

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export interface A2ATextPart {
  type: "text";
  text: string;
  metadata?: Record<string, any>;
}
export interface A2ADataPart {
  type: "data";
  data: Record<string, any>;
  metadata?: Record<string, any>;
}
export interface A2AFilePart {
  type: "file";
  file: { name?: string; mimeType?: string; bytes?: string; uri?: string };
  metadata?: Record<string, any>;
}
export type A2AMessagePart = A2ATextPart | A2ADataPart | A2AFilePart;

export interface A2AMessage {
  role: "user" | "agent";
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

export type McpConnectionType = "stdio" | "sse" | "http" | "streamable-http";

export interface McpServer {
  serverId: string;
  name: string;
  description?: string;
  connectionType: McpConnectionType;
  connectionConfig: Record<string, any>;
  status: "connected" | "disconnected" | "error";
  toolsCount: number;
  capabilities?: Record<string, any>;
  isPublic: boolean;
  ownerId: string;
  ownerType: "user" | "agent";
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
  /** Defaults to the unified Commons API platform. */
  baseUrl?: string;
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
  ownerType?: "platform" | "user" | "agent";
  isPublic?: boolean;
  tags?: string[];
  icon?: string;
  source?: string;
  sourceUrl?: string;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export type MemoryType = "episodic" | "semantic" | "procedural";
export type MemorySourceType = "auto" | "manual";

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

export interface SharedMemoryScope {
  scopeId: string;
  name: string;
  description?: string | null;
  access?: "read" | "write" | "admin";
  updatedAt: string;
}

export interface CreateSharedMemoryScopeParams {
  name: string;
  description?: string;
  agentIds: string[];
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

// ─── Credits ─────────────────────────────────────────────────────────────────

export type CreditDirection =
  | "grant"
  | "debit"
  | "adjustment"
  | "refund"
  | "expiration";

export type CreditPlatform =
  | "agent_commons"
  | "commonlab"
  | "common_os"
  | "system";

export interface CreditLedgerEntry {
  entryId: string;
  principalId: string;
  principalType: "user" | "agent" | "service";
  workspaceId?: string | null;
  amount: number;
  currency: "credits";
  direction: CreditDirection;
  eventType: string;
  sourcePlatform: CreditPlatform;
  idempotencyKey: string;
  description?: string | null;
  relatedCourseId?: string | null;
  relatedChallengeId?: string | null;
  agentId?: string | null;
  sessionId?: string | null;
  taskId?: string | null;
  workflowId?: string | null;
  usageEventId?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  createdByType?: string | null;
  expiresAt?: string | null;
  voidedAt?: string | null;
  createdAt: string;
}

export interface CreditBalance {
  principalId: string;
  workspaceId?: string | null;
  balance: number;
  currency: "credits";
}

export interface CreditWriteParams {
  principalId: string;
  principalType?: "user" | "agent" | "service";
  workspaceId?: string | null;
  amount: number;
  eventType: string;
  sourcePlatform: CreditPlatform;
  idempotencyKey: string;
  description?: string;
  relatedCourseId?: string;
  relatedChallengeId?: string;
  agentId?: string;
  sessionId?: string;
  taskId?: string;
  workflowId?: string;
  usageEventId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export type PlanKey = "free" | "plus" | "pro" | "max";

export type ComputeProfile = "starter" | "standard" | "performance" | "gpu";

export type ModelTier = "frontier" | "standard" | "fast" | "local";

export interface PlanEntitlements {
  computerUse: boolean;
  allowedProfiles: ComputeProfile[];
  maxConcurrentComputers: number;
  modelTiers: ModelTier[];
  maxConcurrentRuns: number;
}

export interface SubscriptionInfo {
  planKey: PlanKey;
  planName: string;
  monthlyCredits: number;
  entitlements: PlanEntitlements;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// ─── Feature flags ──────────────────────────────────────────────────────────

export interface FlagEvaluation {
  key: string;
  enabled: boolean;
  variant: string | null;
  payload?: unknown;
}

// ─── Wallet ───────────────────────────────────────────────────────────────────

export type WalletType = "eoa" | "erc4337" | "external";

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

export type ApiKeyPrincipalType = "user" | "agent";

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
