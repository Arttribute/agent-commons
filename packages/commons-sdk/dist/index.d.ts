type ModelProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'groq' | 'ollama';
interface ModelConfig {
    provider: ModelProvider;
    modelId: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
}
interface Agent {
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
interface CreateAgentParams {
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
interface Session {
    sessionId: string;
    agentId: string;
    initiator: string;
    title?: string;
    model: ModelConfig & {
        name?: string;
    };
    createdAt: string;
}
interface RunParams {
    agentId: string;
    messages: ChatMessage[];
    sessionId?: string;
}
interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_call_id?: string;
    name?: string;
}
type StreamEventType = 'token' | 'toolStart' | 'toolEnd' | 'agent_step' | 'final' | 'completed' | 'failed' | 'cancelled' | 'status' | 'heartbeat' | 'error';
interface StreamEvent {
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
interface Workflow {
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
interface WorkflowDefinition {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    outputMapping?: Record<string, string>;
}
type WorkflowNodeType = 'tool' | 'input' | 'output' | 'condition' | 'transform' | 'loop' | 'agent_processor' | 'human_approval';
interface WorkflowNode {
    id: string;
    type: WorkflowNodeType | string;
    toolId?: string;
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
}
interface WorkflowExecution {
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
interface Task {
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
interface CreateTaskParams {
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
    owner?: string;
    ownerType?: 'user' | 'agent';
    visibility?: 'private' | 'public' | 'platform';
    tags?: string[];
}
interface ToolKey {
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
interface CreateToolKeyParams {
    toolId?: string;
    ownerId: string;
    ownerType: 'user' | 'agent';
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
    subjectType: 'user' | 'agent';
    permission: 'read' | 'execute' | 'admin';
    grantedBy?: string;
    createdAt: string;
    expiresAt?: string;
}
type A2ATaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
interface A2ATextPart {
    type: 'text';
    text: string;
    metadata?: Record<string, any>;
}
interface A2ADataPart {
    type: 'data';
    data: Record<string, any>;
    metadata?: Record<string, any>;
}
interface A2AFilePart {
    type: 'file';
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
    role: 'user' | 'agent';
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
type McpConnectionType = 'stdio' | 'sse' | 'http' | 'streamable-http';
interface McpServer {
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
    baseUrl: string;
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
    ownerType?: 'platform' | 'user' | 'agent';
    isPublic?: boolean;
    tags?: string[];
    icon?: string;
    source?: string;
    sourceUrl?: string;
}
type MemoryType = 'episodic' | 'semantic' | 'procedural';
type MemorySourceType = 'auto' | 'manual';
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
type WalletType = 'eoa' | 'erc4337' | 'external';
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

declare class CommonsClient {
    private readonly baseUrl;
    private readonly apiKey?;
    private readonly initiator?;
    private readonly _fetch;
    constructor(config: CommonsClientConfig);
    private headers;
    private request;
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
        /** Stream task status updates via SSE. Returns an async generator. */
        stream: (taskId: string) => AsyncGenerator<StreamEvent>;
    };
    get sessions(): {
        list: (agentId: string, initiatorId: string) => Promise<{
            data: Session[];
        }>;
        create: (params: {
            agentId: string;
            initiator: string;
            title?: string;
            model?: Record<string, any>;
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
        /** Deactivate a wallet. */
        deactivate: (walletId: string) => Promise<void>;
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
        /** Delete an MCP server. */
        deleteServer: (serverId: string) => Promise<void>;
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
}
declare class CommonsError extends Error {
    readonly status: number;
    readonly data?: unknown | undefined;
    constructor(message: string, status: number, data?: unknown | undefined);
}

export { type A2AArtifact, type A2ADataPart, type A2AFilePart, type A2AMessage, type A2AMessagePart, type A2ASendTaskParams, type A2ASkill, type A2ATask, type A2ATaskState, type A2ATextPart, type Agent, type AgentCard, type AgentMemory, type AgentWallet, type ChatMessage, CommonsClient, type CommonsClientConfig, CommonsError, type CreateAgentParams, type CreateMemoryParams, type CreateSkillParams, type CreateTaskParams, type CreateToolKeyParams, type CreateToolParams, type CreateWalletParams, type McpConnectionType, type McpPrompt, type McpResource, type McpServer, type MemorySourceType, type MemoryStats, type MemoryType, type ModelConfig, type ModelProvider, type RunParams, type Session, type Skill, type SkillIndex, type StreamEvent, type StreamEventType, type Task, type Tool, type ToolKey, type ToolPermission, type UpdateMemoryParams, type UsageAggregation, type UsageEvent, type WalletBalance, type WalletType, type Workflow, type WorkflowDefinition, type WorkflowEdge, type WorkflowExecution, type WorkflowNode, type WorkflowNodeType };
