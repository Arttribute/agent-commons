import {
  Agent, CreateAgentParams,
  RunParams, StreamEvent,
  Workflow, WorkflowExecution,
  Task, CreateTaskParams,
  Tool, CreateToolParams,
  ToolKey, CreateToolKeyParams,
  ToolPermission,
  CommonsClientConfig,
  AgentCard, A2ATask, A2ASendTaskParams,
  McpServer, McpResource, McpPrompt, McpConnectionType,
  Skill, SkillIndex, CreateSkillParams,
  UsageAggregation,
  AgentMemory, MemoryStats, MemoryType,
  CreateMemoryParams, UpdateMemoryParams,
  AgentWallet, WalletBalance, CreateWalletParams,
  ApiKey, CreatedApiKey, CreateApiKeyParams, ApiKeyPrincipalType,
} from './types';

export class CommonsClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly initiator?: string;
  private readonly _fetch: typeof fetch;

  constructor(config: CommonsClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.initiator = config.initiator;
    this._fetch = config.fetch ?? fetch;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    if (this.initiator) h['x-initiator'] = this.initiator;
    return { ...h, ...extra };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }
    return res.json() as Promise<T>;
  }

  // ── Models ────────────────────────────────────────────────────────────────

  get models() {
    return {
      /** List all available LLM models from the registry */
      list: (): Promise<{ data: any[]; grouped: Record<string, any[]> }> =>
        this.request('GET', '/v1/models'),
    };
  }

  // ── Agents ────────────────────────────────────────────────────────────────

  get agents() {
    return {
      create: (params: CreateAgentParams): Promise<{ data: Agent }> =>
        this.request('POST', '/v1/agents', params),

      list: (owner?: string): Promise<{ data: Agent[] }> =>
        this.request('GET', `/v1/agents${owner ? `?owner=${owner}` : ''}`),

      get: (agentId: string): Promise<{ data: Agent }> =>
        this.request('GET', `/v1/agents/${agentId}`),

      update: (agentId: string, params: Partial<CreateAgentParams>): Promise<{ data: Agent }> =>
        this.request('PUT', `/v1/agents/${agentId}`, params),

      /** List tools assigned to an agent. */
      listTools: (agentId: string): Promise<{ data: any[] }> =>
        this.request('GET', `/v1/agents/${agentId}/tools`),

      /** Assign a tool to an agent. */
      addTool: (agentId: string, params: { toolId: string; usageComments?: string }): Promise<{ data: any }> =>
        this.request('POST', `/v1/agents/${agentId}/tools`, params),

      /** Remove a tool assignment from an agent. */
      removeTool: (assignmentId: string): Promise<void> =>
        this.request('DELETE', `/v1/agents/tools/${assignmentId}`),

      /** Create a liaison agent for an external agent. */
      createLiaison: (params: Record<string, any>): Promise<any> =>
        this.request('POST', '/v1/liaison', params),

      /**
       * Stream an agent run. Returns an async generator of StreamEvents.
       * Works in Node.js, browsers, and Edge runtimes.
       *
       * @example
       * for await (const event of client.agents.stream({ agentId, messages })) {
       *   if (event.type === 'token') process.stdout.write(event.content ?? '');
       * }
       */
      stream: (params: RunParams): AsyncGenerator<StreamEvent> =>
        this._streamAgentRun(params),

      // ── Autonomy / Heartbeat ─────────────────────────────────────────────

      /** Get the current heartbeat/autonomy status for an agent. */
      getAutonomy: (agentId: string): Promise<{
        data: {
          enabled: boolean;
          intervalSec: number;
          isArmed: boolean;
          lastBeatAt: string | null;
          nextBeatAt: string | null;
        };
      }> => this.request('GET', `/v1/agents/${agentId}/autonomy`),

      /** Enable or disable the heartbeat, optionally setting the interval. */
      setAutonomy: (
        agentId: string,
        params: { enabled: boolean; intervalSec?: number },
      ): Promise<{ data: { enabled: boolean; intervalSec: number; isArmed: boolean } }> =>
        this.request('PUT', `/v1/agents/${agentId}/autonomy`, params),

      /** Trigger a single heartbeat beat immediately. */
      triggerHeartbeat: (agentId: string): Promise<{ message: string }> =>
        this.request('POST', `/v1/agents/${agentId}/autonomy/trigger`),

      /**
       * Manually trigger an agent (fire-and-forget).
       * Requires autonomy to be enabled on the agent.
       */
      trigger: (agentId: string): Promise<{ message: string }> =>
        this.request('POST', `/v1/agents/${agentId}/trigger`),

      // ── Knowledgebase ────────────────────────────────────────────────────

      /** Get the knowledgebase entries for an agent. */
      getKnowledgebase: (agentId: string): Promise<{ data: any[] }> =>
        this.request('GET', `/v1/agents/${agentId}/knowledgebase`),

      /** Replace the knowledgebase entries for an agent. */
      updateKnowledgebase: (agentId: string, knowledgebase: any[]): Promise<{ data: any[] }> =>
        this.request('PUT', `/v1/agents/${agentId}/knowledgebase`, { knowledgebase }),

      // ── Preferred Connections ────────────────────────────────────────────

      /** List agents that this agent prefers to collaborate with. */
      getPreferredConnections: (agentId: string): Promise<{ data: any[] }> =>
        this.request('GET', `/v1/agents/${agentId}/preferred-connections`),

      /** Add a preferred agent connection. */
      addPreferredConnection: (
        agentId: string,
        params: { preferredAgentId: string; usageComments?: string },
      ): Promise<{ data: any }> =>
        this.request('POST', `/v1/agents/${agentId}/preferred-connections`, params),

      /** Remove a preferred agent connection by its record ID. */
      removePreferredConnection: (id: string): Promise<{ success: boolean }> =>
        this.request('DELETE', `/v1/agents/preferred-connections/${id}`),

      // ── TTS Voices ───────────────────────────────────────────────────────

      /**
       * List available TTS voices for a provider.
       * @param provider - 'openai' (default) or 'elevenlabs'
       * @param q - optional search query to filter voices
       */
      listVoices: (
        provider?: 'openai' | 'elevenlabs',
        q?: string,
      ): Promise<{ data: any[] }> => {
        const params = new URLSearchParams();
        if (provider) params.set('provider', provider);
        if (q) params.set('q', q);
        const qs = params.toString();
        return this.request('GET', `/v1/agents/tts/voices${qs ? `?${qs}` : ''}`);
      },
    };
  }

  // ── Run (non-streaming) ───────────────────────────────────────────────────

  get run() {
    return {
      once: (params: RunParams): Promise<any> =>
        this.request('POST', '/v1/agents/run', params),
    };
  }

  // ── Workflows ─────────────────────────────────────────────────────────────

  get workflows() {
    return {
      create: (params: {
        name: string;
        description?: string;
        definition: any;
        ownerId: string;
        ownerType: 'user' | 'agent';
        isPublic?: boolean;
        category?: string;
        tags?: string[];
      }): Promise<Workflow> => this.request('POST', '/v1/workflows', params),

      list: (ownerId: string, ownerType: 'user' | 'agent'): Promise<Workflow[]> =>
        this.request('GET', `/v1/workflows?ownerId=${ownerId}&ownerType=${ownerType}`),

      get: (workflowId: string): Promise<Workflow> =>
        this.request('GET', `/v1/workflows/${workflowId}`),

      update: (workflowId: string, updates: Partial<Workflow>): Promise<Workflow> =>
        this.request('PUT', `/v1/workflows/${workflowId}`, updates),

      delete: (workflowId: string): Promise<{ success: boolean }> =>
        this.request('DELETE', `/v1/workflows/${workflowId}`),

      execute: (workflowId: string, params: {
        agentId?: string;
        sessionId?: string;
        inputData?: Record<string, any>;
        userId?: string;
      }): Promise<WorkflowExecution> =>
        this.request('POST', `/v1/workflows/${workflowId}/execute`, params),

      getExecution: (workflowId: string, executionId: string): Promise<WorkflowExecution> =>
        this.request('GET', `/v1/workflows/${workflowId}/executions/${executionId}`),

      listExecutions: (workflowId: string, limit?: number): Promise<WorkflowExecution[]> =>
        this.request('GET', `/v1/workflows/${workflowId}/executions${limit ? `?limit=${limit}` : ''}`),

      cancelExecution: (workflowId: string, executionId: string): Promise<{ success: boolean }> =>
        this.request('POST', `/v1/workflows/${workflowId}/executions/${executionId}/cancel`),

      /** Approve a paused human_approval node and resume execution. */
      approveExecution: (workflowId: string, executionId: string, params: {
        approvalToken: string;
        approvalData?: Record<string, any>;
      }): Promise<{ success: boolean; executionId: string; action: string }> =>
        this.request('POST', `/v1/workflows/${workflowId}/executions/${executionId}/approve`, params),

      /** Reject a paused human_approval node and terminate execution. */
      rejectExecution: (workflowId: string, executionId: string, params: {
        approvalToken: string;
        reason?: string;
      }): Promise<{ success: boolean; executionId: string; action: string }> =>
        this.request('POST', `/v1/workflows/${workflowId}/executions/${executionId}/reject`, params),

      /** Stream execution progress via SSE. Returns an async generator. */
      stream: (workflowId: string, executionId: string): AsyncGenerator<StreamEvent> =>
        this._streamSse(`/v1/workflows/${workflowId}/executions/${executionId}/stream`),
    };
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  get tasks() {
    return {
      create: (params: CreateTaskParams): Promise<{ data: Task }> =>
        this.request('POST', '/v1/tasks', params),

      list: (filter: { sessionId?: string; agentId?: string; ownerId?: string; ownerType?: 'user' | 'agent' }): Promise<{ data: Task[] }> => {
        const q = new URLSearchParams(filter as any).toString();
        return this.request('GET', `/v1/tasks?${q}`);
      },

      get: (taskId: string): Promise<{ data: Task }> =>
        this.request('GET', `/v1/tasks/${taskId}`),

      execute: (taskId: string): Promise<{ success: boolean; data: any }> =>
        this.request('POST', `/v1/tasks/${taskId}/execute`),

      cancel: (taskId: string): Promise<{ success: boolean }> =>
        this.request('POST', `/v1/tasks/${taskId}/cancel`),

      delete: (taskId: string): Promise<{ success: boolean }> =>
        this.request('DELETE', `/v1/tasks/${taskId}`),

      /** Stream task status updates via SSE. Returns an async generator. */
      stream: (taskId: string): AsyncGenerator<StreamEvent> =>
        this._streamSse(`/v1/tasks/${taskId}/stream`),
    };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  get sessions() {
    return {
      list: (agentId: string, initiatorId: string): Promise<{ data: import('./types').Session[] }> =>
        this.request('GET', `/v1/sessions/list/${agentId}/${initiatorId}`),

      /** List all sessions for a given agent (all initiators). */
      listByAgent: (agentId: string): Promise<{ data: import('./types').Session[] }> =>
        this.request('GET', `/v1/sessions/agent/${agentId}`),

      /** List all sessions for a user across all agents. */
      listByUser: (initiator: string): Promise<{ data: import('./types').Session[] }> =>
        this.request('GET', `/v1/sessions/user/${encodeURIComponent(initiator)}`),

      create: (params: {
        agentId: string;
        initiator: string;
        title?: string;
        model?: Record<string, any>;
      }): Promise<{ data: import('./types').Session }> =>
        this.request('POST', '/v1/sessions', params),

      get: (sessionId: string): Promise<{ data: import('./types').Session }> =>
        this.request('GET', `/v1/sessions/${sessionId}`),

      /** Get full session with history, tasks, childSessions, and spaces. */
      getFull: (sessionId: string): Promise<{ data: any }> =>
        this.request('GET', `/v1/sessions/${sessionId}/full`),
    };
  }

  // ── Tools ─────────────────────────────────────────────────────────────────

  get tools() {
    return {
      list: (filter?: { agentId?: string; owner?: string; ownerType?: string; visibility?: string }): Promise<{ data: Tool[] }> => {
        const q = filter ? new URLSearchParams(filter as any).toString() : '';
        return this.request('GET', `/v1/tools${q ? `?${q}` : ''}`);
      },

      get: (toolId: string): Promise<{ data: Tool }> =>
        this.request('GET', `/v1/tools/${toolId}`),

      create: (params: CreateToolParams): Promise<{ data: Tool }> =>
        this.request('POST', '/v1/tools', params),

      update: (toolId: string, params: Partial<CreateToolParams>): Promise<{ data: Tool }> =>
        this.request('PUT', `/v1/tools/${toolId}`, params),

      delete: (toolId: string): Promise<{ success: boolean }> =>
        this.request('DELETE', `/v1/tools/${toolId}`),

      /** List built-in static tools available to all agents. */
      listStatic: (): Promise<{ data: Tool[] }> =>
        this.request('GET', '/v1/tools/static'),
    };
  }

  // ── Tool Keys ─────────────────────────────────────────────────────────────

  get toolKeys() {
    return {
      list: (filter: { ownerId?: string; ownerType?: string; toolId?: string }): Promise<{ success: boolean; data: ToolKey[] }> => {
        const q = new URLSearchParams(filter as any).toString();
        return this.request('GET', `/v1/tool-keys${q ? `?${q}` : ''}`);
      },

      create: (params: CreateToolKeyParams): Promise<{ success: boolean; data: ToolKey }> =>
        this.request('POST', '/v1/tool-keys', params),

      delete: (keyId: string): Promise<{ success: boolean }> =>
        this.request('DELETE', `/v1/tool-keys/${keyId}`),
    };
  }

  // ── Tool Permissions ──────────────────────────────────────────────────────

  get toolPermissions() {
    return {
      list: (toolId?: string): Promise<{ success: boolean; data: ToolPermission[] }> => {
        const q = toolId ? `?toolId=${toolId}` : '';
        return this.request('GET', `/v1/tool-permissions${q}`);
      },

      grant: (params: {
        toolId: string;
        subjectId: string;
        subjectType: 'user' | 'agent';
        permission: 'read' | 'execute' | 'admin';
        grantedBy?: string;
      }): Promise<{ success: boolean; data: ToolPermission }> =>
        this.request('POST', '/v1/tool-permissions/grant', params),

      revoke: (permissionId: string): Promise<{ success: boolean }> =>
        this.request('DELETE', `/v1/tool-permissions/revoke/${permissionId}`),
    };
  }

  // ── Skills ────────────────────────────────────────────────────────────────

  get skills() {
    return {
      list: (filter?: { ownerId?: string; ownerType?: string; isPublic?: boolean }): Promise<{ data: Skill[] }> => {
        const params = new URLSearchParams();
        if (filter?.ownerId) params.set('ownerId', filter.ownerId);
        if (filter?.ownerType) params.set('ownerType', filter.ownerType);
        if (filter?.isPublic !== undefined) params.set('isPublic', String(filter.isPublic));
        const qs = params.toString();
        return this.request('GET', `/v1/skills${qs ? `?${qs}` : ''}`);
      },

      get: (skillIdOrSlug: string): Promise<{ data: Skill }> =>
        this.request('GET', `/v1/skills/${skillIdOrSlug}`),

      getIndex: (ownerId?: string): Promise<{ data: SkillIndex[] }> => {
        const qs = ownerId ? `?ownerId=${ownerId}` : '';
        return this.request('GET', `/v1/skills/index${qs}`);
      },

      create: (params: CreateSkillParams): Promise<{ data: Skill }> =>
        this.request('POST', '/v1/skills', params),

      update: (skillIdOrSlug: string, updates: Partial<CreateSkillParams>): Promise<{ data: Skill }> =>
        this.request('PUT', `/v1/skills/${skillIdOrSlug}`, updates),

      delete: (skillIdOrSlug: string): Promise<{ deleted: boolean }> =>
        this.request('DELETE', `/v1/skills/${skillIdOrSlug}`),
    };
  }

  // ── Wallets ───────────────────────────────────────────────────────────────

  get wallets() {
    return {
      /** List all wallets for an agent. */
      list: (agentId: string): Promise<AgentWallet[]> =>
        this.request('GET', `/v1/wallets/agent/${agentId}`),

      /** Get the primary active wallet for an agent. */
      primary: (agentId: string): Promise<AgentWallet | null> =>
        this.request('GET', `/v1/wallets/agent/${agentId}/primary`),

      /** Get a specific wallet by ID. */
      get: (walletId: string): Promise<AgentWallet> =>
        this.request('GET', `/v1/wallets/${walletId}`),

      /** Create a new wallet for an agent. */
      create: (params: CreateWalletParams): Promise<AgentWallet> =>
        this.request('POST', '/v1/wallets', params),

      /** Get USDC and native token balance for a wallet. */
      balance: (walletId: string): Promise<WalletBalance> =>
        this.request('GET', `/v1/wallets/${walletId}/balance`),

      /** Transfer USDC or ETH to another address. */
      transfer: (
        walletId: string,
        params: { toAddress: string; amount: string; tokenSymbol?: 'USDC' | 'ETH' },
      ): Promise<{ txHash: string }> =>
        this.request('POST', `/v1/wallets/${walletId}/transfer`, params),

      /**
       * Proxy an HTTP request through an agent's primary wallet, automatically
       * handling x402 payment challenges.  The wallet signs the payment and
       * retries once if the target responds with HTTP 402.
       */
      x402Fetch: (
        agentId: string,
        params: {
          url: string;
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        },
      ): Promise<{ status: number; body: unknown }> =>
        this.request('POST', `/v1/wallets/agent/${agentId}/x402-fetch`, params),

      /** Deactivate a wallet. */
      deactivate: (walletId: string): Promise<void> =>
        this.request('DELETE', `/v1/wallets/${walletId}`),
    };
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  get auth() {
    return {
      /**
       * GET /v1/auth/me
       *
       * Returns the principalId (wallet address / user ID) and principalType
       * that the current API key belongs to. Use this to auto-detect the
       * initiator without asking the user to type their address manually.
       */
      me: (): Promise<{ principalId: string | null; principalType: string | null }> =>
        this.request('GET', '/v1/auth/me'),
    };
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  get apiKeys() {
    return {
      /**
       * Generate a new API key for a principal (user or agent).
       * The plaintext key is returned only in this response — never again.
       */
      create: (params: CreateApiKeyParams): Promise<CreatedApiKey> =>
        this.request('POST', '/v1/auth/api-keys', params),

      /** List all active API keys for a principal (key values not included). */
      list: (principalId: string, principalType: ApiKeyPrincipalType): Promise<ApiKey[]> => {
        const q = new URLSearchParams({ principalId, principalType }).toString();
        return this.request('GET', `/v1/auth/api-keys?${q}`);
      },

      /** Revoke (soft-delete) an API key by its UUID. */
      revoke: (id: string): Promise<{ revoked: boolean }> =>
        this.request('DELETE', `/v1/auth/api-keys/${id}`),
    };
  }

  // ── SSE Streaming internals ───────────────────────────────────────────────

  private async *_streamAgentRun(params: RunParams): AsyncGenerator<StreamEvent> {
    const res = await this._fetch(`${this.baseUrl}/v1/agents/run/stream`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }

    yield* this._parseEventStream(res);
  }

  private async *_streamSse(path: string): AsyncGenerator<StreamEvent> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers({ Accept: 'text/event-stream' }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }

    yield* this._parseEventStream(res);
  }

  private async *_parseEventStream(res: Response): AsyncGenerator<StreamEvent> {
    if (!res.body) throw new Error('No response body');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;
          try {
            const event = JSON.parse(raw) as StreamEvent;
            if (event.type !== 'heartbeat') yield event;
            if (event.type === 'final' || event.type === 'completed') return;
          } catch {
            // Ignore malformed lines
          }
        }
      }
    }
  }

  // ── A2A ───────────────────────────────────────────────────────────────────

  get a2a() {
    return {
      /** Fetch the A2A Agent Card for an agent. */
      getAgentCard: (agentId: string): Promise<AgentCard> =>
        this.request('GET', `/.well-known/agent.json?agentId=${agentId}`),

      /** Send a task to an agent (synchronous, waits for completion). */
      sendTask: (agentId: string, params: A2ASendTaskParams): Promise<A2ATask> =>
        this.request('POST', `/v1/a2a/${agentId}`, {
          jsonrpc: '2.0',
          id: params.id ?? `sdk-${Date.now()}`,
          method: 'tasks/send',
          params,
        }).then((r: any) => r.result as A2ATask),

      /** Get A2A task status. */
      getTask: (agentId: string, taskId: string): Promise<A2ATask> =>
        this.request('POST', `/v1/a2a/${agentId}`, {
          jsonrpc: '2.0', id: taskId, method: 'tasks/get', params: { id: taskId },
        }).then((r: any) => r.result as A2ATask),

      /** Cancel a running A2A task. */
      cancelTask: (agentId: string, taskId: string): Promise<A2ATask> =>
        this.request('POST', `/v1/a2a/${agentId}`, {
          jsonrpc: '2.0', id: taskId, method: 'tasks/cancel', params: { id: taskId },
        }).then((r: any) => r.result as A2ATask),

      /** List recent A2A tasks for an agent. */
      listTasks: (agentId: string, limit?: number): Promise<{ tasks: A2ATask[]; total: number }> =>
        this.request('GET', `/v1/a2a/${agentId}/tasks${limit ? `?limit=${limit}` : ''}`),

      /** Stream A2A task updates (SSE). */
      stream: (agentId: string, taskId: string): AsyncGenerator<StreamEvent> =>
        this._streamSse(`/v1/a2a/${agentId}/tasks/${taskId}/stream`),
    };
  }

  // ── MCP ───────────────────────────────────────────────────────────────────

  get mcp() {
    return {
      /** List MCP servers for an owner. */
      listServers: (ownerId: string, ownerType: 'user' | 'agent'): Promise<{ servers: McpServer[]; total: number }> =>
        this.request('GET', `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`),

      /** Create a new MCP server. */
      createServer: (params: {
        name: string;
        description?: string;
        connectionType: McpConnectionType;
        connectionConfig: Record<string, any>;
        isPublic?: boolean;
        tags?: string[];
        ownerId: string;
        ownerType: 'user' | 'agent';
      }): Promise<McpServer> => {
        const { ownerId, ownerType, ...dto } = params;
        return this.request('POST', `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`, dto);
      },

      /** Get MCP server by ID. */
      getServer: (serverId: string): Promise<McpServer> =>
        this.request('GET', `/v1/mcp/servers/${serverId}`),

      /** Update an MCP server's configuration. */
      updateServer: (serverId: string, params: Partial<{
        name: string;
        description: string;
        connectionConfig: Record<string, any>;
        isPublic: boolean;
        tags: string[];
      }>): Promise<McpServer> =>
        this.request('PUT', `/v1/mcp/servers/${serverId}`, params),

      /** Delete an MCP server. */
      deleteServer: (serverId: string): Promise<void> =>
        this.request('DELETE', `/v1/mcp/servers/${serverId}`),

      /** List public MCP servers (marketplace). */
      getMarketplace: (): Promise<{ servers: McpServer[]; total: number }> =>
        this.request('GET', '/v1/mcp/servers/marketplace'),

      /** Get connection status for an MCP server. */
      getServerStatus: (serverId: string): Promise<{
        connected: boolean;
        capabilities: string[];
        toolsDiscovered: number;
        lastConnectedAt: Date | null;
        lastError: string | null;
      }> => this.request('GET', `/v1/mcp/servers/${serverId}/status`),

      /** Connect to an MCP server. */
      connect: (serverId: string): Promise<{ connected: boolean }> =>
        this.request('POST', `/v1/mcp/servers/${serverId}/connect`),

      /** Disconnect from an MCP server. */
      disconnect: (serverId: string): Promise<void> =>
        this.request('POST', `/v1/mcp/servers/${serverId}/disconnect`),

      /** Sync tools + resources + prompts from the MCP server. */
      sync: (serverId: string): Promise<{ toolsDiscovered: number; resourcesDiscovered: number; promptsDiscovered: number }> =>
        this.request('POST', `/v1/mcp/servers/${serverId}/sync`, {}),

      /** List tools discovered from an MCP server. */
      listTools: (serverId: string): Promise<{ tools: any[]; total: number }> =>
        this.request('GET', `/v1/mcp/servers/${serverId}/tools`),

      /** List all MCP tools across all servers for a given owner. */
      listToolsByOwner: (ownerId: string, ownerType: 'user' | 'agent'): Promise<{ tools: any[] }> =>
        this.request('GET', `/v1/mcp/tools?ownerId=${ownerId}&ownerType=${ownerType}`),

      /** List resources from an MCP server. */
      listResources: (serverId: string): Promise<{ resources: McpResource[]; total: number }> =>
        this.request('GET', `/v1/mcp/servers/${serverId}/resources`),

      /** Read a resource by URI. */
      readResource: (serverId: string, uri: string): Promise<{ uri: string; contents: any }> =>
        this.request('GET', `/v1/mcp/servers/${serverId}/resources/read?uri=${encodeURIComponent(uri)}`),

      /** List prompts from an MCP server. */
      listPrompts: (serverId: string): Promise<{ prompts: McpPrompt[]; total: number }> =>
        this.request('GET', `/v1/mcp/servers/${serverId}/prompts`),

      /** Render a prompt with arguments. */
      getPrompt: (serverId: string, promptName: string, args?: Record<string, string>): Promise<{ description?: string; messages: any[] }> =>
        this.request('POST', `/v1/mcp/servers/${serverId}/prompts/${promptName}`, { arguments: args }),
    };
  }

  // ── Memory ────────────────────────────────────────────────────────────────

  get memory() {
    return {
      /** List all memories for an agent. */
      list: (
        agentId: string,
        opts?: { type?: MemoryType; limit?: number },
      ): Promise<{ data: AgentMemory[] }> => {
        const params = new URLSearchParams();
        if (opts?.type)  params.set('type', opts.type);
        if (opts?.limit) params.set('limit', String(opts.limit));
        const qs = params.toString();
        return this.request('GET', `/v1/memory/agents/${agentId}${qs ? `?${qs}` : ''}`);
      },

      /** Get memory stats for an agent. */
      stats: (agentId: string): Promise<{ data: MemoryStats }> =>
        this.request('GET', `/v1/memory/agents/${agentId}/stats`),

      /** Retrieve memories most relevant to a query. */
      retrieve: (
        agentId: string,
        query: string,
        limit?: number,
      ): Promise<{ data: AgentMemory[] }> => {
        const params = new URLSearchParams({ q: query });
        if (limit) params.set('limit', String(limit));
        return this.request('GET', `/v1/memory/agents/${agentId}/retrieve?${params}`);
      },

      /** Get a single memory by ID. */
      get: (memoryId: string): Promise<{ data: AgentMemory }> =>
        this.request('GET', `/v1/memory/${memoryId}`),

      /** Manually create a memory. */
      create: (params: CreateMemoryParams): Promise<{ data: AgentMemory }> =>
        this.request('POST', '/v1/memory', params),

      /** Update a memory. */
      update: (memoryId: string, params: UpdateMemoryParams): Promise<{ data: AgentMemory }> =>
        this.request('PATCH', `/v1/memory/${memoryId}`, params),

      /** Soft-delete (deactivate) a memory. */
      delete: (memoryId: string): Promise<void> =>
        this.request('DELETE', `/v1/memory/${memoryId}`),
    };
  }

  // ── Usage / Observability ─────────────────────────────────────────────────

  get usage() {
    return {
      /** Get aggregated token + cost usage for an agent. */
      getAgentUsage: (
        agentId: string,
        opts?: { from?: string; to?: string },
      ): Promise<{ data: UsageAggregation }> => {
        const params = new URLSearchParams();
        if (opts?.from) params.set('from', opts.from);
        if (opts?.to)   params.set('to',   opts.to);
        const qs = params.toString();
        return this.request('GET', `/v1/usage/agents/${agentId}${qs ? `?${qs}` : ''}`);
      },

      /** Get aggregated token + cost usage for a session. */
      getSessionUsage: (sessionId: string): Promise<{ data: UsageAggregation }> =>
        this.request('GET', `/v1/usage/sessions/${sessionId}`),
    };
  }
}

// ─── Error ────────────────────────────────────────────────────────────────────

export class CommonsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'CommonsError';
  }
}
