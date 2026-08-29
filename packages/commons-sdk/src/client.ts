import {
  Agent,
  CreateAgentParams,
  GenerateImageParams,
  GeneratedImageAsset,
  RunParams,
  StreamEvent,
  Workflow,
  WorkflowExecution,
  Task,
  CreateTaskParams,
  Tool,
  CreateToolParams,
  ToolKey,
  CreateToolKeyParams,
  ToolPermission,
  CommonsClientConfig,
  AgentCard,
  A2ATask,
  A2ASendTaskParams,
  McpServer,
  McpResource,
  McpPrompt,
  McpConnectionType,
  Skill,
  AgentSkill,
  SkillIndex,
  CreateSkillParams,
  UsageAggregation,
  CreditBalance,
  CreditLedgerEntry,
  CreditWriteParams,
  CreditCampaign,
  CreditSummary,
  CreditTransfer,
  SubscriptionInfo,
  PlanEntitlements,
  BillingCatalog,
  FlagEvaluation,
  AgentMemory,
  MemoryStats,
  MemoryType,
  CreateMemoryParams,
  UpdateMemoryParams,
  SharedMemoryScope,
  CreateSharedMemoryScopeParams,
  AgentWallet,
  WalletBalance,
  CreateWalletParams,
  ApiKey,
  CreatedApiKey,
  CreateApiKeyParams,
  ApiKeyPrincipalType,
  AgentComputer,
  AgentComputerConfig,
  AgentComputerInstance,
  AgentComputerEvent,
  ComputerActionParams,
  ComputerBrowserOpenParams,
  ComputerCommandParams,
  ComputerConfigUpdate,
  ComputerFile,
  ComputerResizeParams,
  AgentRuntime,
  AgentRuntimeConfig,
  AgentRuntimeType,
  CopilotChange,
  ActivityEvent,
  AgentLog,
  FileArtifact,
  FileContent,
  UploadFileInput,
  LibraryItem,
  LibraryGrant,
  LibraryShareLink,
  KnowledgePermission,
  KnowledgeProviderDefinition,
  KnowledgeProviderId,
  KnowledgeSpace,
  KnowledgeGrant,
  KnowledgeDocument,
  KnowledgeFolder,
  KnowledgeGraph,
  KnowledgeSearchResult,
  Space,
  SpaceMember,
  SpaceMessage,
  CodeProject,
  CodeProjectFile,
  Goal,
  OAuthProvider,
  OAuthConnection,
  BillingInvoice,
  BillingPaymentMethod,
  DeveloperProject,
  DeveloperProjectEnvironment,
  DeveloperApiKey,
  CreatedDeveloperApiKey,
  CapabilityName,
  CapabilityProviderConfiguration,
  CapabilityProviderDefinition,
  CapabilityProviderInput,
  UiPlugin,
  CreateUiPluginParams,
  ProvenanceTrajectory,
} from "./types";

export interface CommonsRequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class CommonsClient {
  private readonly baseUrl: string;
  private readonly identityUrl: string;
  private readonly identityToken?: string;
  private readonly apiKey?: string;
  private readonly initiator?: string;
  private readonly _fetch: typeof fetch;

  constructor(config: CommonsClientConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.agentcommons.io").replace(
      /\/$/,
      "",
    );
    this.identityUrl = (config.identityUrl ?? "https://auth.agentcommons.io")
      .replace(/\/api\/auth\/?$/, "")
      .replace(/\/$/, "");
    this.identityToken = config.identityToken;
    this.apiKey = config.apiKey;
    this.initiator = config.initiator;
    this._fetch = config.fetch ?? fetch;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private headers(
    extra?: Record<string, string>,
    json = true,
  ): Record<string, string> {
    const h: Record<string, string> = {};
    if (json) h["Content-Type"] = "application/json";
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    if (this.initiator) h["x-initiator"] = this.initiator;
    return { ...h, ...extra };
  }

