type ModelProvider = "openai" | "anthropic" | "google" | "mistral" | "groq" | "ollama" | "openrouter" | "xai" | "custom";
interface ModelConfig {
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
type AgentRuntimeType = "native" | "openclaw" | "hermes" | "custom";
type AgentRuntimeStatus = "disabled" | "provisioning" | "starting" | "ready" | "degraded" | "stopped" | "failed";
interface AgentRuntimeConfig {
    deploymentMode?: "managed" | "external";
    channelPolicy?: "pairing" | "allowlist" | "open" | "disabled";
    enabledPlugins?: string[];
    enabledToolsets?: string[];
    memoryMode?: "native" | "platform" | "hybrid";
    metadata?: Record<string, string | number | boolean>;
}
interface AgentRuntime {
    runtimeType: AgentRuntimeType;
    version?: string | null;
    status: AgentRuntimeStatus;
    config: AgentRuntimeConfig;
    capabilities: Record<string, boolean>;
    updatedAt?: string | null;
    managed: boolean;
    computer?: AgentComputer | null;
}
interface Agent {
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
    isDefault?: boolean;
    isSystemManaged?: boolean;
    copilotAccessMode?: "full" | "scoped" | "confirm" | null;
    copilotScopes?: string[];
    runtimeType?: AgentRuntimeType;
    runtimeVersion?: string | null;
    runtimeStatus?: AgentRuntimeStatus;
    runtimeConfig?: AgentRuntimeConfig;
    runtimeCapabilities?: Record<string, boolean>;
}
interface CopilotChange {
    changeId: string;
    agentId: string;
    ownerUserId: string;
    scope: string;
    resourceType: string;
    resourceId?: string | null;
    action: "create" | "update" | "delete";
    status: "pending" | "applied" | "rejected" | "reverted";
    title: string;
    description?: string | null;
    before?: unknown;
    after?: unknown;
    diff?: unknown;
    createdAt: string;
    reviewedAt?: string | null;
    appliedAt?: string | null;
}
/** Agent computers are durable. Runtime pods may be replaced, but this identity persists. */
type AgentComputerLifecycle = "persistent";
type ComputerPersistence = AgentComputerLifecycle;
type ComputerLifecycle = AgentComputerLifecycle;
type ComputerResourceProfile = "starter" | "standard" | "performance" | "gpu";
type ComputerResourceMode = "fixed" | "elastic";
type AgentComputerResourceProfile = ComputerResourceProfile;
type AgentComputerResourceMode = ComputerResourceMode;
/**
 * Common accelerator names. Providers may expose additional values without
 * requiring an SDK release, so string extensions remain valid.
 */
type ComputerGpuType = "nvidia-t4" | "nvidia-l4" | "nvidia-a10" | "nvidia-a100" | "nvidia-h100" | "nvidia-h200" | "nvidia-b200" | (string & {});
interface ComputerGpu {
    count: number;
    type?: ComputerGpuType;
}
type AgentComputerGpuType = ComputerGpuType;
type AgentComputerGpu = ComputerGpu;
/** Public, provider-neutral resource units. */
interface ComputerResources {
    vcpu: number;
    memoryGiB: number;
    storageGiB: number;
    gpu?: ComputerGpu | null;
}
type AgentComputerResources = ComputerResources;
interface ComputerResourceUpdate {
    vcpu?: number;
    memoryGiB?: number;
    storageGiB?: number;
    gpu?: ComputerGpu | null;
}
type AgentComputerDesiredState = "running" | "sleeping" | "disabled";
type AgentComputerStatus = "disabled" | "provisioning" | "starting" | "running" | "idle" | "sleeping" | "resizing" | "restarting" | "stopping" | "error" | "unavailable" | "stopped" | "terminated" | "failed";
type ComputerNetworkAccess = "standard" | "restricted" | "disabled" | (string & {});
/**
 * Mutable computer settings only. Server-owned identity, provider, billing,
 * timestamps, and runtime fields intentionally cannot be submitted here.
 */
interface ComputerConfigUpdate {
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
interface AgentComputerConfig {
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
interface AgentComputerBrowser {
    status?: "off" | "starting" | "on" | "error";
    url?: string | null;
    title?: string | null;
    screenshot?: string | null;
    lastAction?: string | null;
    error?: string | null;
    updatedAt?: string | null;
}
interface AgentComputerTerminal {
    lastCommand?: string | null;
    lastExitCode?: number | null;
    lastOutput?: string | null;
    updatedAt?: string | null;
}
/** The one persistent cloud computer assigned to an agent. */
interface AgentComputer {
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
interface AgentComputerInstance {
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
interface ComputerActionParams {
    reason?: string;
}
interface ComputerResizeParams {
    resourceProfile?: ComputerResourceProfile;
    resourceMode?: ComputerResourceMode;
    resources?: ComputerResourceUpdate;
}
interface ComputerCommandParams {
    command: string;
    cwd?: string;
    timeoutSeconds?: number;
}
interface ComputerFile {
    path: string;
    content: string;
}
interface ComputerBrowserOpenParams {
    url: string;
}
interface AgentComputerEvent {
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
interface CreateAgentParams {
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
interface Session {
    sessionId: string;
    agentId: string;
    initiator: string;
    title?: string;
    model: ModelConfig & {
        name?: string;
    };
    createdAt: string;
    /** 'cli' | 'web' — origin of the session, used for filtering in the UI */
    source?: "cli" | "web";
    /** Same as source; returned from the backend column `initiator_type` */
    initiatorType?: "cli" | "web";
}
interface RunParams {
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
    attachments?: Array<{
        fileId: string;
    }>;
    /** Extra text injected into the agent's system prompt. Used by the CLI to deliver the local tools manifest. */
    cliContext?: string;
    /** Caller-owned function catalog executed through cli_tool_request events. */
    cliTools?: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
}
interface ChatMessage {
    role: "user" | "assistant" | "system" | "tool";
    content: string | Array<{
        type: "text";
        text: string;
    } | {
        type: "image_url";
        image_url: {
            url: string;
        };
    } | Record<string, any>>;
    tool_call_id?: string;
    name?: string;
}
type StreamEventType = "token" | "tool" | "toolProgress" | "toolStart" | "toolEnd" | "agent_step" | "run_started" | "final" | "completed" | "failed" | "cancelled" | "status" | "keepalive" | "cli_tool_request" | "error";
interface StreamEvent {
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
interface Workflow {
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
interface WorkflowDefinition {
    startNodeId?: string;
    endNodeId?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    outputMapping?: Record<string, string>;
}
type WorkflowNodeType = "tool" | "input" | "output" | "condition" | "transform" | "loop" | "agent_processor" | "workflow" | "human_approval";
interface WorkflowNode {
    id: string;
    type: WorkflowNodeType | string;
    toolId?: string;
    toolName?: string;
    agentId?: string;
    agentAvatar?: string;
    workflowId?: string;
    label?: string;
    position?: {
        x: number;
        y: number;
    };
    config?: Record<string, any>;
}
interface WorkflowEdge {
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
interface WorkflowExecution {
    executionId: string;
    workflowId: string;
    status: "running" | "completed" | "failed" | "cancelled" | "awaiting_approval";
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
interface Task {
    taskId: string;
    agentId: string;
    sessionId: string;
    title: string;
    description?: string;
    status: "pending" | "started" | "running" | "completed" | "failed" | "cancelled";
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
interface CreateTaskParams {
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
interface Tool {
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
interface CreateToolParams {
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
interface ToolKey {
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
interface CreateToolKeyParams {
    toolId?: string;
    ownerId: string;
    ownerType: "user" | "agent";
    keyName: string;
    value: string;
    displayName?: string;
    description?: string;
    keyType?: string;
}
interface ToolPermission {
    id: string;
    toolId: string;
    subjectId: string;
    subjectType: "user" | "agent";
    permission: "read" | "execute" | "admin";
    grantedBy?: string;
    createdAt: string;
    expiresAt?: string;
}
type A2ATaskState = "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";
interface A2ATextPart {
    type: "text";
    text: string;
    metadata?: Record<string, any>;
}
interface A2ADataPart {
    type: "data";
    data: Record<string, any>;
    metadata?: Record<string, any>;
}
interface A2AFilePart {
    type: "file";
    file: {
        name?: string;
        mimeType?: string;
        bytes?: string;
        uri?: string;
    };
    metadata?: Record<string, any>;
}
type A2AMessagePart = A2ATextPart | A2ADataPart | A2AFilePart;
interface A2AMessage {
    role: "user" | "agent";
    parts: A2AMessagePart[];
    contextId?: string;
    messageId?: string;
    taskId?: string;
    metadata?: Record<string, any>;
}
interface A2AArtifact {
    artifactId?: string;
    name?: string;
    description?: string;
    parts: A2AMessagePart[];
    index?: number;
    metadata?: Record<string, any>;
}
interface A2ATask {
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
interface A2ASkill {
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    examples?: string[];
    inputModes?: string[];
    outputModes?: string[];
}
interface AgentCard {
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
interface A2ASendTaskParams {
    id?: string;
    message: A2AMessage;
    pushNotification?: {
        url: string;
        token?: string;
    };
}
type McpConnectionType = "stdio" | "sse" | "http" | "streamable-http";
interface McpServer {
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
interface McpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
interface McpPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}
interface CommonsClientConfig {
    /** Defaults to the unified Commons API platform. */
    baseUrl?: string;
    apiKey?: string;
    initiator?: string;
    /** Fetch implementation — defaults to global fetch */
    fetch?: typeof fetch;
}
interface Skill {
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
interface SkillIndex {
    skillId: string;
    slug: string;
    name: string;
    description: string;
    tags: string[];
    icon?: string | null;
    triggers: string[];
}
interface CreateSkillParams {
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
type MemoryType = "episodic" | "semantic" | "procedural";
type MemorySourceType = "auto" | "manual";
interface AgentMemory {
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
interface MemoryStats {
    total: number;
    episodic: number;
    semantic: number;
    procedural: number;
    avgImportance: number;
}
interface CreateMemoryParams {
    agentId: string;
    sessionId?: string;
    memoryType?: MemoryType;
    content: string;
    summary: string;
    importanceScore?: number;
    tags?: string[];
}
interface UpdateMemoryParams {
    content?: string;
    summary?: string;
    importanceScore?: number;
    tags?: string[];
    isActive?: boolean;
    memoryType?: MemoryType;
}
interface SharedMemoryScope {
    scopeId: string;
    name: string;
    description?: string | null;
    access?: "read" | "write" | "admin";
    updatedAt: string;
}
interface CreateSharedMemoryScopeParams {
    name: string;
    description?: string;
    agentIds: string[];
}
interface UsageEvent {
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
interface UsageAggregation {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostUsd: number;
    callCount: number;
    events: UsageEvent[];
}
type CreditDirection = "grant" | "debit" | "adjustment" | "refund" | "expiration";
type CreditPlatform = "agent_commons" | "commonlab" | "common_os" | "system";
interface CreditLedgerEntry {
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
interface CreditBalance {
    principalId: string;
    workspaceId?: string | null;
    balance: number;
    currency: "credits";
}
interface CreditWriteParams {
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
type PlanKey = "free" | "plus" | "pro" | "max";
type ComputeProfile = "starter" | "standard" | "performance" | "gpu";
type ModelTier = "frontier" | "standard" | "fast" | "local";
interface PlanEntitlements {
    computerUse: boolean;
    allowedProfiles: ComputeProfile[];
    maxConcurrentComputers: number;
    modelTiers: ModelTier[];
    maxConcurrentRuns: number;
}
interface SubscriptionInfo {
    planKey: PlanKey;
    planName: string;
    monthlyCredits: number;
    entitlements: PlanEntitlements;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}
interface FlagEvaluation {
    key: string;
    enabled: boolean;
    variant: string | null;
    payload?: unknown;
}
type WalletType = "eoa" | "erc4337" | "external";
interface AgentWallet {
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
interface WalletBalance {
    address: string;
    chainId: string;
    native: string;
    usdc: string;
}
interface CreateWalletParams {
    agentId: string;
    walletType?: WalletType;
    label?: string;
    /** For 'external' wallets: the owner-provided address */
    externalAddress?: string;
    chainId?: string;
}
type ApiKeyPrincipalType = "user" | "agent";
interface ApiKey {
    id: string;
    label?: string | null;
    principalId: string;
    principalType: ApiKeyPrincipalType;
    active: boolean;
    createdAt: string;
    lastUsedAt?: string | null;
}
interface CreateApiKeyParams {
    principalId: string;
    principalType: ApiKeyPrincipalType;
    label?: string;
}
/** Returned only on creation — the plaintext key is never available again. */
interface CreatedApiKey extends ApiKey {
    key: string;
}

declare class CommonsClient {
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly initiator?;
    private readonly _fetch;
    constructor(config: CommonsClientConfig);
    private headers;
    private request;
    get models(): {
        /** List all available LLM models from the registry */
        list: () => Promise<{
            data: any[];
            grouped: Record<string, any[]>;
        }>;
    };
    get agents(): {
        create: (params: CreateAgentParams) => Promise<{
            data: Agent;
        }>;
        list: (owner?: string) => Promise<{
            data: Agent[];
        }>;
        get: (agentId: string) => Promise<{
            data: Agent;
        }>;
        update: (agentId: string, params: Partial<CreateAgentParams>) => Promise<{
            data: Agent;
        }>;
        getRuntime: (agentId: string) => Promise<{
            data: AgentRuntime;
        }>;
        configureRuntime: (agentId: string, params: {
            runtimeType?: AgentRuntimeType;
            version?: string | null;
            config?: AgentRuntimeConfig;
            deploy?: boolean;
        }) => Promise<{
            data: AgentRuntime;
        }>;
        deployRuntime: (agentId: string) => Promise<{
            data: AgentRuntime;
        }>;
        sleepRuntime: (agentId: string) => Promise<{
            data: AgentRuntime;
        }>;
        restartRuntime: (agentId: string) => Promise<{
            data: AgentRuntime;
        }>;
        /** List tools assigned to an agent. */
        listTools: (agentId: string) => Promise<{
            data: any[];
        }>;
        /** Assign a tool to an agent. */
        addTool: (agentId: string, params: {
            toolId: string;
            usageComments?: string;
        }) => Promise<{
            data: any;
        }>;
        /** Remove a tool assignment from an agent. */
        removeTool: (assignmentId: string) => Promise<void>;
        /** Create a liaison agent for an external agent. */
        createLiaison: (params: Record<string, any>) => Promise<any>;
        /**
         * Stream an agent run. Returns an async generator of StreamEvents.
         * Works in Node.js, browsers, and Edge runtimes.
         *
         * @example
         * for await (const event of client.agents.stream({ agentId, messages })) {
         *   if (event.type === 'token') process.stdout.write(event.content ?? '');
         * }
         */
        stream: (params: RunParams) => AsyncGenerator<StreamEvent>;
        /** Get the current heartbeat status for an agent. */
        getAutonomy: (agentId: string) => Promise<{
            data: {
                enabled: boolean;
                intervalSec: number;
                isArmed: boolean;
                lastBeatAt: string | null;
                nextBeatAt: string | null;
            };
        }>;
        /** Enable or disable the heartbeat, optionally setting the interval. */
        setAutonomy: (agentId: string, params: {
            enabled: boolean;
            intervalSec?: number;
        }) => Promise<{
            data: {
                enabled: boolean;
                intervalSec: number;
                isArmed: boolean;
            };
        }>;
        /** Trigger a single heartbeat immediately. */
        triggerHeartbeat: (agentId: string) => Promise<{
            message: string;
        }>;
        /**
         * Manually trigger an agent (fire-and-forget).
         * Requires autonomy to be enabled on the agent.
         */
        trigger: (agentId: string) => Promise<{
            message: string;
        }>;
        /** Get the knowledgebase entries for an agent. */
        getKnowledgebase: (agentId: string) => Promise<{
            data: any[];
        }>;
        /** Replace the knowledgebase entries for an agent. */
        updateKnowledgebase: (agentId: string, knowledgebase: any[]) => Promise<{
            data: any[];
        }>;
        /** List agents that this agent prefers to collaborate with. */
        getPreferredConnections: (agentId: string) => Promise<{
            data: any[];
        }>;
        /** Add a preferred agent connection. */
        addPreferredConnection: (agentId: string, params: {
            preferredAgentId: string;
            usageComments?: string;
        }) => Promise<{
            data: any;
        }>;
        /** Remove a preferred agent connection by its record ID. */
        removePreferredConnection: (id: string) => Promise<{
            success: boolean;
        }>;
        getComputerConfig: (agentId: string) => Promise<{
            data: AgentComputerConfig;
        }>;
        updateComputerConfig: (agentId: string, params: ComputerConfigUpdate) => Promise<{
            data: AgentComputerConfig;
        }>;
        /** Get the agent's one persistent cloud computer. */
        getComputer: (agentId: string, _legacyComputerId?: string) => Promise<{
            data: AgentComputer | null;
        }>;
        /** Wake the agent's persistent cloud computer, provisioning it if needed. */
        wakeComputer: (agentId: string, params?: ComputerActionParams) => Promise<{
            data: AgentComputer;
        }>;
        /** Sleep the runtime while preserving the computer's durable workspace. */
        sleepComputer: (agentId: string, params?: ComputerActionParams) => Promise<{
            data: AgentComputer;
        }>;
        /** Replace the runtime without replacing the persistent computer. */
        restartComputer: (agentId: string, params?: ComputerActionParams) => Promise<{
            data: AgentComputer;
        }>;
        resizeComputer: (agentId: string, params: ComputerResizeParams) => Promise<{
            data: AgentComputer;
        }>;
        execComputer: (agentId: string, params: ComputerCommandParams) => Promise<{
            data: any;
        }>;
        readComputerFile: (agentId: string, pathOrLegacyComputerId: string, legacyPath?: string) => Promise<{
            data: ComputerFile;
        }>;
        openComputerBrowser: (agentId: string, paramsOrLegacyComputerId: ComputerBrowserOpenParams | string, legacyParams?: ComputerBrowserOpenParams) => Promise<{
            data: any;
        }>;
        listComputerEvents: (agentId: string, limitOrLegacyComputerId?: number | string, legacyLimit?: number) => Promise<{
            data: AgentComputerEvent[];
        }>;
        /** @deprecated Use getComputer. The singleton is returned as a one-item list. */
        listComputers: (agentId: string, _filter?: {
            sessionId?: string;
            includeTerminated?: boolean;
        }) => Promise<{
            data: AgentComputerInstance[];
        }>;
        /** @deprecated Use wakeComputer. Lifecycle, name, and session are ignored. */
        startComputer: (agentId: string, params?: {
            sessionId?: string;
            lifecycle?: "persistent" | "ephemeral";
            name?: string;
            reason?: string;
        }) => Promise<{
            data: AgentComputerInstance;
        }>;
        /** @deprecated Use getComputer. Computer IDs are ignored. */
        refreshComputer: (agentId: string, _computerId?: string) => Promise<{
            data: AgentComputerInstance;
        }>;
        /** @deprecated Use sleepComputer. Computer IDs are ignored. */
        stopComputer: (agentId: string, _computerId?: string) => Promise<{
            data: AgentComputerInstance;
        }>;
        /** @deprecated Use execComputer. Computer IDs are ignored. */
        runComputerCommand: (agentId: string, paramsOrLegacyComputerId: ComputerCommandParams | string, legacyParams?: ComputerCommandParams) => Promise<{
            data: any;
        }>;
        /**
         * List available TTS voices for a provider.
         * @param provider - 'openai' (default) or 'elevenlabs'
         * @param q - optional search query to filter voices
         */
        listVoices: (provider?: "openai" | "elevenlabs", q?: string) => Promise<{
            data: any[];
        }>;
    };
    get copilot(): {
        get: () => Promise<{
            data: Agent | null;
        }>;
        updateSettings: (params: {
            accessMode: "full" | "scoped" | "confirm";
            scopes?: string[];
        }) => Promise<{
            data: Agent;
        }>;
        listChanges: (filter?: {
            status?: string;
            resourceType?: string;
            resourceId?: string;
        }) => Promise<{
            data: CopilotChange[];
        }>;
        acceptChange: (changeId: string) => Promise<{
            data: CopilotChange;
        }>;
        rejectChange: (changeId: string) => Promise<{
            data: CopilotChange;
        }>;
        revertChange: (changeId: string) => Promise<{
            data: CopilotChange;
        }>;
    };
    get run(): {
        once: (params: RunParams) => Promise<any>;
    };
    get workflows(): {
        create: (params: {
            name: string;
            description?: string;
            definition: any;
            ownerId: string;
            ownerType: "user" | "agent";
            isPublic?: boolean;
            category?: string;
            tags?: string[];
        }) => Promise<Workflow>;
        list: (ownerId: string, ownerType: "user" | "agent") => Promise<Workflow[]>;
        get: (workflowId: string) => Promise<Workflow>;
        update: (workflowId: string, updates: Partial<Workflow>) => Promise<Workflow>;
        delete: (workflowId: string) => Promise<{
            success: boolean;
        }>;
        execute: (workflowId: string, params: {
            agentId?: string;
            sessionId?: string;
            inputData?: Record<string, any>;
            userId?: string;
        }) => Promise<WorkflowExecution>;
        getExecution: (workflowId: string, executionId: string) => Promise<WorkflowExecution>;
        listExecutions: (workflowId: string, limit?: number) => Promise<WorkflowExecution[]>;
        cancelExecution: (workflowId: string, executionId: string) => Promise<{
            success: boolean;
        }>;
        /** Approve a paused human_approval node and resume execution. */
        approveExecution: (workflowId: string, executionId: string, params: {
            approvalToken: string;
            approvalData?: Record<string, any>;
        }) => Promise<{
            success: boolean;
            executionId: string;
            action: string;
        }>;
        /** Reject a paused human_approval node and terminate execution. */
        rejectExecution: (workflowId: string, executionId: string, params: {
            approvalToken: string;
            reason?: string;
        }) => Promise<{
            success: boolean;
            executionId: string;
            action: string;
        }>;
        /** Stream execution progress via SSE. Returns an async generator. */
        stream: (workflowId: string, executionId: string) => AsyncGenerator<StreamEvent>;
    };
    get tasks(): {
        create: (params: CreateTaskParams) => Promise<{
            data: Task;
        }>;
        list: (filter: {
            sessionId?: string;
            agentId?: string;
            ownerId?: string;
            ownerType?: "user" | "agent";
        }) => Promise<{
            data: Task[];
        }>;
        get: (taskId: string) => Promise<{
            data: Task;
        }>;
        execute: (taskId: string) => Promise<{
            success: boolean;
            data: any;
        }>;
        cancel: (taskId: string) => Promise<{
            success: boolean;
        }>;
        delete: (taskId: string) => Promise<{
            success: boolean;
        }>;
        /** Edit human-facing task details (title/description/priority). */
        update: (taskId: string, params: {
            title?: string;
            description?: string;
            priority?: number;
        }) => Promise<{
            data: Task;
        }>;
        /** Reschedule a task's upcoming run and/or resize its estimated duration. */
        reschedule: (taskId: string, params: {
            scheduledFor?: Date;
            estimatedDuration?: number;
        }) => Promise<{
            data: Task;
            rescheduledRun: {
                runId: string;
                created: boolean;
            } | null;
        }>;
        /** Stream task status updates via SSE. Returns an async generator. */
        stream: (taskId: string) => AsyncGenerator<StreamEvent>;
    };
    get sessions(): {
        list: (agentId: string, initiatorId: string) => Promise<{
            data: Session[];
        }>;
        /** List all sessions for a given agent (all initiators). */
        listByAgent: (agentId: string) => Promise<{
            data: Session[];
        }>;
        /** List all sessions for a user across all agents. */
        listByUser: (initiator: string) => Promise<{
            data: Session[];
        }>;
        create: (params: {
            agentId: string;
            initiator: string;
            title?: string;
            model?: Record<string, any>;
            /** 'cli' | 'web' — marks the origin of this session for filtering in the UI */
            source?: "cli" | "web";
        }) => Promise<{
            data: Session;
        }>;
        get: (sessionId: string) => Promise<{
            data: Session;
        }>;
        /** Get full session with history, tasks, childSessions, and spaces. */
        getFull: (sessionId: string) => Promise<{
            data: any;
        }>;
    };
    get tools(): {
        list: (filter?: {
            agentId?: string;
            owner?: string;
            ownerType?: string;
            visibility?: string;
        }) => Promise<{
            data: Tool[];
        }>;
        get: (toolId: string) => Promise<{
            data: Tool;
        }>;
        create: (params: CreateToolParams) => Promise<{
            data: Tool;
        }>;
        update: (toolId: string, params: Partial<CreateToolParams>) => Promise<{
            data: Tool;
        }>;
        delete: (toolId: string) => Promise<{
            success: boolean;
        }>;
        /** List built-in static tools available to all agents. */
        listStatic: () => Promise<{
            data: Tool[];
        }>;
    };
    get oauth(): {
        /** List OAuth providers available on the platform (Google Workspace, GitHub, …). */
        listProviders: () => Promise<{
            providers: any[];
        }>;
        /** Get one provider's details, including its scope groups. */
        getProvider: (providerKey: string) => Promise<{
            provider: any;
        }>;
        /**
         * List the caller's OAuth connections (the accounts agents act with).
         * `ownerId` is only needed when authenticating with a management key.
         */
        listConnections: (params?: {
            ownerId?: string;
            ownerType?: "user" | "agent";
        }) => Promise<{
            connections: any[];
        }>;
        /**
         * Start an OAuth connect flow. Returns the authorization URL the user
         * must open in a browser to grant access.
         */
        connect: (params: {
            providerKey: string;
            scopes?: string[];
            redirectUri?: string;
        }) => Promise<{
            authorizationUrl: string;
            state: string;
            expiresAt: string;
        }>;
        /** Refresh a connection's access token now. */
        refresh: (connectionId: string) => Promise<{
            success: boolean;
        }>;
        /** Check whether a connection's token is valid. */
        test: (connectionId: string) => Promise<{
            success: boolean;
            status: string;
            accessTokenValid: boolean;
            providerUserEmail?: string;
            error?: string;
        }>;
        /** Revoke a connection and delete its tokens. */
        revoke: (connectionId: string) => Promise<{
            success: boolean;
        }>;
    };
    get toolKeys(): {
        list: (filter: {
            ownerId?: string;
            ownerType?: string;
            toolId?: string;
        }) => Promise<{
            success: boolean;
            data: ToolKey[];
        }>;
        create: (params: CreateToolKeyParams) => Promise<{
            success: boolean;
            data: ToolKey;
        }>;
        delete: (keyId: string) => Promise<{
            success: boolean;
        }>;
    };
    get toolPermissions(): {
        list: (toolId?: string) => Promise<{
            success: boolean;
            data: ToolPermission[];
        }>;
        grant: (params: {
            toolId: string;
            subjectId: string;
            subjectType: "user" | "agent";
            permission: "read" | "execute" | "admin";
            grantedBy?: string;
        }) => Promise<{
            success: boolean;
            data: ToolPermission;
        }>;
        revoke: (permissionId: string) => Promise<{
            success: boolean;
        }>;
    };
    get skills(): {
        list: (filter?: {
            ownerId?: string;
            ownerType?: string;
            isPublic?: boolean;
        }) => Promise<{
            data: Skill[];
        }>;
        get: (skillIdOrSlug: string) => Promise<{
            data: Skill;
        }>;
        getIndex: (ownerId?: string) => Promise<{
            data: SkillIndex[];
        }>;
        create: (params: CreateSkillParams) => Promise<{
            data: Skill;
        }>;
        update: (skillIdOrSlug: string, updates: Partial<CreateSkillParams>) => Promise<{
            data: Skill;
        }>;
        delete: (skillIdOrSlug: string) => Promise<{
            deleted: boolean;
        }>;
    };
    get wallets(): {
        /** List all wallets for an agent. */
        list: (agentId: string) => Promise<AgentWallet[]>;
        /** Get the primary active wallet for an agent. */
        primary: (agentId: string) => Promise<AgentWallet | null>;
        /** Get a specific wallet by ID. */
        get: (walletId: string) => Promise<AgentWallet>;
        /** Create a new wallet for an agent. */
        create: (params: CreateWalletParams) => Promise<AgentWallet>;
        /** Get USDC and native token balance for a wallet. */
        balance: (walletId: string) => Promise<WalletBalance>;
        /** Transfer USDC or ETH to another address. */
        transfer: (walletId: string, params: {
            toAddress: string;
            amount: string;
            tokenSymbol?: "USDC" | "ETH";
        }) => Promise<{
            txHash: string;
        }>;
        /**
         * Proxy an HTTP request through an agent's primary wallet, automatically
         * handling x402 payment challenges.  The wallet signs the payment and
         * retries once if the target responds with HTTP 402.
         */
        x402Fetch: (agentId: string, params: {
            url: string;
            method?: string;
            headers?: Record<string, string>;
            body?: string;
        }) => Promise<{
            status: number;
            body: unknown;
        }>;
        /** Deactivate a wallet. */
        deactivate: (walletId: string) => Promise<void>;
    };
    get auth(): {
        /**
         * GET /v1/auth/me
         *
         * Returns the principalId (wallet address / user ID) and principalType
         * that the current API key belongs to. Use this to auto-detect the
         * initiator without asking the user to type their address manually.
         */
        me: () => Promise<{
            principalId: string | null;
            principalType: string | null;
        }>;
    };
    get apiKeys(): {
        /**
         * Generate a new API key for a principal (user or agent).
         * The plaintext key is returned only in this response — never again.
         */
        create: (params: CreateApiKeyParams) => Promise<CreatedApiKey>;
        /** List all active API keys for a principal (key values not included). */
        list: (principalId: string, principalType: ApiKeyPrincipalType) => Promise<ApiKey[]>;
        /** Revoke (soft-delete) an API key by its UUID. */
        revoke: (id: string) => Promise<{
            revoked: boolean;
        }>;
    };
    private _streamAgentRun;
    private _streamSse;
    private _parseEventStream;
    get a2a(): {
        /** Fetch the A2A Agent Card for an agent. */
        getAgentCard: (agentId: string) => Promise<AgentCard>;
        /** Send a task to an agent (synchronous, waits for completion). */
        sendTask: (agentId: string, params: A2ASendTaskParams) => Promise<A2ATask>;
        /** Get A2A task status. */
        getTask: (agentId: string, taskId: string) => Promise<A2ATask>;
        /** Cancel a running A2A task. */
        cancelTask: (agentId: string, taskId: string) => Promise<A2ATask>;
        /** List recent A2A tasks for an agent. */
        listTasks: (agentId: string, limit?: number) => Promise<{
            tasks: A2ATask[];
            total: number;
        }>;
        /** Stream A2A task updates (SSE). */
        stream: (agentId: string, taskId: string) => AsyncGenerator<StreamEvent>;
    };
    get mcp(): {
        /** List MCP servers for an owner. */
        listServers: (ownerId: string, ownerType: "user" | "agent") => Promise<{
            servers: McpServer[];
            total: number;
        }>;
        /** Create a new MCP server. */
        createServer: (params: {
            name: string;
            description?: string;
            connectionType: McpConnectionType;
            connectionConfig: Record<string, any>;
            isPublic?: boolean;
            tags?: string[];
            ownerId: string;
            ownerType: "user" | "agent";
        }) => Promise<McpServer>;
        /** Get MCP server by ID. */
        getServer: (serverId: string) => Promise<McpServer>;
        /** Update an MCP server's configuration. */
        updateServer: (serverId: string, params: Partial<{
            name: string;
            description: string;
            connectionConfig: Record<string, any>;
            isPublic: boolean;
            tags: string[];
        }>) => Promise<McpServer>;
        /** Delete an MCP server. */
        deleteServer: (serverId: string) => Promise<void>;
        /** List public MCP servers (marketplace). */
        getMarketplace: () => Promise<{
            servers: McpServer[];
            total: number;
        }>;
        /** Get connection status for an MCP server. */
        getServerStatus: (serverId: string) => Promise<{
            connected: boolean;
            capabilities: string[];
            toolsDiscovered: number;
            lastConnectedAt: Date | null;
            lastError: string | null;
        }>;
        /** Connect to an MCP server. */
        connect: (serverId: string) => Promise<{
            connected: boolean;
        }>;
        /** Disconnect from an MCP server. */
        disconnect: (serverId: string) => Promise<void>;
        /** Sync tools + resources + prompts from the MCP server. */
        sync: (serverId: string) => Promise<{
            toolsDiscovered: number;
            resourcesDiscovered: number;
            promptsDiscovered: number;
        }>;
        /** List tools discovered from an MCP server. */
        listTools: (serverId: string) => Promise<{
            tools: any[];
            total: number;
        }>;
        /** List all MCP tools across all servers for a given owner. */
        listToolsByOwner: (ownerId: string, ownerType: "user" | "agent") => Promise<{
            tools: any[];
        }>;
        /** List resources from an MCP server. */
        listResources: (serverId: string) => Promise<{
            resources: McpResource[];
            total: number;
        }>;
        /** Read a resource by URI. */
        readResource: (serverId: string, uri: string) => Promise<{
            uri: string;
            contents: any;
        }>;
        /** List prompts from an MCP server. */
        listPrompts: (serverId: string) => Promise<{
            prompts: McpPrompt[];
            total: number;
        }>;
        /** Render a prompt with arguments. */
        getPrompt: (serverId: string, promptName: string, args?: Record<string, string>) => Promise<{
            description?: string;
            messages: any[];
        }>;
    };
    get memory(): {
        /** List all memories for an agent. */
        list: (agentId: string, opts?: {
            type?: MemoryType;
            limit?: number;
        }) => Promise<{
            data: AgentMemory[];
        }>;
        /** Get memory stats for an agent. */
        stats: (agentId: string) => Promise<{
            data: MemoryStats;
        }>;
        /** Retrieve memories most relevant to a query. */
        retrieve: (agentId: string, query: string, limit?: number) => Promise<{
            data: AgentMemory[];
        }>;
        /** Get a single memory by ID. */
        get: (memoryId: string) => Promise<{
            data: AgentMemory;
        }>;
        /** Manually create a memory. */
        create: (params: CreateMemoryParams) => Promise<{
            data: AgentMemory;
        }>;
        /** Update a memory. */
        update: (memoryId: string, params: UpdateMemoryParams) => Promise<{
            data: AgentMemory;
        }>;
        /** Soft-delete (deactivate) a memory. */
        delete: (memoryId: string) => Promise<void>;
        /** Create an append-only memory scope shared by a set of owned agents. */
        createSharedScope: (params: CreateSharedMemoryScopeParams) => Promise<{
            data: SharedMemoryScope;
        }>;
        /** List shared-memory scopes available to an agent. */
        listSharedScopes: (agentId: string) => Promise<{
            data: SharedMemoryScope[];
        }>;
    };
    get usage(): {
        /** Get aggregated token + cost usage for an agent. */
        getAgentUsage: (agentId: string, opts?: {
            from?: string;
            to?: string;
        }) => Promise<{
            data: UsageAggregation;
        }>;
        /** Get aggregated token + cost usage for a session. */
        getSessionUsage: (sessionId: string) => Promise<{
            data: UsageAggregation;
        }>;
    };
    get credits(): {
        balance: (filter?: {
            principalId?: string;
            workspaceId?: string;
        }) => Promise<{
            data: CreditBalance;
        }>;
        ledger: (filter?: {
            principalId?: string;
            workspaceId?: string;
            limit?: number;
        }) => Promise<{
            data: CreditLedgerEntry[];
        }>;
        grant: (params: CreditWriteParams) => Promise<{
            data: CreditLedgerEntry;
        }>;
        debit: (params: CreditWriteParams) => Promise<{
            data: CreditLedgerEntry;
        }>;
    };
    get billing(): {
        /** Current plan, status, and entitlements for the caller. */
        subscription: () => Promise<{
            data: SubscriptionInfo;
        }>;
        /** Entitlements only (what paid features the caller may use). */
        entitlements: () => Promise<{
            data: PlanEntitlements;
        }>;
        /** Create a Stripe Checkout session for a subscription plan. */
        subscribe: (planKey: "plus" | "pro" | "max") => Promise<{
            data: {
                url: string;
            };
        }>;
        /** Create a Stripe Checkout session for a one-time credit top-up. */
        topup: (packKey: string) => Promise<{
            data: {
                url: string;
            };
        }>;
        /** Open the Stripe billing portal. */
        portal: () => Promise<{
            data: {
                url: string;
            };
        }>;
    };
    get flags(): {
        /** Evaluate all active flags for the caller (call once at boot). */
        all: () => Promise<{
            data: Record<string, FlagEvaluation>;
        }>;
        /** Evaluate a single flag for the caller. */
        evaluate: (key: string) => Promise<{
            data: FlagEvaluation;
        }>;
    };
}
declare class CommonsError extends Error {
    readonly status: number;
    readonly data?: unknown | undefined;
    constructor(message: string, status: number, data?: unknown | undefined);
}

type WorkflowTemplateName = 'country-weather-brief' | 'agent-research-summary' | 'multi-agent-field-report' | 'workflow-invocation-smoke';
interface WorkflowTemplateContext {
    ownerId: string;
    prefix: string;
    agentId?: string;
    reviewerAgentId?: string;
    childWorkflowId?: string;
}
interface WorkflowTemplateTool {
    key: string;
    payload: CreateToolParams;
}
interface WorkflowTemplateBuild {
    name: string;
    description: string;
    tags: string[];
    category: string;
    tools: WorkflowTemplateTool[];
    buildDefinition: (toolIds: Record<string, string>, ctx: WorkflowTemplateContext) => WorkflowDefinition;
    sampleInput: Record<string, any>;
}
declare function listWorkflowTemplates(): readonly [{
    readonly name: "country-weather-brief";
    readonly description: "Tool-only workflow using countries.dev and Open-Meteo.";
}, {
    readonly name: "agent-research-summary";
    readonly description: "Multi-tool workflow with an agent_processor summarization step.";
}, {
    readonly name: "multi-agent-field-report";
    readonly description: "Multi-tool workflow with two agent_processor nodes.";
}, {
    readonly name: "workflow-invocation-smoke";
    readonly description: "Parent workflow that invokes another workflow as a workflow node.";
}];
declare function buildWorkflowTemplate(templateName: WorkflowTemplateName, ctx: WorkflowTemplateContext): WorkflowTemplateBuild;

export { type A2AArtifact, type A2ADataPart, type A2AFilePart, type A2AMessage, type A2AMessagePart, type A2ASendTaskParams, type A2ASkill, type A2ATask, type A2ATaskState, type A2ATextPart, type Agent, type AgentCard, type AgentComputer, type AgentComputerBrowser, type AgentComputerConfig, type AgentComputerDesiredState, type AgentComputerEvent, type AgentComputerGpu, type AgentComputerGpuType, type AgentComputerInstance, type AgentComputerLifecycle, type AgentComputerResourceMode, type AgentComputerResourceProfile, type AgentComputerResources, type AgentComputerStatus, type AgentComputerTerminal, type AgentMemory, type AgentWallet, type ApiKey, type ApiKeyPrincipalType, type ChatMessage, CommonsClient, type CommonsClientConfig, CommonsError, type ComputeProfile, type ComputerActionParams, type ComputerBrowserOpenParams, type ComputerCommandParams, type ComputerConfigUpdate, type ComputerFile, type ComputerGpu, type ComputerGpuType, type ComputerLifecycle, type ComputerNetworkAccess, type ComputerPersistence, type ComputerResizeParams, type ComputerResourceMode, type ComputerResourceProfile, type ComputerResourceUpdate, type ComputerResources, type CreateAgentParams, type CreateApiKeyParams, type CreateMemoryParams, type CreateSkillParams, type CreateTaskParams, type CreateToolKeyParams, type CreateToolParams, type CreateWalletParams, type CreatedApiKey, type FlagEvaluation, type McpConnectionType, type McpPrompt, type McpResource, type McpServer, type MemorySourceType, type MemoryStats, type MemoryType, type ModelConfig, type ModelProvider, type ModelTier, type PlanEntitlements, type PlanKey, type RunParams, type Session, type Skill, type SkillIndex, type StreamEvent, type StreamEventType, type SubscriptionInfo, type Task, type Tool, type ToolKey, type ToolPermission, type UpdateMemoryParams, type UsageAggregation, type UsageEvent, type WalletBalance, type WalletType, type Workflow, type WorkflowDefinition, type WorkflowEdge, type WorkflowExecution, type WorkflowNode, type WorkflowNodeType, type WorkflowTemplateBuild, type WorkflowTemplateContext, type WorkflowTemplateName, type WorkflowTemplateTool, buildWorkflowTemplate, listWorkflowTemplates };