  /**
   * Call an API route that is not yet represented by a resource namespace.
   * Most applications should use the typed helpers below.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: CommonsRequestOptions = {},
  ): Promise<T> {
    const isFormData =
      typeof FormData !== "undefined" && body instanceof FormData;
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(options.headers, !isFormData),
      body:
        body === undefined
          ? undefined
          : isFormData
            ? body
            : JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) {
      const err = await this.errorPayload(res);
      throw new CommonsError(
        this.errorMessage(err, res.statusText),
        res.status,
        err,
      );
    }
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return (await res.text()) as T;
    }
    return res.json() as Promise<T>;
  }

  private async errorPayload(res: Response): Promise<unknown> {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      return res.json().catch(() => ({ message: res.statusText }));
    }
    const message = await res.text().catch(() => "");
    return { message: message || res.statusText };
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== "object") return fallback;
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("error" in error) {
      if (typeof error.error === "string") return error.error;
      if (
        error.error &&
        typeof error.error === "object" &&
        "message" in error.error &&
        typeof error.error.message === "string"
      ) {
        return error.error.message;
      }
    }
    return fallback;
  }

  private async identityRequest<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.identityToken) {
      headers.Authorization = `Bearer ${this.identityToken}`;
    }
    const response = await this._fetch(`${this.identityUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await this.errorPayload(response);
      throw new CommonsError(
        this.errorMessage(error, response.statusText),
        response.status,
        error,
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  // ── Models ────────────────────────────────────────────────────────────────

  get models() {
    return {
      /** List all available LLM models from the registry */
      list: (): Promise<{ data: any[]; grouped: Record<string, any[]> }> =>
        this.request("GET", "/v1/models"),
    };
  }

  // ── Agents ────────────────────────────────────────────────────────────────

  get agents() {
    return {
      create: (params: CreateAgentParams): Promise<{ data: Agent }> =>
        this.request("POST", "/v1/agents", params),

      list: (owner?: string): Promise<{ data: Agent[] }> =>
        this.request("GET", `/v1/agents${owner ? `?owner=${owner}` : ""}`),

      get: (agentId: string): Promise<{ data: Agent }> =>
        this.request("GET", `/v1/agents/${agentId}`),

      update: (
        agentId: string,
        params: Partial<CreateAgentParams>,
      ): Promise<{ data: Agent }> =>
        this.request("PUT", `/v1/agents/${agentId}`, params),

      /**
       * Generate durable image assets for this agent without routing a
       * deterministic image operation through an LLM tool-selection turn.
       */
      generateImage: (
        agentId: string,
        params: GenerateImageParams,
      ): Promise<{ data: GeneratedImageAsset[] }> =>
        this.request(
          "POST",
          `/v1/agents/${encodeURIComponent(agentId)}/assets/images`,
          params,
        ),

      getRuntime: (agentId: string): Promise<{ data: AgentRuntime }> =>
        this.request("GET", `/v1/agents/${agentId}/runtime`),

      configureRuntime: (
        agentId: string,
        params: {
          runtimeType?: AgentRuntimeType;
          version?: string | null;
          config?: AgentRuntimeConfig;
          deploy?: boolean;
        },
      ): Promise<{ data: AgentRuntime }> =>
        this.request("PUT", `/v1/agents/${agentId}/runtime`, params),

      deployRuntime: (agentId: string): Promise<{ data: AgentRuntime }> =>
        this.request("POST", `/v1/agents/${agentId}/runtime/deploy`),

      sleepRuntime: (agentId: string): Promise<{ data: AgentRuntime }> =>
        this.request("POST", `/v1/agents/${agentId}/runtime/sleep`),

      restartRuntime: (agentId: string): Promise<{ data: AgentRuntime }> =>
        this.request("POST", `/v1/agents/${agentId}/runtime/restart`),

      manageRuntimeChannel: (
        agentId: string,
        channel: string,
        action: string,
        params: {
          pairingCode?: string;
          target?: string;
          message?: string;
        } = {},
      ): Promise<{ data: unknown }> =>
        this.request(
          "POST",
          `/v1/agents/${encodeURIComponent(agentId)}/runtime/channels/${encodeURIComponent(channel)}/${encodeURIComponent(action)}`,
          params,
        ),

      /** List tools assigned to an agent. */
      listTools: (agentId: string): Promise<{ data: any[] }> =>
        this.request("GET", `/v1/agents/${agentId}/tools`),

      /** Assign a tool to an agent. */
      addTool: (
        agentId: string,
        params: { toolId: string; usageComments?: string },
      ): Promise<{ data: any }> =>
        this.request("POST", `/v1/agents/${agentId}/tools`, params),

      /** Update an agent tool assignment. */
      updateTool: (
        assignmentId: string,
        params: { usageComments?: string; enabled?: boolean },
      ): Promise<{ data: any }> =>
        this.request(
          "PATCH",
          `/v1/agents/tools/${encodeURIComponent(assignmentId)}`,
          params,
        ),

      /** Remove a tool assignment from an agent. */
      removeTool: (assignmentId: string): Promise<void> =>
        this.request(
          "DELETE",
          `/v1/agents/tools/${encodeURIComponent(assignmentId)}`,
        ),

      /** Create a liaison agent for an external agent. */
      createLiaison: (params: Record<string, any>): Promise<any> =>
        this.request("POST", "/v1/liaison", params),

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

      /** Resume a streamed run after executing a caller-owned CLI tool. */
      submitCliToolResult: (
        requestId: string,
        result: string,
      ): Promise<{ data?: unknown; message?: string }> =>
        this.request("POST", "/v1/agents/cli-tool-result", {
          requestId,
          result,
        }),

      // ── Heartbeat ─────────────────────────────────────────────────────────

      /** Get the current heartbeat status for an agent. */
      getAutonomy: (
        agentId: string,
      ): Promise<{
        data: {
          enabled: boolean;
          intervalSec: number;
          isArmed: boolean;
          lastBeatAt: string | null;
          nextBeatAt: string | null;
        };
      }> => this.request("GET", `/v1/agents/${agentId}/autonomy`),

      /** Enable or disable the heartbeat, optionally setting the interval. */
      setAutonomy: (
        agentId: string,
        params: { enabled: boolean; intervalSec?: number },
      ): Promise<{
        data: { enabled: boolean; intervalSec: number; isArmed: boolean };
      }> => this.request("PUT", `/v1/agents/${agentId}/autonomy`, params),

      /** Trigger a single heartbeat immediately. */
      triggerHeartbeat: (agentId: string): Promise<{ message: string }> =>
        this.request("POST", `/v1/agents/${agentId}/autonomy/trigger`),

      /**
       * Manually trigger an agent (fire-and-forget).
       * Requires autonomy to be enabled on the agent.
       */
      trigger: (agentId: string): Promise<{ message: string }> =>
        this.request("POST", `/v1/agents/${agentId}/trigger`),

      // ── Knowledgebase ────────────────────────────────────────────────────

      /** Get the knowledgebase entries for an agent. */
      getKnowledgebase: (agentId: string): Promise<{ data: any[] }> =>
        this.request("GET", `/v1/agents/${agentId}/knowledgebase`),

      /** Replace the knowledgebase entries for an agent. */
      updateKnowledgebase: (
        agentId: string,
        knowledgebase: any[],
      ): Promise<{ data: any[] }> =>
        this.request("PUT", `/v1/agents/${agentId}/knowledgebase`, {
          knowledgebase,
        }),

      // ── Preferred Connections ────────────────────────────────────────────

      /** List agents that this agent prefers to collaborate with. */
      getPreferredConnections: (agentId: string): Promise<{ data: any[] }> =>
        this.request("GET", `/v1/agents/${agentId}/preferred-connections`),

      /** Add a preferred agent connection. */
      addPreferredConnection: (
        agentId: string,
        params: { preferredAgentId: string; usageComments?: string },
      ): Promise<{ data: any }> =>
        this.request(
          "POST",
          `/v1/agents/${agentId}/preferred-connections`,
          params,
        ),

      /** Remove a preferred agent connection by its record ID. */
      removePreferredConnection: (id: string): Promise<{ success: boolean }> =>
        this.request("DELETE", `/v1/agents/preferred-connections/${id}`),

      // ── Computers ────────────────────────────────────────────────────────

      getComputerConfig: (
        agentId: string,
      ): Promise<{ data: AgentComputerConfig }> =>
        this.request("GET", `/v1/agents/${agentId}/computer/config`),

      updateComputerConfig: (
        agentId: string,
        params: ComputerConfigUpdate,
      ): Promise<{ data: AgentComputerConfig }> =>
        this.request("PUT", `/v1/agents/${agentId}/computer/config`, params),

      /** Get the agent's one persistent cloud computer. */
      getComputer: (
        agentId: string,
        /** @deprecated Computer IDs are no longer required and are ignored. */
        _legacyComputerId?: string,
      ): Promise<{ data: AgentComputer | null }> =>
        this.request("GET", `/v1/agents/${agentId}/computer`),

      /** Wake the agent's persistent cloud computer, provisioning it if needed. */
      wakeComputer: (
        agentId: string,
        params?: ComputerActionParams,
      ): Promise<{ data: AgentComputer }> =>
        this.request("POST", `/v1/agents/${agentId}/computer/wake`, params),

      /** Sleep the runtime while preserving the computer's durable workspace. */
      sleepComputer: (
        agentId: string,
        params?: ComputerActionParams,
      ): Promise<{ data: AgentComputer }> =>
        this.request("POST", `/v1/agents/${agentId}/computer/sleep`, params),

      /** Replace the runtime without replacing the persistent computer. */
      restartComputer: (
        agentId: string,
        params?: ComputerActionParams,
      ): Promise<{ data: AgentComputer }> =>
        this.request("POST", `/v1/agents/${agentId}/computer/restart`, params),

      resizeComputer: (
        agentId: string,
        params: ComputerResizeParams,
      ): Promise<{ data: AgentComputer }> =>
        this.request("POST", `/v1/agents/${agentId}/computer/resize`, params),

      execComputer: (
        agentId: string,
        params: ComputerCommandParams,
      ): Promise<{ data: any }> =>
        this.request("POST", `/v1/agents/${agentId}/computer/exec`, params),

      readComputerFile: (
        agentId: string,
        pathOrLegacyComputerId: string,
        /** @deprecated Pass the path as the second argument. */
        legacyPath?: string,
      ): Promise<{ data: ComputerFile }> => {
        const path = legacyPath ?? pathOrLegacyComputerId;
        return this.request(
          "GET",
          `/v1/agents/${agentId}/computer/files/read?path=${encodeURIComponent(path)}`,
        );
      },

      writeComputerFile: (
        agentId: string,
        params: { path: string; content: string; encoding?: "utf8" | "base64" },
      ): Promise<{ data: ComputerFile }> =>
        this.request(
          "POST",
          `/v1/agents/${encodeURIComponent(agentId)}/computer/files/write`,
          params,
        ),

      openComputerBrowser: (
        agentId: string,
        paramsOrLegacyComputerId: ComputerBrowserOpenParams | string,
        /** @deprecated Pass browser options as the second argument. */
        legacyParams?: ComputerBrowserOpenParams,
      ): Promise<{ data: any }> => {
        const params =
          typeof paramsOrLegacyComputerId === "string"
            ? legacyParams
            : paramsOrLegacyComputerId;
        if (!params) {
          return Promise.reject(new TypeError("Browser options are required."));
        }
        return this.request(
          "POST",
          `/v1/agents/${agentId}/computer/browser/open`,
          params,
        );
      },

      testComputerBrowser: (
        agentId: string,
      ): Promise<{ data: Record<string, unknown> }> =>
        this.request(
          "POST",
          `/v1/agents/${encodeURIComponent(agentId)}/computer/browser/test`,
          {},
        ),

      listComputerEvents: (
        agentId: string,
        limitOrLegacyComputerId?: number | string,
        /** @deprecated Pass the limit as the second argument. */
        legacyLimit?: number,
      ): Promise<{ data: AgentComputerEvent[] }> => {
        const limit =
          typeof limitOrLegacyComputerId === "number"
            ? limitOrLegacyComputerId
            : legacyLimit;
        return this.request(
          "GET",
          `/v1/agents/${agentId}/computer/events${limit ? `?limit=${limit}` : ""}`,
        );
      },

      // ── Deprecated per-instance compatibility ────────────────────────────

      /** @deprecated Use getComputer. The singleton is returned as a one-item list. */
      listComputers: (
        agentId: string,
        _filter?: { sessionId?: string; includeTerminated?: boolean },
      ): Promise<{ data: AgentComputerInstance[] }> => {
        return this.request<{ data: AgentComputer | null }>(
          "GET",
          `/v1/agents/${agentId}/computer`,
        ).then(({ data }) => ({
          data: data ? [data as AgentComputerInstance] : [],
        }));
      },

      /** @deprecated Use wakeComputer. Lifecycle, name, and session are ignored. */
      startComputer: (
        agentId: string,
        params?: {
          sessionId?: string;
          lifecycle?: "persistent" | "ephemeral";
          name?: string;
          reason?: string;
        },
      ): Promise<{ data: AgentComputerInstance }> =>
        this.request(
          "POST",
          `/v1/agents/${agentId}/computer/wake`,
          params?.reason ? { reason: params.reason } : undefined,
        ),

      /** @deprecated Use getComputer. Computer IDs are ignored. */
      refreshComputer: (
        agentId: string,
        _computerId?: string,
      ): Promise<{ data: AgentComputerInstance }> =>
        this.request("GET", `/v1/agents/${agentId}/computer`),

      /** @deprecated Use sleepComputer. Computer IDs are ignored. */
      stopComputer: (
        agentId: string,
        _computerId?: string,
      ): Promise<{ data: AgentComputerInstance }> =>
        this.request("POST", `/v1/agents/${agentId}/computer/sleep`),

      /** @deprecated Use execComputer. Computer IDs are ignored. */
      runComputerCommand: (
        agentId: string,
        paramsOrLegacyComputerId: ComputerCommandParams | string,
        legacyParams?: ComputerCommandParams,
      ): Promise<{ data: any }> => {
        const params =
          typeof paramsOrLegacyComputerId === "string"
            ? legacyParams
            : paramsOrLegacyComputerId;
        if (!params) {
          return Promise.reject(new TypeError("Command options are required."));
        }
        return this.request(
          "POST",
          `/v1/agents/${agentId}/computer/exec`,
          params,
        );
      },

      // ── TTS Voices ───────────────────────────────────────────────────────

      /**
       * List available TTS voices for a provider.
       * @param provider - 'openai' (default) or 'elevenlabs'
       * @param q - optional search query to filter voices
       */
      listVoices: (
        provider?: "openai" | "elevenlabs",
        q?: string,
      ): Promise<{ data: any[] }> => {
        const params = new URLSearchParams();
        if (provider) params.set("provider", provider);
        if (q) params.set("q", q);
        const qs = params.toString();
        return this.request(
          "GET",
          `/v1/agents/tts/voices${qs ? `?${qs}` : ""}`,
        );
      },
    };
  }

  get copilot() {
    return {
      get: (): Promise<{ data: Agent | null }> =>
        this.request("GET", "/v1/copilot"),
      updateSettings: (params: {
        accessMode: "full" | "scoped" | "confirm";
        scopes?: string[];
      }): Promise<{ data: Agent }> =>
        this.request("PUT", "/v1/copilot/settings", params),
      listChanges: (filter?: {
        status?: string;
        resourceType?: string;
        resourceId?: string;
      }): Promise<{ data: CopilotChange[] }> => {
        const query = new URLSearchParams();
        if (filter?.status) query.set("status", filter.status);
        if (filter?.resourceType)
          query.set("resourceType", filter.resourceType);
        if (filter?.resourceId) query.set("resourceId", filter.resourceId);
        return this.request(
          "GET",
          `/v1/copilot/changes${query.size ? `?${query}` : ""}`,
        );
      },
      acceptChange: (changeId: string): Promise<{ data: CopilotChange }> =>
        this.request("POST", `/v1/copilot/changes/${changeId}/accept`),
      rejectChange: (changeId: string): Promise<{ data: CopilotChange }> =>
        this.request("POST", `/v1/copilot/changes/${changeId}/reject`),
      revertChange: (changeId: string): Promise<{ data: CopilotChange }> =>
        this.request("POST", `/v1/copilot/changes/${changeId}/revert`),
    };
  }

  // ── Run (non-streaming) ───────────────────────────────────────────────────

  get run() {
    return {
      once: (params: RunParams): Promise<any> =>
        this.request("POST", "/v1/agents/run", params),
    };
  }

  // ── Provenance & attribution ─────────────────────────────────────────────

  get provenance() {
    return {
      session: (sessionId: string): Promise<{ data: ProvenanceTrajectory }> =>
        this.request(
          "GET",
          `/v1/provenance/sessions/${encodeURIComponent(sessionId)}`,
        ),
      scope: (
        scopeType: string,
        scopeId: string,
      ): Promise<{ data: ProvenanceTrajectory }> =>
        this.request(
          "GET",
          `/v1/provenance/scopes/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeId)}`,
        ),
      bundle: (traceId: string): Promise<{ data: Record<string, unknown> }> =>
        this.request(
          "GET",
          `/v1/provenance/traces/${encodeURIComponent(traceId)}/bundle`,
        ),
      anchor: (
        traceId: string,
      ): Promise<{ data: { traceId: string; status: string } }> =>
        this.request(
          "POST",
          `/v1/provenance/traces/${encodeURIComponent(traceId)}/anchor`,
          {},
        ),
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
        ownerType: "user" | "agent";
        isPublic?: boolean;
        category?: string;
        tags?: string[];
      }): Promise<Workflow> => this.request("POST", "/v1/workflows", params),

      list: (
        ownerId: string,
        ownerType: "user" | "agent",
      ): Promise<Workflow[]> =>
        this.request(
          "GET",
          `/v1/workflows?ownerId=${ownerId}&ownerType=${ownerType}`,
        ),

      discoverPublic: (filter?: {
        category?: string;
        tags?: string[];
        limit?: number;
      }): Promise<Workflow[]> => {
        const query = new URLSearchParams();
        if (filter?.category) query.set("category", filter.category);
        if (filter?.tags?.length) query.set("tags", filter.tags.join(","));
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/workflows/public${query.size ? `?${query}` : ""}`,
        );
      },

      get: (workflowId: string): Promise<Workflow> =>
        this.request("GET", `/v1/workflows/${workflowId}`),

      update: (
        workflowId: string,
        updates: Partial<Workflow>,
      ): Promise<Workflow> =>
        this.request("PUT", `/v1/workflows/${workflowId}`, updates),

      delete: (workflowId: string): Promise<{ success: boolean }> =>
        this.request("DELETE", `/v1/workflows/${workflowId}`),

      fork: (
        workflowId: string,
        params: {
          newOwnerId: string;
          newOwnerType: "user" | "agent";
          customizations?: {
            name?: string;
            description?: string;
            isPublic?: boolean;
          };
        },
      ): Promise<Workflow> =>
        this.request(
          "POST",
          `/v1/workflows/${encodeURIComponent(workflowId)}/fork`,
          params,
        ),

      getWebhook: (workflowId: string): Promise<Record<string, unknown>> =>
        this.request(
          "GET",
          `/v1/workflows/${encodeURIComponent(workflowId)}/webhook`,
        ),

      rotateWebhookToken: (
        workflowId: string,
      ): Promise<{ token: string; webhookUrl: string }> =>
        this.request(
          "POST",
          `/v1/workflows/${encodeURIComponent(workflowId)}/webhook-token`,
          {},
        ),

      disableWebhook: (workflowId: string): Promise<{ success: boolean }> =>
        this.request(
          "DELETE",
          `/v1/workflows/${encodeURIComponent(workflowId)}/webhook-token`,
        ),

      executeWebhook: (
        token: string,
        payload: unknown,
        query?: Record<string, string>,
      ): Promise<unknown> => {
        const search = query ? new URLSearchParams(query).toString() : "";
        return this.request(
          "POST",
          `/v1/workflows/webhooks/${encodeURIComponent(token)}${search ? `?${search}` : ""}`,
          payload,
        );
      },

      execute: (
        workflowId: string,
        params: {
          agentId?: string;
          sessionId?: string;
          inputData?: Record<string, any>;
          userId?: string;
        },
      ): Promise<WorkflowExecution> =>
        this.request("POST", `/v1/workflows/${workflowId}/execute`, params),

      getExecution: (
        workflowId: string,
        executionId: string,
      ): Promise<WorkflowExecution> =>
        this.request(
          "GET",
          `/v1/workflows/${workflowId}/executions/${executionId}`,
        ),

      listExecutions: (
        workflowId: string,
        limit?: number,
      ): Promise<WorkflowExecution[]> =>
        this.request(
          "GET",
          `/v1/workflows/${workflowId}/executions${limit ? `?limit=${limit}` : ""}`,
        ),

      cancelExecution: (
        workflowId: string,
        executionId: string,
      ): Promise<{ success: boolean }> =>
        this.request(
          "POST",
          `/v1/workflows/${workflowId}/executions/${executionId}/cancel`,
        ),

      /** Approve a paused human_approval node and resume execution. */
      approveExecution: (
        workflowId: string,
        executionId: string,
        params: {
          approvalToken: string;
          approvalData?: Record<string, any>;
        },
      ): Promise<{ success: boolean; executionId: string; action: string }> =>
        this.request(
          "POST",
          `/v1/workflows/${workflowId}/executions/${executionId}/approve`,
          params,
        ),

      /** Reject a paused human_approval node and terminate execution. */
      rejectExecution: (
        workflowId: string,
        executionId: string,
        params: {
          approvalToken: string;
          reason?: string;
        },
      ): Promise<{ success: boolean; executionId: string; action: string }> =>
        this.request(
          "POST",
          `/v1/workflows/${workflowId}/executions/${executionId}/reject`,
          params,
        ),

      /** Stream execution progress via SSE. Returns an async generator. */
      stream: (
        workflowId: string,
        executionId: string,
      ): AsyncGenerator<StreamEvent> =>
        this._streamSse(
          `/v1/workflows/${workflowId}/executions/${executionId}/stream`,
        ),
    };
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  get tasks() {
    return {
      create: (params: CreateTaskParams): Promise<{ data: Task }> =>
        this.request("POST", "/v1/tasks", params),

      list: (filter: {
        sessionId?: string;
        agentId?: string;
        ownerId?: string;
        ownerType?: "user" | "agent";
      }): Promise<{ data: Task[] }> => {
        const q = new URLSearchParams(filter as any).toString();
        return this.request("GET", `/v1/tasks?${q}`);
      },

      get: (taskId: string): Promise<{ data: Task }> =>
        this.request("GET", `/v1/tasks/${taskId}`),

      execute: (taskId: string): Promise<{ success: boolean; data: any }> =>
        this.request("POST", `/v1/tasks/${taskId}/execute`),

      cancel: (taskId: string): Promise<{ success: boolean }> =>
        this.request("POST", `/v1/tasks/${taskId}/cancel`),

      delete: (taskId: string): Promise<{ success: boolean }> =>
        this.request("DELETE", `/v1/tasks/${taskId}`),

      /** Edit human-facing task details (title/description/priority). */
      update: (
        taskId: string,
        params: { title?: string; description?: string; priority?: number },
      ): Promise<{ data: Task }> =>
        this.request("PATCH", `/v1/tasks/${taskId}`, params),

      /** Reschedule a task's upcoming run and/or resize its estimated duration. */
      reschedule: (
        taskId: string,
        params: { scheduledFor?: Date; estimatedDuration?: number },
      ): Promise<{
        data: Task;
        rescheduledRun: { runId: string; created: boolean } | null;
      }> => this.request("PATCH", `/v1/tasks/${taskId}/schedule`, params),

      /** Stream task status updates via SSE. Returns an async generator. */
      stream: (taskId: string): AsyncGenerator<StreamEvent> =>
        this._streamSse(`/v1/tasks/${taskId}/stream`),
    };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  get sessions() {
    return {
      list: (
        agentId: string,
        initiatorId: string,
      ): Promise<{ data: import("./types").Session[] }> =>
        this.request("GET", `/v1/sessions/list/${agentId}/${initiatorId}`),

      /** List all sessions for a given agent (all initiators). */
      listByAgent: (
        agentId: string,
      ): Promise<{ data: import("./types").Session[] }> =>
        this.request("GET", `/v1/sessions/agent/${agentId}`),

      /** List all sessions for a user across all agents. */
      listByUser: (
        initiator: string,
      ): Promise<{ data: import("./types").Session[] }> =>
        this.request(
          "GET",
          `/v1/sessions/user/${encodeURIComponent(initiator)}`,
        ),

      create: (params: {
        agentId: string;
        initiator: string;
        title?: string;
        model?: Record<string, any>;
        /** 'cli' | 'web' — marks the origin of this session for filtering in the UI */
        source?: "cli" | "web";
      }): Promise<{ data: import("./types").Session }> =>
        this.request("POST", "/v1/sessions", params),

      get: (sessionId: string): Promise<{ data: import("./types").Session }> =>
        this.request("GET", `/v1/sessions/${sessionId}`),

      /** Get full session with history, tasks, childSessions, and spaces. */
      getFull: (sessionId: string): Promise<{ data: any }> =>
        this.request("GET", `/v1/sessions/${sessionId}/full`),

      /** Rename a session. */
      rename: (
        sessionId: string,
        title: string,
      ): Promise<{ data: import("./types").Session }> =>
        this.request("PATCH", `/v1/sessions/${encodeURIComponent(sessionId)}`, {
          title,
        }),

      /** Delete a session and its owned session data. */
      delete: (sessionId: string): Promise<{ data: unknown }> =>
        this.request("DELETE", `/v1/sessions/${encodeURIComponent(sessionId)}`),

      /** Get the full chat transcript for a session. */
      getChat: (sessionId: string): Promise<{ data: unknown }> =>
        this.request(
          "GET",
          `/v1/agents/sessions/${encodeURIComponent(sessionId)}/chat`,
        ),
    };
  }

  // ── Tools ─────────────────────────────────────────────────────────────────

  get tools() {
    return {
      list: (filter?: {
        agentId?: string;
        owner?: string;
        ownerType?: string;
        visibility?: string;
      }): Promise<{ data: Tool[] }> => {
        const q = filter ? new URLSearchParams(filter as any).toString() : "";
        return this.request("GET", `/v1/tools${q ? `?${q}` : ""}`);
      },

      get: (toolId: string): Promise<{ data: Tool }> =>
        this.request("GET", `/v1/tools/${toolId}`),

      create: (params: CreateToolParams): Promise<{ data: Tool }> =>
        this.request("POST", "/v1/tools", params),

      update: (
        toolId: string,
        params: Partial<CreateToolParams>,
      ): Promise<{ data: Tool }> =>
        this.request("PUT", `/v1/tools/${toolId}`, params),

      delete: (toolId: string): Promise<{ success: boolean }> =>
        this.request("DELETE", `/v1/tools/${toolId}`),

      /** List built-in static tools available to all agents. */
      listStatic: (): Promise<{ data: Tool[] }> =>
        this.request("GET", "/v1/tools/static"),
    };
  }

  // ── OAuth Connections ─────────────────────────────────────────────────────

  get oauth() {
    return {
      /** List OAuth providers available on the platform (Google Workspace, GitHub, …). */
      listProviders: (): Promise<{ providers: OAuthProvider[] }> =>
        this.request("GET", "/v1/oauth/providers"),

      /** Get one provider's details, including its scope groups. */
      getProvider: (
        providerKey: string,
      ): Promise<{ provider: OAuthProvider }> =>
        this.request(
          "GET",
          `/v1/oauth/providers/${encodeURIComponent(providerKey)}`,
        ),

      /**
       * List the caller's OAuth connections (the accounts agents act with).
       * `ownerId` is only needed when authenticating with a management key.
       */
      listConnections: (params?: {
        ownerId?: string;
        ownerType?: "user" | "agent";
      }): Promise<{ connections: OAuthConnection[] }> => {
        const q = params ? new URLSearchParams(params as any).toString() : "";
        return this.request("GET", `/v1/oauth/connections${q ? `?${q}` : ""}`);
      },

      /** Get one OAuth connection. */
      getConnection: (
        connectionId: string,
      ): Promise<{ connection: OAuthConnection }> =>
        this.request(
          "GET",
          `/v1/oauth/connections/${encodeURIComponent(connectionId)}`,
        ),

      /** Update connection metadata or its active status. */
      updateConnection: (
        connectionId: string,
        params: { displayName?: string; isActive?: boolean },
      ): Promise<{ success: boolean; connection: OAuthConnection }> =>
        this.request(
          "PUT",
          `/v1/oauth/connections/${encodeURIComponent(connectionId)}`,
          params,
        ),

      /**
       * Start an OAuth connect flow. Returns the authorization URL the user
       * must open in a browser to grant access.
       */
      connect: (params: {
        providerKey: string;
        scopes?: string[];
        redirectUri?: string;
      }): Promise<{
        authorizationUrl: string;
        state: string;
        expiresAt: string;
      }> => this.request("POST", "/v1/oauth/connect", params),

      /** Refresh a connection's access token now. */
      refresh: (connectionId: string): Promise<{ success: boolean }> =>
        this.request(
          "POST",
          `/v1/oauth/connections/${encodeURIComponent(connectionId)}/refresh`,
        ),

      /** Check whether a connection's token is valid. */
      test: (
        connectionId: string,
      ): Promise<{
        success: boolean;
        status: string;
        accessTokenValid: boolean;
        providerUserEmail?: string;
        error?: string;
      }> =>
        this.request(
          "GET",
          `/v1/oauth/connections/${encodeURIComponent(connectionId)}/test`,
        ),

      /** Revoke a connection and delete its tokens. */
      revoke: (connectionId: string): Promise<{ success: boolean }> =>
        this.request(
          "DELETE",
          `/v1/oauth/connections/${encodeURIComponent(connectionId)}`,
        ),
    };
  }

  // ── Tool Keys ─────────────────────────────────────────────────────────────

  get toolKeys() {
    return {
      list: (): Promise<{ success: boolean; data: ToolKey[] }> =>
        this.request("GET", "/v1/tool-keys"),

      create: (
        params: CreateToolKeyParams,
      ): Promise<{ success: boolean; data: ToolKey }> =>
        this.request("POST", "/v1/tool-keys", params),

      get: (keyId: string): Promise<{ success: boolean; data: ToolKey }> =>
        this.request("GET", `/v1/tool-keys/${encodeURIComponent(keyId)}`),

      updateMetadata: (
        keyId: string,
        params: {
          displayName?: string;
          description?: string;
          isActive?: boolean;
          expiresAt?: string;
        },
      ): Promise<{ success: boolean; data: ToolKey }> =>
        this.request(
          "PUT",
          `/v1/tool-keys/${encodeURIComponent(keyId)}/metadata`,
          params,
        ),

      updateValue: (
        keyId: string,
        value: string,
      ): Promise<{ success: boolean; data: unknown }> =>
        this.request(
          "PUT",
          `/v1/tool-keys/${encodeURIComponent(keyId)}/value`,
          { value },
        ),

      test: (keyId: string): Promise<{ success: boolean; data: unknown }> =>
        this.request(
          "POST",
          `/v1/tool-keys/${encodeURIComponent(keyId)}/test`,
          {},
        ),

      mapToTool: (params: {
        toolId: string;
        keyId: string;
        contextId: string;
        contextType: "user" | "agent" | "global";
        priority?: number;
      }): Promise<{ success: boolean; data: unknown }> =>
        this.request("POST", "/v1/tool-keys/map", params),

      removeMapping: (mappingId: string): Promise<{ success: boolean }> =>
        this.request(
          "DELETE",
          `/v1/tool-keys/map/${encodeURIComponent(mappingId)}`,
        ),

      delete: (keyId: string): Promise<{ success: boolean }> =>
        this.request("DELETE", `/v1/tool-keys/${encodeURIComponent(keyId)}`),
    };
  }

  // ── Tool Permissions ──────────────────────────────────────────────────────

  get toolPermissions() {
    return {
      /** @deprecated Use listForTool with a tool ID. */
      list: (
        toolId: string,
      ): Promise<{ success: boolean; data: ToolPermission[] }> =>
        this.request(
          "GET",
          `/v1/tool-permissions/tool/${encodeURIComponent(toolId)}`,
        ),

      listForTool: (
        toolId: string,
      ): Promise<{ success: boolean; data: ToolPermission[] }> =>
        this.request(
          "GET",
          `/v1/tool-permissions/tool/${encodeURIComponent(toolId)}`,
        ),

      listForSubject: (
        subjectId: string,
        subjectType: "user" | "agent",
      ): Promise<{ success: boolean; data: ToolPermission[] }> => {
        const query = new URLSearchParams({ subjectId, subjectType });
        return this.request("GET", `/v1/tool-permissions/subject?${query}`);
      },

      accessibleTools: (
        subjectId: string,
        subjectType: "user" | "agent",
      ): Promise<{ success: boolean; data: Tool[] }> => {
        const query = new URLSearchParams({ subjectId, subjectType });
        return this.request(
          "GET",
          `/v1/tool-permissions/accessible-tools?${query}`,
        );
      },

      grant: (params: {
        toolId: string;
        subjectId: string;
        subjectType: "user" | "agent";
        permission: "read" | "execute" | "admin";
        grantedBy: string;
        expiresAt?: string;
      }): Promise<{ success: boolean; data: ToolPermission }> =>
        this.request("POST", "/v1/tool-permissions/grant", params),

      batchGrant: (params: {
        toolId: string;
        subjects: Array<{
          subjectId: string;
          subjectType: "user" | "agent";
        }>;
        permission: "read" | "execute" | "admin";
        grantedBy: string;
        expiresAt?: string;
      }): Promise<{ success: boolean; data: ToolPermission[] }> =>
        this.request("POST", "/v1/tool-permissions/batch-grant", params),

      revoke: (permissionId: string): Promise<{ success: boolean }> =>
        this.request(
          "DELETE",
          `/v1/tool-permissions/${encodeURIComponent(permissionId)}`,
        ),

      check: (params: {
        toolId: string;
        subjectId: string;
        subjectType: "user" | "agent";
        permission: "read" | "execute" | "admin";
      }): Promise<{ success: boolean; data: { hasPermission: boolean } }> =>
        this.request(
          "GET",
          `/v1/tool-permissions/check?${new URLSearchParams(params)}`,
        ),

      checkAgentAccess: (
        toolId: string,
        agentId: string,
        userId?: string,
      ): Promise<{ success: boolean; data: unknown }> => {
        const query = new URLSearchParams({ toolId, agentId });
        if (userId) query.set("userId", userId);
        return this.request(
          "GET",
          `/v1/tool-permissions/check-agent-access?${query}`,
        );
      },

      transferOwnership: (params: {
        toolId: string;
        newOwnerId: string;
        newOwnerType: "user" | "agent";
      }): Promise<{ success: boolean; data: Tool }> =>
        this.request("POST", "/v1/tool-permissions/transfer-ownership", params),
    };
  }

  // ── Skills ────────────────────────────────────────────────────────────────

  get skills() {
    return {
      list: (filter?: {
        ownerId?: string;
        ownerType?: string;
        isPublic?: boolean;
      }): Promise<{ data: Skill[] }> => {
        const params = new URLSearchParams();
        if (filter?.ownerId) params.set("ownerId", filter.ownerId);
        if (filter?.ownerType) params.set("ownerType", filter.ownerType);
        if (filter?.isPublic !== undefined)
          params.set("isPublic", String(filter.isPublic));
        const qs = params.toString();
        return this.request("GET", `/v1/skills${qs ? `?${qs}` : ""}`);
      },

      get: (skillIdOrSlug: string): Promise<{ data: Skill }> =>
        this.request("GET", `/v1/skills/${encodeURIComponent(skillIdOrSlug)}`),

      getIndex: (ownerId?: string): Promise<{ data: SkillIndex[] }> => {
        const qs = ownerId ? `?ownerId=${ownerId}` : "";
        return this.request("GET", `/v1/skills/index${qs}`);
      },

      listForAgent: (agentId: string): Promise<{ data: AgentSkill[] }> =>
        this.request("GET", `/v1/skills/agents/${encodeURIComponent(agentId)}`),

      setAgentAvailability: (
        skillIdOrSlug: string,
        agentId: string,
        isEnabled: boolean,
      ): Promise<{ data: unknown }> =>
        this.request(
          "PUT",
          `/v1/skills/${encodeURIComponent(skillIdOrSlug)}/agents/${encodeURIComponent(agentId)}`,
          { isEnabled },
        ),

      create: (params: CreateSkillParams): Promise<{ data: Skill }> =>
        this.request("POST", "/v1/skills", params),

      update: (
        skillIdOrSlug: string,
        updates: Partial<CreateSkillParams>,
      ): Promise<{ data: Skill }> =>
        this.request(
          "PUT",
          `/v1/skills/${encodeURIComponent(skillIdOrSlug)}`,
          updates,
        ),

      delete: (skillIdOrSlug: string): Promise<{ deleted: boolean }> =>
        this.request(
          "DELETE",
          `/v1/skills/${encodeURIComponent(skillIdOrSlug)}`,
        ),

      import: (
        file: Blob,
        options?: { fileName?: string; agentId?: string },
      ): Promise<{ data: Skill }> => {
        const body = new FormData();
        body.append("file", file, options?.fileName || "SKILL.md");
        if (options?.agentId) body.set("agentId", options.agentId);
        return this.request("POST", "/v1/skills/import", body);
      },
    };
  }

  // ── Capability providers ─────────────────────────────────────────────────

  get providers() {
    return {
      list: (): Promise<{
        catalog: Record<CapabilityName, CapabilityProviderDefinition[]>;
        configurations: CapabilityProviderConfiguration[];
      }> => this.request("GET", "/v1/providers"),

      configure: (
        capability: CapabilityName,
        input: CapabilityProviderInput,
      ): Promise<{ data: CapabilityProviderConfiguration }> =>
        this.request(
          "PUT",
          `/v1/providers/${encodeURIComponent(capability)}`,
          input,
        ),

      remove: (capability: CapabilityName): Promise<{ deleted: boolean }> =>
        this.request(
          "DELETE",
          `/v1/providers/${encodeURIComponent(capability)}`,
        ),
    };
  }

  // ── Sandboxed UI plugins ─────────────────────────────────────────────────

  get uiPlugins() {
    return {
      list: (activeOnly = false): Promise<{ data: UiPlugin[] }> =>
        this.request(
          "GET",
          `/v1/ui-plugins${activeOnly ? "?active=true" : ""}`,
        ),

      getBySlug: (slug: string): Promise<{ data: UiPlugin }> =>
        this.request("GET", `/v1/ui-plugins/slug/${encodeURIComponent(slug)}`),

      create: (input: CreateUiPluginParams): Promise<{ data: UiPlugin }> =>
        this.request("PUT", "/v1/ui-plugins", input),

      setStatus: (
        pluginId: string,
        status: "draft" | "active" | "disabled",
      ): Promise<{ data: UiPlugin }> =>
        this.request(
          "PUT",
          `/v1/ui-plugins/${encodeURIComponent(pluginId)}/status`,
          { status },
        ),

      delete: (pluginId: string): Promise<{ deleted: boolean }> =>
        this.request(
          "DELETE",
          `/v1/ui-plugins/${encodeURIComponent(pluginId)}`,
        ),
    };
  }

  // ── Wallets ───────────────────────────────────────────────────────────────

  get wallets() {
    return {
      /** List all wallets for an agent. */
      list: (agentId: string): Promise<AgentWallet[]> =>
        this.request("GET", `/v1/wallets/agent/${agentId}`),

      /** Get the primary active wallet for an agent. */
      primary: (agentId: string): Promise<AgentWallet | null> =>
        this.request("GET", `/v1/wallets/agent/${agentId}/primary`),

      /** Get a specific wallet by ID. */
      get: (walletId: string): Promise<AgentWallet> =>
        this.request("GET", `/v1/wallets/${walletId}`),

      /** Create a new wallet for an agent. */
      create: (params: CreateWalletParams): Promise<AgentWallet> =>
        this.request("POST", "/v1/wallets", params),

      /** Get USDC and native token balance for a wallet. */
      balance: (walletId: string): Promise<WalletBalance> =>
        this.request("GET", `/v1/wallets/${walletId}/balance`),

      /** Transfer USDC or ETH to another address. */
      transfer: (
        walletId: string,
        params: {
          toAddress: string;
          amount: string;
          tokenSymbol?: "USDC" | "ETH";
        },
      ): Promise<{ txHash: string }> =>
        this.request("POST", `/v1/wallets/${walletId}/transfer`, params),

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
        this.request("POST", `/v1/wallets/agent/${agentId}/x402-fetch`, params),

      /** Deactivate a wallet. */
      deactivate: (walletId: string): Promise<void> =>
        this.request("DELETE", `/v1/wallets/${walletId}`),
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
      me: (): Promise<{
        principalId: string | null;
        principalType: string | null;
      }> => this.request("GET", "/v1/auth/me"),
    };
  }

  // ── Developer projects and project API keys ──────────────────────────────

  get developer() {
    return {
      scopes: (): Promise<{ data: string[] }> =>
        this.identityRequest("GET", "/api/platform/scopes"),

      listProjects: (): Promise<{ data: DeveloperProject[] }> =>
        this.identityRequest("GET", "/api/platform/projects"),

      createProject: (params: {
        workspaceId: string;
        name: string;
        environment?: DeveloperProjectEnvironment;
      }): Promise<{ data: DeveloperProject }> =>
        this.identityRequest("POST", "/api/platform/projects", params),

      listApiKeys: (projectId: string): Promise<{ data: DeveloperApiKey[] }> =>
        this.identityRequest(
          "GET",
          `/api/platform/projects/${encodeURIComponent(projectId)}/api-keys`,
        ),

      createApiKey: (
        projectId: string,
        params: {
          name: string;
          scopes?: string[];
          expiresAt?: string | null;
        },
      ): Promise<{ data: CreatedDeveloperApiKey }> =>
        this.identityRequest(
          "POST",
          `/api/platform/projects/${encodeURIComponent(projectId)}/api-keys`,
          params,
        ),

      revokeApiKey: (keyId: string): Promise<void> =>
        this.identityRequest(
          "DELETE",
          `/api/platform/api-keys/${encodeURIComponent(keyId)}`,
        ),
    };
  }

  // ── Legacy principal API keys ─────────────────────────────────────────────

  /**
   * Legacy per-principal keys (`sk-ac-*`).
   *
   * New developer integrations should use `client.developer`, which creates
   * project-scoped `csk_*` keys with explicit environments and scopes.
   */
  get apiKeys() {
    return {
      /**
       * Generate a new API key for a principal (user or agent).
       * The plaintext key is returned only in this response — never again.
       */
      create: (params: CreateApiKeyParams): Promise<CreatedApiKey> =>
        this.request("POST", "/v1/auth/api-keys", params),

      /** List all active API keys for a principal (key values not included). */
      list: (
        principalId: string,
        principalType: ApiKeyPrincipalType,
      ): Promise<ApiKey[]> => {
        const q = new URLSearchParams({
          principalId,
          principalType,
        }).toString();
        return this.request("GET", `/v1/auth/api-keys?${q}`);
      },

      /** Revoke (soft-delete) an API key by its UUID. */
      revoke: (id: string): Promise<{ revoked: boolean }> =>
        this.request("DELETE", `/v1/auth/api-keys/${id}`),
    };
  }

  // ── SSE Streaming internals ───────────────────────────────────────────────

  private async *_streamAgentRun(
    params: RunParams,
  ): AsyncGenerator<StreamEvent> {
    const res = await this._fetch(`${this.baseUrl}/v1/agents/run/stream`, {
      method: "POST",
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
      method: "GET",
      headers: this.headers({ Accept: "text/event-stream" }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }

    yield* this._parseEventStream(res);
  }

  private async *_parseEventStream(res: Response): AsyncGenerator<StreamEvent> {
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") return;
          try {
            const event = JSON.parse(raw) as StreamEvent;
            if (event.type !== "keepalive") yield event;
            if (event.type === "final" || event.type === "completed") return;
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
        this.request("GET", `/.well-known/agent.json?agentId=${agentId}`),

      /** Send a task to an agent (synchronous, waits for completion). */
      sendTask: (
        agentId: string,
        params: A2ASendTaskParams,
      ): Promise<A2ATask> =>
        this.request("POST", `/v1/a2a/${agentId}`, {
          jsonrpc: "2.0",
          id: params.id ?? `sdk-${Date.now()}`,
          method: "tasks/send",
          params,
        }).then((r: any) => r.result as A2ATask),

      /** Get A2A task status. */
      getTask: (agentId: string, taskId: string): Promise<A2ATask> =>
        this.request("POST", `/v1/a2a/${agentId}`, {
          jsonrpc: "2.0",
          id: taskId,
          method: "tasks/get",
          params: { id: taskId },
        }).then((r: any) => r.result as A2ATask),

      /** Cancel a running A2A task. */
      cancelTask: (agentId: string, taskId: string): Promise<A2ATask> =>
        this.request("POST", `/v1/a2a/${agentId}`, {
          jsonrpc: "2.0",
          id: taskId,
          method: "tasks/cancel",
          params: { id: taskId },
        }).then((r: any) => r.result as A2ATask),

      /** List recent A2A tasks for an agent. */
      listTasks: (
        agentId: string,
        limit?: number,
      ): Promise<{ tasks: A2ATask[]; total: number }> =>
        this.request(
          "GET",
          `/v1/a2a/${agentId}/tasks${limit ? `?limit=${limit}` : ""}`,
        ),

      /** Stream A2A task updates (SSE). */
      stream: (agentId: string, taskId: string): AsyncGenerator<StreamEvent> =>
        this._streamSse(`/v1/a2a/${agentId}/tasks/${taskId}/stream`),
    };
  }

  // ── MCP ───────────────────────────────────────────────────────────────────

  get mcp() {
    return {
      /** List MCP servers for an owner. */
      listServers: (
        ownerId: string,
        ownerType: "user" | "agent",
      ): Promise<{ servers: McpServer[]; total: number }> =>
        this.request(
          "GET",
          `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`,
        ),

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
      }): Promise<McpServer> => {
        const { ownerId, ownerType, ...dto } = params;
        return this.request(
          "POST",
          `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`,
          dto,
        );
      },

      /** Get MCP server by ID. */
      getServer: (serverId: string): Promise<McpServer> =>
        this.request("GET", `/v1/mcp/servers/${serverId}`),

      /** Update an MCP server's configuration. */
      updateServer: (
        serverId: string,
        params: Partial<{
          name: string;
          description: string;
          connectionConfig: Record<string, any>;
          isPublic: boolean;
          tags: string[];
        }>,
      ): Promise<McpServer> =>
        this.request("PUT", `/v1/mcp/servers/${serverId}`, params),

      /** Delete an MCP server. */
      deleteServer: (serverId: string): Promise<void> =>
        this.request("DELETE", `/v1/mcp/servers/${serverId}`),

      /** List public MCP servers (marketplace). */
      getMarketplace: (): Promise<{ servers: McpServer[]; total: number }> =>
        this.request("GET", "/v1/mcp/servers/marketplace"),

      /** Get connection status for an MCP server. */
      getServerStatus: (
        serverId: string,
      ): Promise<{
        connected: boolean;
        capabilities: string[];
        toolsDiscovered: number;
        lastConnectedAt: Date | null;
        lastError: string | null;
      }> => this.request("GET", `/v1/mcp/servers/${serverId}/status`),

      /** Connect to an MCP server. */
      connect: (serverId: string): Promise<{ connected: boolean }> =>
        this.request("POST", `/v1/mcp/servers/${serverId}/connect`),

      /** Disconnect from an MCP server. */
      disconnect: (serverId: string): Promise<void> =>
        this.request("POST", `/v1/mcp/servers/${serverId}/disconnect`),

      /** Sync tools + resources + prompts from the MCP server. */
      sync: (
        serverId: string,
      ): Promise<{
        toolsDiscovered: number;
        resourcesDiscovered: number;
        promptsDiscovered: number;
      }> => this.request("POST", `/v1/mcp/servers/${serverId}/sync`, {}),

      /** List tools discovered from an MCP server. */
      listTools: (serverId: string): Promise<{ tools: any[]; total: number }> =>
        this.request("GET", `/v1/mcp/servers/${serverId}/tools`),

      /** List all MCP tools across all servers for a given owner. */
      listToolsByOwner: (
        ownerId: string,
        ownerType: "user" | "agent",
      ): Promise<{ tools: any[] }> =>
        this.request(
          "GET",
          `/v1/mcp/tools?ownerId=${ownerId}&ownerType=${ownerType}`,
        ),

      /** List resources from an MCP server. */
      listResources: (
        serverId: string,
      ): Promise<{ resources: McpResource[]; total: number }> =>
        this.request("GET", `/v1/mcp/servers/${serverId}/resources`),

      /** Read a resource by URI. */
      readResource: (
        serverId: string,
        uri: string,
      ): Promise<{ uri: string; contents: any }> =>
        this.request(
          "GET",
          `/v1/mcp/servers/${serverId}/resources/read?uri=${encodeURIComponent(uri)}`,
        ),

      /** List prompts from an MCP server. */
      listPrompts: (
        serverId: string,
      ): Promise<{ prompts: McpPrompt[]; total: number }> =>
        this.request("GET", `/v1/mcp/servers/${serverId}/prompts`),

      /** Render a prompt with arguments. */
      getPrompt: (
        serverId: string,
        promptName: string,
        args?: Record<string, string>,
      ): Promise<{ description?: string; messages: any[] }> =>
        this.request(
          "POST",
          `/v1/mcp/servers/${serverId}/prompts/${promptName}`,
          { arguments: args },
        ),
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
        if (opts?.type) params.set("type", opts.type);
        if (opts?.limit) params.set("limit", String(opts.limit));
        const qs = params.toString();
        return this.request(
          "GET",
          `/v1/memory/agents/${agentId}${qs ? `?${qs}` : ""}`,
        );
      },

      /** Get memory stats for an agent. */
      stats: (agentId: string): Promise<{ data: MemoryStats }> =>
        this.request("GET", `/v1/memory/agents/${agentId}/stats`),

      /** Retrieve memories most relevant to a query. */
      retrieve: (
        agentId: string,
        query: string,
        limit?: number,
      ): Promise<{ data: AgentMemory[] }> => {
        const params = new URLSearchParams({ q: query });
        if (limit) params.set("limit", String(limit));
        return this.request(
          "GET",
          `/v1/memory/agents/${agentId}/retrieve?${params}`,
        );
      },

      /** Get a single memory by ID. */
      get: (memoryId: string): Promise<{ data: AgentMemory }> =>
        this.request("GET", `/v1/memory/${memoryId}`),

      /** Manually create a memory. */
      create: (params: CreateMemoryParams): Promise<{ data: AgentMemory }> =>
        this.request("POST", "/v1/memory", params),

      /** Update a memory. */
      update: (
        memoryId: string,
        params: UpdateMemoryParams,
      ): Promise<{ data: AgentMemory }> =>
        this.request("PATCH", `/v1/memory/${memoryId}`, params),

      /** Soft-delete (deactivate) a memory. */
      delete: (memoryId: string): Promise<void> =>
        this.request("DELETE", `/v1/memory/${memoryId}`),

      /** Create an append-only memory scope shared by a set of owned agents. */
      createSharedScope: (
        params: CreateSharedMemoryScopeParams,
      ): Promise<{ data: SharedMemoryScope }> =>
        this.request("POST", "/v1/memory/shared-scopes", params),

      /** List shared-memory scopes available to an agent. */
      listSharedScopes: (
        agentId: string,
      ): Promise<{ data: SharedMemoryScope[] }> =>
        this.request("GET", `/v1/memory/shared-scopes/agents/${agentId}`),
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
        if (opts?.from) params.set("from", opts.from);
        if (opts?.to) params.set("to", opts.to);
        const qs = params.toString();
        return this.request(
          "GET",
          `/v1/usage/agents/${agentId}${qs ? `?${qs}` : ""}`,
        );
      },

      /** Get aggregated token + cost usage for a session. */
      getSessionUsage: (
        sessionId: string,
      ): Promise<{ data: UsageAggregation }> =>
        this.request("GET", `/v1/usage/sessions/${sessionId}`),
    };
  }

  // ── Activity and logs ────────────────────────────────────────────────────

  get activity() {
    return {
      list: (filter?: {
        actorId?: string;
        eventType?: string;
        since?: string;
        limit?: number;
      }): Promise<{ data: ActivityEvent[] }> => {
        const query = new URLSearchParams();
        if (filter?.actorId) query.set("actorId", filter.actorId);
        if (filter?.eventType) query.set("eventType", filter.eventType);
        if (filter?.since) query.set("since", filter.since);
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/activity/events${query.size ? `?${query}` : ""}`,
        );
      },
    };
  }

  get logs() {
    return {
      list: (
        agentId: string,
        filter?: { sessionId?: string; limit?: number },
      ): Promise<{ data: AgentLog[] }> => {
        const query = new URLSearchParams();
        if (filter?.sessionId) query.set("sessionId", filter.sessionId);
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/logs/agents/${encodeURIComponent(agentId)}${query.size ? `?${query}` : ""}`,
        );
      },

      observability: (
        agentId: string,
        filter?: { from?: string; to?: string; limit?: number },
      ): Promise<Record<string, unknown>> => {
        const query = new URLSearchParams();
        if (filter?.from) query.set("from", filter.from);
        if (filter?.to) query.set("to", filter.to);
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/logs/agents/${encodeURIComponent(agentId)}/observability${query.size ? `?${query}` : ""}`,
        );
      },
    };
  }

  // ── Files and library ────────────────────────────────────────────────────

  get files() {
    return {
      upload: (
        files: UploadFileInput[],
        params?: {
          agentId?: string;
          sessionId?: string;
          workspaceId?: string;
          storageProvider?: "s3" | "ipfs";
        },
      ): Promise<{ data: FileArtifact[] }> => {
        const body = new FormData();
        for (const file of files) {
          body.append("files", file.data, file.name);
        }
        if (params?.agentId) body.set("agentId", params.agentId);
        if (params?.sessionId) body.set("sessionId", params.sessionId);
        if (params?.workspaceId) body.set("workspaceId", params.workspaceId);
        if (params?.storageProvider)
          body.set("storageProvider", params.storageProvider);
        return this.request("POST", "/v1/files/upload", body);
      },

      get: (
        fileId: string,
        context?: { agentId?: string; sessionId?: string },
      ): Promise<{ data: FileArtifact }> => {
        const query = new URLSearchParams();
        if (context?.agentId) query.set("agentId", context.agentId);
        if (context?.sessionId) query.set("sessionId", context.sessionId);
        return this.request(
          "GET",
          `/v1/files/${encodeURIComponent(fileId)}${query.size ? `?${query}` : ""}`,
        );
      },

      content: (
        fileId: string,
        options?: {
          agentId?: string;
          sessionId?: string;
          offset?: number;
          maxChars?: number;
          includeImageUrls?: boolean;
          includeDownloadUrl?: boolean;
        },
      ): Promise<{ data: FileContent }> => {
        const query = new URLSearchParams();
        if (options?.agentId) query.set("agentId", options.agentId);
        if (options?.sessionId) query.set("sessionId", options.sessionId);
        if (options?.offset !== undefined)
          query.set("offset", String(options.offset));
        if (options?.maxChars !== undefined)
          query.set("maxChars", String(options.maxChars));
        if (options?.includeImageUrls !== undefined)
          query.set("includeImageUrls", String(options.includeImageUrls));
        if (options?.includeDownloadUrl !== undefined)
          query.set("includeDownloadUrl", String(options.includeDownloadUrl));
        return this.request(
          "GET",
          `/v1/files/${encodeURIComponent(fileId)}/content${query.size ? `?${query}` : ""}`,
        );
      },
    };
  }

  get library() {
    return {
      list: (filter?: {
        query?: string;
        view?: string;
        source?: string;
        favorite?: boolean;
        sessionId?: string;
        agentId?: string;
        limit?: number;
        offset?: number;
      }): Promise<{ data: LibraryItem[]; total?: number }> => {
        const query = new URLSearchParams();
        if (filter?.query) query.set("query", filter.query);
        if (filter?.view) query.set("view", filter.view);
        if (filter?.source) query.set("source", filter.source);
        if (filter?.favorite !== undefined)
          query.set("favorite", String(filter.favorite));
        if (filter?.sessionId) query.set("sessionId", filter.sessionId);
        if (filter?.agentId) query.set("agentId", filter.agentId);
        if (filter?.limit !== undefined)
          query.set("limit", String(filter.limit));
        if (filter?.offset !== undefined)
          query.set("offset", String(filter.offset));
        return this.request(
          "GET",
          `/v1/library${query.size ? `?${query}` : ""}`,
        );
      },

      get: (itemId: string): Promise<{ data: LibraryItem }> =>
        this.request("GET", `/v1/library/${encodeURIComponent(itemId)}`),

      download: (itemId: string): Promise<Record<string, unknown>> =>
        this.request(
          "GET",
          `/v1/library/${encodeURIComponent(itemId)}/download`,
        ),

      preview: (itemId: string): Promise<Record<string, unknown>> =>
        this.request(
          "GET",
          `/v1/library/${encodeURIComponent(itemId)}/preview`,
        ),

      update: (
        itemId: string,
        params: {
          name?: string;
          description?: string;
          isFavorite?: boolean;
        },
      ): Promise<{ data: LibraryItem }> =>
        this.request(
          "PATCH",
          `/v1/library/${encodeURIComponent(itemId)}`,
          params,
        ),

      delete: (itemId: string): Promise<{ success?: boolean }> =>
        this.request("DELETE", `/v1/library/${encodeURIComponent(itemId)}`),

      storagePreference: (): Promise<{
        data?: { defaultStorageProvider: "s3" | "ipfs" };
        defaultStorageProvider?: "s3" | "ipfs";
      }> => this.request("GET", "/v1/library/preferences/storage"),

      setStoragePreference: (
        defaultStorageProvider: "s3" | "ipfs",
      ): Promise<{
        data?: { defaultStorageProvider: "s3" | "ipfs" };
        defaultStorageProvider?: "s3" | "ipfs";
      }> =>
        this.request("PATCH", "/v1/library/preferences/storage", {
          defaultStorageProvider,
        }),

      grant: (
        itemId: string,
        params: {
          subjectType: "user" | "agent" | "workspace";
          subjectId: string;
          permission?: "read" | "edit" | "manage";
          expiresAt?: string | null;
        },
      ): Promise<{ data: LibraryGrant }> =>
        this.request(
          "POST",
          `/v1/library/${encodeURIComponent(itemId)}/grants`,
          params,
        ),

      revokeGrant: (
        itemId: string,
        grantId: string,
      ): Promise<{ success?: boolean }> =>
        this.request(
          "DELETE",
          `/v1/library/${encodeURIComponent(itemId)}/grants/${encodeURIComponent(grantId)}`,
        ),

      createShareLink: (
        itemId: string,
        expiresAt?: string | null,
      ): Promise<{ data: LibraryShareLink }> =>
        this.request(
          "POST",
          `/v1/library/${encodeURIComponent(itemId)}/share-links`,
          { expiresAt },
        ),

      revokeShareLink: (
        itemId: string,
        shareId: string,
      ): Promise<{ success?: boolean }> =>
        this.request(
          "DELETE",
          `/v1/library/${encodeURIComponent(itemId)}/share-links/${encodeURIComponent(shareId)}`,
        ),

      resolveShare: (token: string): Promise<{ data: LibraryItem }> =>
        this.request(
          "GET",
          `/v1/shared/artifacts/${encodeURIComponent(token)}`,
        ),
    };
  }

  // ── Knowledge Spaces ────────────────────────────────────────────────────

  get knowledge() {
    const spacePath = (spaceId: string) =>
      `/v1/knowledge/${encodeURIComponent(spaceId)}`;
    const documentPath = (spaceId: string, documentId: string) =>
      `${spacePath(spaceId)}/documents/${encodeURIComponent(documentId)}`;
    return {
      providers: (): Promise<{ data: KnowledgeProviderDefinition[] }> =>
        this.request("GET", "/v1/knowledge/providers"),

      listSpaces: (): Promise<{ data: KnowledgeSpace[] }> =>
        this.request("GET", "/v1/knowledge"),

      createSpace: (params: {
        name: string;
        description?: string;
        provider?: KnowledgeProviderId;
        providerConfig?: Record<string, unknown>;
        color?: string;
        allAgents?: boolean;
        agentIds?: string[];
      }): Promise<{ data: KnowledgeSpace }> =>
        this.request("POST", "/v1/knowledge", params),

      getSpace: (spaceId: string): Promise<{ data: KnowledgeSpace }> =>
        this.request("GET", spacePath(spaceId)),

      updateSpace: (
        spaceId: string,
        params: {
          name?: string;
          description?: string;
          color?: string;
          autoGrantNewAgents?: boolean;
          status?: "active" | "disconnected";
          providerConfig?: Record<string, unknown>;
        },
      ): Promise<{ data: KnowledgeSpace }> =>
        this.request("PATCH", spacePath(spaceId), params),

      deleteSpace: (spaceId: string): Promise<{ deleted: boolean }> =>
        this.request("DELETE", spacePath(spaceId)),

      grant: (
        spaceId: string,
        params: {
          subjectType: "user" | "agent" | "workspace";
          subjectId: string;
          permission?: KnowledgePermission;
          autoRetrieve?: boolean;
        },
      ): Promise<{ data: KnowledgeGrant }> =>
        this.request("POST", `${spacePath(spaceId)}/grants`, params),

      revokeGrant: (
        spaceId: string,
        grantId: string,
      ): Promise<{ revoked: boolean }> =>
        this.request(
          "DELETE",
          `${spacePath(spaceId)}/grants/${encodeURIComponent(grantId)}`,
        ),

      listFolders: (spaceId: string): Promise<{ data: KnowledgeFolder[] }> =>
        this.request("GET", `${spacePath(spaceId)}/folders`),

      createFolder: (
        spaceId: string,
        path: string,
      ): Promise<{ data: KnowledgeFolder }> =>
        this.request("POST", `${spacePath(spaceId)}/folders`, { path }),

      moveFolder: (
        spaceId: string,
        folderId: string,
        path: string,
      ): Promise<{
        data: {
          folder?: KnowledgeFolder;
          movedDocuments: Array<{
            documentId: string;
            fromPath: string;
            path: string;
          }>;
        };
      }> =>
        this.request(
          "PATCH",
          `${spacePath(spaceId)}/folders/${encodeURIComponent(folderId)}`,
          { path },
        ),

      deleteFolder: (
        spaceId: string,
        folderId: string,
      ): Promise<{ deleted: boolean; deletedDocuments: number }> =>
        this.request(
          "DELETE",
          `${spacePath(spaceId)}/folders/${encodeURIComponent(folderId)}`,
        ),

      listDocuments: (
        spaceId: string,
        options?: { query?: string; includeContent?: boolean; limit?: number },
      ): Promise<{ data: KnowledgeDocument[] }> => {
        const query = new URLSearchParams();
        if (options?.query) query.set("query", options.query);
        if (options?.includeContent !== undefined)
          query.set("includeContent", String(options.includeContent));
        if (options?.limit !== undefined)
          query.set("limit", String(options.limit));
        return this.request(
          "GET",
          `${spacePath(spaceId)}/documents${query.size ? `?${query}` : ""}`,
        );
      },

      getDocument: (
        spaceId: string,
        documentId: string,
      ): Promise<{ data: KnowledgeDocument }> =>
        this.request("GET", documentPath(spaceId, documentId)),

      createDocument: (
        spaceId: string,
        params: { path: string; title?: string; content: string },
      ): Promise<{ data: KnowledgeDocument }> =>
        this.request("POST", `${spacePath(spaceId)}/documents`, params),

      updateDocument: (
        spaceId: string,
        documentId: string,
        params: {
          path: string;
          title?: string;
          content: string;
          expectedRevision?: number;
        },
      ): Promise<{ data: KnowledgeDocument }> =>
        this.request("PATCH", documentPath(spaceId, documentId), params),

      deleteDocument: (
        spaceId: string,
        documentId: string,
      ): Promise<{ deleted: boolean }> =>
        this.request("DELETE", documentPath(spaceId, documentId)),

      importMarkdown: (
        spaceId: string,
        documents: Array<{
          path: string;
          title?: string;
          content: string;
          modifiedAt?: string;
        }>,
        folders: string[] = [],
      ): Promise<{
        data: {
          created: number;
          updated: number;
          unchanged: number;
          remoteKept: number;
          folders: number;
          failed: Array<{ path: string; error: string }>;
        };
      }> =>
        this.request("POST", `${spacePath(spaceId)}/import`, {
          documents,
          folders,
        }),

      graph: (spaceId: string): Promise<{ data: KnowledgeGraph }> =>
        this.request("GET", `${spacePath(spaceId)}/graph`),

      search: (params: {
        query: string;
        spaceIds?: string[];
        limit?: number;
      }): Promise<{
        data: {
          query: string;
          algorithm: "hybrid_graph";
          results: KnowledgeSearchResult[];
        };
      }> => {
        const query = new URLSearchParams({ query: params.query });
        if (params.spaceIds?.length)
          query.set("spaceIds", params.spaceIds.join(","));
        if (params.limit !== undefined)
          query.set("limit", String(params.limit));
        return this.request("GET", `/v1/knowledge/search?${query}`);
      },
    };
  }

  // ── Spaces, projects, and goals ──────────────────────────────────────────

  get spaces() {
    return {
      list: (filter?: {
        memberId?: string;
        memberType?: "agent" | "human";
        agentIds?: string[];
        publicOnly?: boolean;
        search?: string;
        includeMembers?: boolean;
        limit?: number;
        offset?: number;
      }): Promise<{
        data: Space[];
        total?: number;
        limit?: number;
        offset?: number;
      }> => {
        const query = new URLSearchParams();
        if (filter?.memberId) query.set("memberId", filter.memberId);
        if (filter?.memberType) query.set("memberType", filter.memberType);
        if (filter?.agentIds?.length)
          query.set("agentIds", filter.agentIds.join(","));
        if (filter?.publicOnly !== undefined)
          query.set("publicOnly", String(filter.publicOnly));
        if (filter?.search) query.set("search", filter.search);
        if (filter?.includeMembers !== undefined)
          query.set("includeMembers", String(filter.includeMembers));
        if (filter?.limit !== undefined)
          query.set("limit", String(filter.limit));
        if (filter?.offset !== undefined)
          query.set("offset", String(filter.offset));
        return this.request(
          "GET",
          `/v1/spaces${query.size ? `?${query}` : ""}`,
        );
      },

      create: (
        params: {
          name: string;
          description?: string;
          sessionId?: string;
          isPublic?: boolean;
          maxMembers?: number;
          image?: string;
          settings?: Record<string, unknown>;
        },
        creator: { id: string; type: "agent" | "human" },
      ): Promise<{ data: Space }> =>
        this.request("POST", "/v1/spaces", params, {
          headers: {
            "x-creator-id": creator.id,
            "x-creator-type": creator.type,
          },
        }),

      get: (spaceId: string): Promise<{ data: Space }> =>
        this.request("GET", `/v1/spaces/${encodeURIComponent(spaceId)}`),

      getFull: (spaceId: string): Promise<{ data: Space }> =>
        this.request("GET", `/v1/spaces/${encodeURIComponent(spaceId)}/full`),

      update: (
        spaceId: string,
        params: Partial<{
          name: string;
          description: string;
          sessionId: string;
          isPublic: boolean;
          maxMembers: number;
          image: string;
          settings: Record<string, unknown>;
        }>,
      ): Promise<{ data: Space }> =>
        this.request(
          "PUT",
          `/v1/spaces/${encodeURIComponent(spaceId)}`,
          params,
        ),

      delete: (spaceId: string): Promise<{ success?: boolean }> =>
        this.request("DELETE", `/v1/spaces/${encodeURIComponent(spaceId)}`),

      issueRtcTicket: (
        spaceId: string,
      ): Promise<{ data: { ticket: string } }> =>
        this.request(
          "POST",
          `/v1/spaces/${encodeURIComponent(spaceId)}/rtc-ticket`,
          {},
        ),

      listMembers: (spaceId: string): Promise<{ data: SpaceMember[] }> =>
        this.request(
          "GET",
          `/v1/spaces/${encodeURIComponent(spaceId)}/members`,
        ),

      addMember: (
        spaceId: string,
        params: {
          memberId: string;
          memberType: "agent" | "human";
          role?: string;
          permissions?: Record<string, unknown>;
        },
      ): Promise<{ data: SpaceMember }> =>
        this.request(
          "POST",
          `/v1/spaces/${encodeURIComponent(spaceId)}/members`,
          params,
        ),

      updateMember: (
        spaceId: string,
        memberId: string,
        memberType: "agent" | "human",
        params: {
          role?: string;
          permissions?: Record<string, unknown>;
          status?: string;
        },
      ): Promise<{ data: SpaceMember }> =>
        this.request(
          "PUT",
          `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}?memberType=${memberType}`,
          params,
        ),

      removeMember: (
        spaceId: string,
        memberId: string,
        memberType: "agent" | "human",
      ): Promise<{ success?: boolean }> =>
        this.request(
          "DELETE",
          `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}?memberType=${memberType}`,
        ),

      listMessages: (
        spaceId: string,
        filter?: { limit?: number; offset?: number; memberId?: string },
      ): Promise<{ data: SpaceMessage[] }> => {
        const query = new URLSearchParams();
        if (filter?.limit !== undefined)
          query.set("limit", String(filter.limit));
        if (filter?.offset !== undefined)
          query.set("offset", String(filter.offset));
        if (filter?.memberId) query.set("memberId", filter.memberId);
        return this.request(
          "GET",
          `/v1/spaces/${encodeURIComponent(spaceId)}/messages${query.size ? `?${query}` : ""}`,
        );
      },

      sendMessage: (
        spaceId: string,
        params: {
          content: string;
          targetType?: "broadcast" | "direct" | "group";
          targetIds?: string[];
          messageType?: string;
          metadata?: Record<string, unknown>;
          sessionId?: string;
        },
        sender: { id: string; type: "agent" | "human" },
      ): Promise<{ data: SpaceMessage }> =>
        this.request(
          "POST",
          `/v1/spaces/${encodeURIComponent(spaceId)}/messages`,
          params,
          {
            headers: {
              "x-sender-id": sender.id,
              "x-sender-type": sender.type,
            },
          },
        ),

      updateMessage: (
        spaceId: string,
        messageId: string,
        params: { content?: string; metadata?: Record<string, unknown> },
      ): Promise<{ data: SpaceMessage }> =>
        this.request(
          "PUT",
          `/v1/spaces/${encodeURIComponent(spaceId)}/messages/${encodeURIComponent(messageId)}`,
          params,
        ),

      deleteMessage: (
        spaceId: string,
        messageId: string,
      ): Promise<{ success?: boolean }> =>
        this.request(
          "DELETE",
          `/v1/spaces/${encodeURIComponent(spaceId)}/messages/${encodeURIComponent(messageId)}`,
        ),
    };
  }

  get projects() {
    const base = (agentId: string) =>
      `/v1/agents/${encodeURIComponent(agentId)}/projects`;
    return {
      list: (agentId: string): Promise<{ data: CodeProject[] }> =>
        this.request("GET", base(agentId)),

      create: (
        agentId: string,
        params: {
          name: string;
          description?: string;
          sessionId?: string;
          files?: CodeProjectFile[];
        },
      ): Promise<{ data: CodeProject }> =>
        this.request("POST", base(agentId), params),

      get: (
        agentId: string,
        projectId: string,
      ): Promise<{ data: CodeProject }> =>
        this.request(
          "GET",
          `${base(agentId)}/${encodeURIComponent(projectId)}`,
        ),

      writeFiles: (
        agentId: string,
        projectId: string,
        files: CodeProjectFile[],
        replace = false,
      ): Promise<{ data: CodeProject }> =>
        this.request(
          "PUT",
          `${base(agentId)}/${encodeURIComponent(projectId)}/files`,
          { files, replace },
        ),

      publish: (
        agentId: string,
        projectId: string,
      ): Promise<{ data: Record<string, unknown> }> =>
        this.request(
          "POST",
          `${base(agentId)}/${encodeURIComponent(projectId)}/publish`,
          {},
        ),

      verify: (
        agentId: string,
        projectId: string,
        actions?: Array<Record<string, unknown>>,
      ): Promise<{ data: Record<string, unknown> }> =>
        this.request(
          "POST",
          `${base(agentId)}/${encodeURIComponent(projectId)}/verify`,
          { actions },
        ),

      exportToComputer: (
        agentId: string,
        projectId: string,
        params?: { directory?: string; sessionId?: string },
      ): Promise<{ data: Record<string, unknown> }> =>
        this.request(
          "POST",
          `${base(agentId)}/${encodeURIComponent(projectId)}/export`,
          params ?? {},
        ),

      exportToGitHub: (
        agentId: string,
        projectId: string,
        params?: { repositoryName?: string; private?: boolean },
      ): Promise<{ data: Record<string, unknown> }> =>
        this.request(
          "POST",
          `${base(agentId)}/${encodeURIComponent(projectId)}/github`,
          params ?? {},
        ),
    };
  }

  get goals() {
    return {
      create: (params: Record<string, unknown>): Promise<{ data: Goal }> =>
        this.request("POST", "/v1/goals", params),

      get: (goalId: string): Promise<{ data: Goal }> =>
        this.request("GET", `/v1/goals/${encodeURIComponent(goalId)}`),

      updateProgress: (
        goalId: string,
        progress: number,
        status: Goal["status"],
      ): Promise<{ data: Goal }> =>
        this.request("PUT", `/v1/goals/${encodeURIComponent(goalId)}`, {
          progress,
          status,
        }),
    };
  }

  // ── Audio and liaison agents ─────────────────────────────────────────────

  get audio() {
    return {
      transcribe: (
        file: UploadFileInput,
        options?: {
          durationMs?: number;
          idempotencyKey?: string;
        },
      ): Promise<{ data: { text: string } }> => {
        const body = new FormData();
        body.append("file", file.data, file.name);
        if (options?.durationMs !== undefined)
          body.set("durationMs", String(options.durationMs));
        return this.request("POST", "/v1/audio/transcriptions", body, {
          headers: options?.idempotencyKey
            ? { "x-idempotency-key": options.idempotencyKey }
            : undefined,
        });
      },
    };
  }

  get liaisons() {
    return {
      create: (params: {
        name: string;
        owner: string;
        externalOwner: string;
        persona?: string;
        instructions?: string;
        externalUrl?: string;
        externalEndpoint?: string;
      }): Promise<{ data: Agent; liaisonKey: string; note: string }> =>
        this.request("POST", "/v1/liaison", params),

      interact: (
        liaisonAgentId: string,
        liaisonKey: string,
        message?: string,
      ): Promise<{ data: unknown }> =>
        this.request(
          "POST",
          "/v1/liaison/interact",
          { liaisonAgentId, message },
          { headers: { "x-api-key": liaisonKey } },
        ),
    };
  }

  // ── Credits ──────────────────────────────────────────────────────────────

  get credits() {
    return {
      balance: (filter?: {
        principalId?: string;
        workspaceId?: string;
      }): Promise<{ data: CreditBalance }> => {
        const params = new URLSearchParams();
        if (filter?.principalId) params.set("principalId", filter.principalId);
        if (filter?.workspaceId) params.set("workspaceId", filter.workspaceId);
        const qs = params.toString();
        return this.request("GET", `/v1/credits/balance${qs ? `?${qs}` : ""}`);
      },

      ledger: (filter?: {
        principalId?: string;
        workspaceId?: string;
        limit?: number;
      }): Promise<{ data: CreditLedgerEntry[] }> => {
        const params = new URLSearchParams();
        if (filter?.principalId) params.set("principalId", filter.principalId);
        if (filter?.workspaceId) params.set("workspaceId", filter.workspaceId);
        if (filter?.limit) params.set("limit", String(filter.limit));
        const qs = params.toString();
        return this.request("GET", `/v1/credits/ledger${qs ? `?${qs}` : ""}`);
      },

      summary: (): Promise<{ data: CreditSummary }> =>
        this.request("GET", "/v1/credits/summary"),

      campaigns: (): Promise<{ data: CreditCampaign[] }> =>
        this.request("GET", "/v1/credits/campaigns"),

      claimCampaign: (params: {
        campaignKey: string;
        eventId?: string;
      }): Promise<{ data: { alreadyClaimed: boolean } }> =>
        this.request("POST", "/v1/credits/campaigns/claim", params),

      transfers: (): Promise<{ data: CreditTransfer[] }> =>
        this.request("GET", "/v1/credits/transfers"),

      gift: (params: {
        recipientPrincipalId: string;
        amount: number;
        message?: string;
        idempotencyKey: string;
      }): Promise<{ data: CreditTransfer }> =>
        this.request("POST", "/v1/credits/gifts", params),

      grant: (
        params: CreditWriteParams,
      ): Promise<{ data: CreditLedgerEntry }> =>
        this.request("POST", "/v1/credits/grants", params),

      debit: (
        params: CreditWriteParams,
      ): Promise<{ data: CreditLedgerEntry }> =>
        this.request("POST", "/v1/credits/debits", params),
    };
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  get billing() {
    return {
      /** Public product catalog served from the backend source of truth. */
      catalog: (): Promise<{ data: BillingCatalog }> =>
        this.request("GET", "/v1/billing/catalog"),

      /** Current plan, status, and entitlements for the caller. */
      subscription: (): Promise<{ data: SubscriptionInfo }> =>
        this.request("GET", "/v1/billing/subscription"),

      /** Entitlements only (what paid features the caller may use). */
      entitlements: (): Promise<{ data: PlanEntitlements }> =>
        this.request("GET", "/v1/billing/entitlements"),

      /** Stripe invoice history for the caller. */
      invoices: (): Promise<{ data: BillingInvoice[] }> =>
        this.request("GET", "/v1/billing/invoices"),

      /** Saved Stripe payment methods for the caller. */
      paymentMethods: (): Promise<{ data: BillingPaymentMethod[] }> =>
        this.request("GET", "/v1/billing/payment-methods"),

      /** Create a Stripe Checkout session for a subscription plan. */
      subscribe: (
        planKey: "plus" | "pro" | "max",
      ): Promise<{ data: { url: string } }> =>
        this.request("POST", "/v1/billing/checkout/subscription", { planKey }),

      /** Create a Stripe Checkout session for a one-time credit top-up. */
      topup: (packKey: string): Promise<{ data: { url: string } }> =>
        this.request("POST", "/v1/billing/checkout/topup", { packKey }),

      /** Open the Stripe billing portal. */
      portal: (): Promise<{ data: { url: string } }> =>
        this.request("POST", "/v1/billing/portal", {}),
    };
  }

  // ── Feature flags ────────────────────────────────────────────────────────

  get flags() {
    return {
      /** Evaluate all active flags for the caller (call once at boot). */
      all: (): Promise<{ data: Record<string, FlagEvaluation> }> =>
        this.request("GET", "/v1/flags"),

      /** Evaluate a single flag for the caller. */
      evaluate: (key: string): Promise<{ data: FlagEvaluation }> =>
        this.request("GET", `/v1/flags/${encodeURIComponent(key)}`),
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
    this.name = "CommonsError";
  }
}
