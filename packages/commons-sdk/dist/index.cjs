"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CommonsClient: () => CommonsClient,
  CommonsError: () => CommonsError,
  buildWorkflowTemplate: () => buildWorkflowTemplate,
  listWorkflowTemplates: () => listWorkflowTemplates
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var CommonsClient = class {
  constructor(config) {
    this.baseUrl = (config.baseUrl ?? "https://api.agentcommons.io").replace(
      /\/$/,
      ""
    );
    this.apiKey = config.apiKey;
    this.initiator = config.initiator;
    this._fetch = config.fetch ?? fetch;
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  headers(extra) {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    if (this.initiator) h["x-initiator"] = this.initiator;
    return { ...h, ...extra };
  }
  async request(method, path, body) {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body !== void 0 ? JSON.stringify(body) : void 0
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }
    return res.json();
  }
  // ── Models ────────────────────────────────────────────────────────────────
  get models() {
    return {
      /** List all available LLM models from the registry */
      list: () => this.request("GET", "/v1/models")
    };
  }
  // ── Agents ────────────────────────────────────────────────────────────────
  get agents() {
    return {
      create: (params) => this.request("POST", "/v1/agents", params),
      list: (owner) => this.request("GET", `/v1/agents${owner ? `?owner=${owner}` : ""}`),
      get: (agentId) => this.request("GET", `/v1/agents/${agentId}`),
      update: (agentId, params) => this.request("PUT", `/v1/agents/${agentId}`, params),
      getRuntime: (agentId) => this.request("GET", `/v1/agents/${agentId}/runtime`),
      configureRuntime: (agentId, params) => this.request("PUT", `/v1/agents/${agentId}/runtime`, params),
      deployRuntime: (agentId) => this.request("POST", `/v1/agents/${agentId}/runtime/deploy`),
      sleepRuntime: (agentId) => this.request("POST", `/v1/agents/${agentId}/runtime/sleep`),
      restartRuntime: (agentId) => this.request("POST", `/v1/agents/${agentId}/runtime/restart`),
      /** List tools assigned to an agent. */
      listTools: (agentId) => this.request("GET", `/v1/agents/${agentId}/tools`),
      /** Assign a tool to an agent. */
      addTool: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/tools`, params),
      /** Remove a tool assignment from an agent. */
      removeTool: (assignmentId) => this.request("DELETE", `/v1/agents/tools/${assignmentId}`),
      /** Create a liaison agent for an external agent. */
      createLiaison: (params) => this.request("POST", "/v1/liaison", params),
      /**
       * Stream an agent run. Returns an async generator of StreamEvents.
       * Works in Node.js, browsers, and Edge runtimes.
       *
       * @example
       * for await (const event of client.agents.stream({ agentId, messages })) {
       *   if (event.type === 'token') process.stdout.write(event.content ?? '');
       * }
       */
      stream: (params) => this._streamAgentRun(params),
      // ── Heartbeat ─────────────────────────────────────────────────────────
      /** Get the current heartbeat status for an agent. */
      getAutonomy: (agentId) => this.request("GET", `/v1/agents/${agentId}/autonomy`),
      /** Enable or disable the heartbeat, optionally setting the interval. */
      setAutonomy: (agentId, params) => this.request("PUT", `/v1/agents/${agentId}/autonomy`, params),
      /** Trigger a single heartbeat immediately. */
      triggerHeartbeat: (agentId) => this.request("POST", `/v1/agents/${agentId}/autonomy/trigger`),
      /**
       * Manually trigger an agent (fire-and-forget).
       * Requires autonomy to be enabled on the agent.
       */
      trigger: (agentId) => this.request("POST", `/v1/agents/${agentId}/trigger`),
      // ── Knowledgebase ────────────────────────────────────────────────────
      /** Get the knowledgebase entries for an agent. */
      getKnowledgebase: (agentId) => this.request("GET", `/v1/agents/${agentId}/knowledgebase`),
      /** Replace the knowledgebase entries for an agent. */
      updateKnowledgebase: (agentId, knowledgebase) => this.request("PUT", `/v1/agents/${agentId}/knowledgebase`, {
        knowledgebase
      }),
      // ── Preferred Connections ────────────────────────────────────────────
      /** List agents that this agent prefers to collaborate with. */
      getPreferredConnections: (agentId) => this.request("GET", `/v1/agents/${agentId}/preferred-connections`),
      /** Add a preferred agent connection. */
      addPreferredConnection: (agentId, params) => this.request(
        "POST",
        `/v1/agents/${agentId}/preferred-connections`,
        params
      ),
      /** Remove a preferred agent connection by its record ID. */
      removePreferredConnection: (id) => this.request("DELETE", `/v1/agents/preferred-connections/${id}`),
      // ── Computers ────────────────────────────────────────────────────────
      getComputerConfig: (agentId) => this.request("GET", `/v1/agents/${agentId}/computer/config`),
      updateComputerConfig: (agentId, params) => this.request("PUT", `/v1/agents/${agentId}/computer/config`, params),
      /** Get the agent's one persistent cloud computer. */
      getComputer: (agentId, _legacyComputerId) => this.request("GET", `/v1/agents/${agentId}/computer`),
      /** Wake the agent's persistent cloud computer, provisioning it if needed. */
      wakeComputer: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/computer/wake`, params),
      /** Sleep the runtime while preserving the computer's durable workspace. */
      sleepComputer: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/computer/sleep`, params),
      /** Replace the runtime without replacing the persistent computer. */
      restartComputer: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/computer/restart`, params),
      resizeComputer: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/computer/resize`, params),
      execComputer: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/computer/exec`, params),
      readComputerFile: (agentId, pathOrLegacyComputerId, legacyPath) => {
        const path = legacyPath ?? pathOrLegacyComputerId;
        return this.request(
          "GET",
          `/v1/agents/${agentId}/computer/files/read?path=${encodeURIComponent(path)}`
        );
      },
      openComputerBrowser: (agentId, paramsOrLegacyComputerId, legacyParams) => {
        const params = typeof paramsOrLegacyComputerId === "string" ? legacyParams : paramsOrLegacyComputerId;
        if (!params) {
          return Promise.reject(new TypeError("Browser options are required."));
        }
        return this.request(
          "POST",
          `/v1/agents/${agentId}/computer/browser/open`,
          params
        );
      },
      listComputerEvents: (agentId, limitOrLegacyComputerId, legacyLimit) => {
        const limit = typeof limitOrLegacyComputerId === "number" ? limitOrLegacyComputerId : legacyLimit;
        return this.request(
          "GET",
          `/v1/agents/${agentId}/computer/events${limit ? `?limit=${limit}` : ""}`
        );
      },
      // ── Deprecated per-instance compatibility ────────────────────────────
      /** @deprecated Use getComputer. The singleton is returned as a one-item list. */
      listComputers: (agentId, _filter) => {
        return this.request(
          "GET",
          `/v1/agents/${agentId}/computer`
        ).then(({ data }) => ({
          data: data ? [data] : []
        }));
      },
      /** @deprecated Use wakeComputer. Lifecycle, name, and session are ignored. */
      startComputer: (agentId, params) => this.request(
        "POST",
        `/v1/agents/${agentId}/computer/wake`,
        params?.reason ? { reason: params.reason } : void 0
      ),
      /** @deprecated Use getComputer. Computer IDs are ignored. */
      refreshComputer: (agentId, _computerId) => this.request("GET", `/v1/agents/${agentId}/computer`),
      /** @deprecated Use sleepComputer. Computer IDs are ignored. */
      stopComputer: (agentId, _computerId) => this.request("POST", `/v1/agents/${agentId}/computer/sleep`),
      /** @deprecated Use execComputer. Computer IDs are ignored. */
      runComputerCommand: (agentId, paramsOrLegacyComputerId, legacyParams) => {
        const params = typeof paramsOrLegacyComputerId === "string" ? legacyParams : paramsOrLegacyComputerId;
        if (!params) {
          return Promise.reject(new TypeError("Command options are required."));
        }
        return this.request(
          "POST",
          `/v1/agents/${agentId}/computer/exec`,
          params
        );
      },
      // ── TTS Voices ───────────────────────────────────────────────────────
      /**
       * List available TTS voices for a provider.
       * @param provider - 'openai' (default) or 'elevenlabs'
       * @param q - optional search query to filter voices
       */
      listVoices: (provider, q) => {
        const params = new URLSearchParams();
        if (provider) params.set("provider", provider);
        if (q) params.set("q", q);
        const qs = params.toString();
        return this.request(
          "GET",
          `/v1/agents/tts/voices${qs ? `?${qs}` : ""}`
        );
      }
    };
  }
  get copilot() {
    return {
      get: () => this.request("GET", "/v1/copilot"),
      updateSettings: (params) => this.request("PUT", "/v1/copilot/settings", params),
      listChanges: (filter) => {
        const query = new URLSearchParams();
        if (filter?.status) query.set("status", filter.status);
        if (filter?.resourceType)
          query.set("resourceType", filter.resourceType);
        if (filter?.resourceId) query.set("resourceId", filter.resourceId);
        return this.request(
          "GET",
          `/v1/copilot/changes${query.size ? `?${query}` : ""}`
        );
      },
      acceptChange: (changeId) => this.request("POST", `/v1/copilot/changes/${changeId}/accept`),
      rejectChange: (changeId) => this.request("POST", `/v1/copilot/changes/${changeId}/reject`),
      revertChange: (changeId) => this.request("POST", `/v1/copilot/changes/${changeId}/revert`)
    };
  }
  // ── Run (non-streaming) ───────────────────────────────────────────────────
  get run() {
    return {
      once: (params) => this.request("POST", "/v1/agents/run", params)
    };
  }
  // ── Workflows ─────────────────────────────────────────────────────────────
  get workflows() {
    return {
      create: (params) => this.request("POST", "/v1/workflows", params),
      list: (ownerId, ownerType) => this.request(
        "GET",
        `/v1/workflows?ownerId=${ownerId}&ownerType=${ownerType}`
      ),
      get: (workflowId) => this.request("GET", `/v1/workflows/${workflowId}`),
      update: (workflowId, updates) => this.request("PUT", `/v1/workflows/${workflowId}`, updates),
      delete: (workflowId) => this.request("DELETE", `/v1/workflows/${workflowId}`),
      execute: (workflowId, params) => this.request("POST", `/v1/workflows/${workflowId}/execute`, params),
      getExecution: (workflowId, executionId) => this.request(
        "GET",
        `/v1/workflows/${workflowId}/executions/${executionId}`
      ),
      listExecutions: (workflowId, limit) => this.request(
        "GET",
        `/v1/workflows/${workflowId}/executions${limit ? `?limit=${limit}` : ""}`
      ),
      cancelExecution: (workflowId, executionId) => this.request(
        "POST",
        `/v1/workflows/${workflowId}/executions/${executionId}/cancel`
      ),
      /** Approve a paused human_approval node and resume execution. */
      approveExecution: (workflowId, executionId, params) => this.request(
        "POST",
        `/v1/workflows/${workflowId}/executions/${executionId}/approve`,
        params
      ),
      /** Reject a paused human_approval node and terminate execution. */
      rejectExecution: (workflowId, executionId, params) => this.request(
        "POST",
        `/v1/workflows/${workflowId}/executions/${executionId}/reject`,
        params
      ),
      /** Stream execution progress via SSE. Returns an async generator. */
      stream: (workflowId, executionId) => this._streamSse(
        `/v1/workflows/${workflowId}/executions/${executionId}/stream`
      )
    };
  }
  // ── Tasks ─────────────────────────────────────────────────────────────────
  get tasks() {
    return {
      create: (params) => this.request("POST", "/v1/tasks", params),
      list: (filter) => {
        const q = new URLSearchParams(filter).toString();
        return this.request("GET", `/v1/tasks?${q}`);
      },
      get: (taskId) => this.request("GET", `/v1/tasks/${taskId}`),
      execute: (taskId) => this.request("POST", `/v1/tasks/${taskId}/execute`),
      cancel: (taskId) => this.request("POST", `/v1/tasks/${taskId}/cancel`),
      delete: (taskId) => this.request("DELETE", `/v1/tasks/${taskId}`),
      /** Edit human-facing task details (title/description/priority). */
      update: (taskId, params) => this.request("PATCH", `/v1/tasks/${taskId}`, params),
      /** Reschedule a task's upcoming run and/or resize its estimated duration. */
      reschedule: (taskId, params) => this.request("PATCH", `/v1/tasks/${taskId}/schedule`, params),
      /** Stream task status updates via SSE. Returns an async generator. */
      stream: (taskId) => this._streamSse(`/v1/tasks/${taskId}/stream`)
    };
  }
  // ── Sessions ──────────────────────────────────────────────────────────────
  get sessions() {
    return {
      list: (agentId, initiatorId) => this.request("GET", `/v1/sessions/list/${agentId}/${initiatorId}`),
      /** List all sessions for a given agent (all initiators). */
      listByAgent: (agentId) => this.request("GET", `/v1/sessions/agent/${agentId}`),
      /** List all sessions for a user across all agents. */
      listByUser: (initiator) => this.request(
        "GET",
        `/v1/sessions/user/${encodeURIComponent(initiator)}`
      ),
      create: (params) => this.request("POST", "/v1/sessions", params),
      get: (sessionId) => this.request("GET", `/v1/sessions/${sessionId}`),
      /** Get full session with history, tasks, childSessions, and spaces. */
      getFull: (sessionId) => this.request("GET", `/v1/sessions/${sessionId}/full`)
    };
  }
  // ── Tools ─────────────────────────────────────────────────────────────────
  get tools() {
    return {
      list: (filter) => {
        const q = filter ? new URLSearchParams(filter).toString() : "";
        return this.request("GET", `/v1/tools${q ? `?${q}` : ""}`);
      },
      get: (toolId) => this.request("GET", `/v1/tools/${toolId}`),
      create: (params) => this.request("POST", "/v1/tools", params),
      update: (toolId, params) => this.request("PUT", `/v1/tools/${toolId}`, params),
      delete: (toolId) => this.request("DELETE", `/v1/tools/${toolId}`),
      /** List built-in static tools available to all agents. */
      listStatic: () => this.request("GET", "/v1/tools/static")
    };
  }
  // ── OAuth Connections ─────────────────────────────────────────────────────
  get oauth() {
    return {
      /** List OAuth providers available on the platform (Google Workspace, GitHub, …). */
      listProviders: () => this.request("GET", "/v1/oauth/providers"),
      /** Get one provider's details, including its scope groups. */
      getProvider: (providerKey) => this.request(
        "GET",
        `/v1/oauth/providers/${encodeURIComponent(providerKey)}`
      ),
      /**
       * List the caller's OAuth connections (the accounts agents act with).
       * `ownerId` is only needed when authenticating with a management key.
       */
      listConnections: (params) => {
        const q = params ? new URLSearchParams(params).toString() : "";
        return this.request("GET", `/v1/oauth/connections${q ? `?${q}` : ""}`);
      },
      /**
       * Start an OAuth connect flow. Returns the authorization URL the user
       * must open in a browser to grant access.
       */
      connect: (params) => this.request("POST", "/v1/oauth/connect", params),
      /** Refresh a connection's access token now. */
      refresh: (connectionId) => this.request("POST", `/v1/oauth/connections/${connectionId}/refresh`),
      /** Check whether a connection's token is valid. */
      test: (connectionId) => this.request("GET", `/v1/oauth/connections/${connectionId}/test`),
      /** Revoke a connection and delete its tokens. */
      revoke: (connectionId) => this.request("DELETE", `/v1/oauth/connections/${connectionId}`)
    };
  }
  // ── Tool Keys ─────────────────────────────────────────────────────────────
  get toolKeys() {
    return {
      list: (filter) => {
        const q = new URLSearchParams(filter).toString();
        return this.request("GET", `/v1/tool-keys${q ? `?${q}` : ""}`);
      },
      create: (params) => this.request("POST", "/v1/tool-keys", params),
      delete: (keyId) => this.request("DELETE", `/v1/tool-keys/${keyId}`)
    };
  }
  // ── Tool Permissions ──────────────────────────────────────────────────────
  get toolPermissions() {
    return {
      list: (toolId) => {
        const q = toolId ? `?toolId=${toolId}` : "";
        return this.request("GET", `/v1/tool-permissions${q}`);
      },
      grant: (params) => this.request("POST", "/v1/tool-permissions/grant", params),
      revoke: (permissionId) => this.request("DELETE", `/v1/tool-permissions/revoke/${permissionId}`)
    };
  }
  // ── Skills ────────────────────────────────────────────────────────────────
  get skills() {
    return {
      list: (filter) => {
        const params = new URLSearchParams();
        if (filter?.ownerId) params.set("ownerId", filter.ownerId);
        if (filter?.ownerType) params.set("ownerType", filter.ownerType);
        if (filter?.isPublic !== void 0)
          params.set("isPublic", String(filter.isPublic));
        const qs = params.toString();
        return this.request("GET", `/v1/skills${qs ? `?${qs}` : ""}`);
      },
      get: (skillIdOrSlug) => this.request("GET", `/v1/skills/${skillIdOrSlug}`),
      getIndex: (ownerId) => {
        const qs = ownerId ? `?ownerId=${ownerId}` : "";
        return this.request("GET", `/v1/skills/index${qs}`);
      },
      create: (params) => this.request("POST", "/v1/skills", params),
      update: (skillIdOrSlug, updates) => this.request("PUT", `/v1/skills/${skillIdOrSlug}`, updates),
      delete: (skillIdOrSlug) => this.request("DELETE", `/v1/skills/${skillIdOrSlug}`)
    };
  }
  // ── Wallets ───────────────────────────────────────────────────────────────
  get wallets() {
    return {
      /** List all wallets for an agent. */
      list: (agentId) => this.request("GET", `/v1/wallets/agent/${agentId}`),
      /** Get the primary active wallet for an agent. */
      primary: (agentId) => this.request("GET", `/v1/wallets/agent/${agentId}/primary`),
      /** Get a specific wallet by ID. */
      get: (walletId) => this.request("GET", `/v1/wallets/${walletId}`),
      /** Create a new wallet for an agent. */
      create: (params) => this.request("POST", "/v1/wallets", params),
      /** Get USDC and native token balance for a wallet. */
      balance: (walletId) => this.request("GET", `/v1/wallets/${walletId}/balance`),
      /** Transfer USDC or ETH to another address. */
      transfer: (walletId, params) => this.request("POST", `/v1/wallets/${walletId}/transfer`, params),
      /**
       * Proxy an HTTP request through an agent's primary wallet, automatically
       * handling x402 payment challenges.  The wallet signs the payment and
       * retries once if the target responds with HTTP 402.
       */
      x402Fetch: (agentId, params) => this.request("POST", `/v1/wallets/agent/${agentId}/x402-fetch`, params),
      /** Deactivate a wallet. */
      deactivate: (walletId) => this.request("DELETE", `/v1/wallets/${walletId}`)
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
      me: () => this.request("GET", "/v1/auth/me")
    };
  }
  // ── API Keys ──────────────────────────────────────────────────────────────
  get apiKeys() {
    return {
      /**
       * Generate a new API key for a principal (user or agent).
       * The plaintext key is returned only in this response — never again.
       */
      create: (params) => this.request("POST", "/v1/auth/api-keys", params),
      /** List all active API keys for a principal (key values not included). */
      list: (principalId, principalType) => {
        const q = new URLSearchParams({
          principalId,
          principalType
        }).toString();
        return this.request("GET", `/v1/auth/api-keys?${q}`);
      },
      /** Revoke (soft-delete) an API key by its UUID. */
      revoke: (id) => this.request("DELETE", `/v1/auth/api-keys/${id}`)
    };
  }
  // ── SSE Streaming internals ───────────────────────────────────────────────
  async *_streamAgentRun(params) {
    const res = await this._fetch(`${this.baseUrl}/v1/agents/run/stream`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }
    yield* this._parseEventStream(res);
  }
  async *_streamSse(path) {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers({ Accept: "text/event-stream" })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new CommonsError(err.message ?? res.statusText, res.status, err);
    }
    yield* this._parseEventStream(res);
  }
  async *_parseEventStream(res) {
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
            const event = JSON.parse(raw);
            if (event.type !== "keepalive") yield event;
            if (event.type === "final" || event.type === "completed") return;
          } catch {
          }
        }
      }
    }
  }
  // ── A2A ───────────────────────────────────────────────────────────────────
  get a2a() {
    return {
      /** Fetch the A2A Agent Card for an agent. */
      getAgentCard: (agentId) => this.request("GET", `/.well-known/agent.json?agentId=${agentId}`),
      /** Send a task to an agent (synchronous, waits for completion). */
      sendTask: (agentId, params) => this.request("POST", `/v1/a2a/${agentId}`, {
        jsonrpc: "2.0",
        id: params.id ?? `sdk-${Date.now()}`,
        method: "tasks/send",
        params
      }).then((r) => r.result),
      /** Get A2A task status. */
      getTask: (agentId, taskId) => this.request("POST", `/v1/a2a/${agentId}`, {
        jsonrpc: "2.0",
        id: taskId,
        method: "tasks/get",
        params: { id: taskId }
      }).then((r) => r.result),
      /** Cancel a running A2A task. */
      cancelTask: (agentId, taskId) => this.request("POST", `/v1/a2a/${agentId}`, {
        jsonrpc: "2.0",
        id: taskId,
        method: "tasks/cancel",
        params: { id: taskId }
      }).then((r) => r.result),
      /** List recent A2A tasks for an agent. */
      listTasks: (agentId, limit) => this.request(
        "GET",
        `/v1/a2a/${agentId}/tasks${limit ? `?limit=${limit}` : ""}`
      ),
      /** Stream A2A task updates (SSE). */
      stream: (agentId, taskId) => this._streamSse(`/v1/a2a/${agentId}/tasks/${taskId}/stream`)
    };
  }
  // ── MCP ───────────────────────────────────────────────────────────────────
  get mcp() {
    return {
      /** List MCP servers for an owner. */
      listServers: (ownerId, ownerType) => this.request(
        "GET",
        `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`
      ),
      /** Create a new MCP server. */
      createServer: (params) => {
        const { ownerId, ownerType, ...dto } = params;
        return this.request(
          "POST",
          `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`,
          dto
        );
      },
      /** Get MCP server by ID. */
      getServer: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}`),
      /** Update an MCP server's configuration. */
      updateServer: (serverId, params) => this.request("PUT", `/v1/mcp/servers/${serverId}`, params),
      /** Delete an MCP server. */
      deleteServer: (serverId) => this.request("DELETE", `/v1/mcp/servers/${serverId}`),
      /** List public MCP servers (marketplace). */
      getMarketplace: () => this.request("GET", "/v1/mcp/servers/marketplace"),
      /** Get connection status for an MCP server. */
      getServerStatus: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/status`),
      /** Connect to an MCP server. */
      connect: (serverId) => this.request("POST", `/v1/mcp/servers/${serverId}/connect`),
      /** Disconnect from an MCP server. */
      disconnect: (serverId) => this.request("POST", `/v1/mcp/servers/${serverId}/disconnect`),
      /** Sync tools + resources + prompts from the MCP server. */
      sync: (serverId) => this.request("POST", `/v1/mcp/servers/${serverId}/sync`, {}),
      /** List tools discovered from an MCP server. */
      listTools: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/tools`),
      /** List all MCP tools across all servers for a given owner. */
      listToolsByOwner: (ownerId, ownerType) => this.request(
        "GET",
        `/v1/mcp/tools?ownerId=${ownerId}&ownerType=${ownerType}`
      ),
      /** List resources from an MCP server. */
      listResources: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/resources`),
      /** Read a resource by URI. */
      readResource: (serverId, uri) => this.request(
        "GET",
        `/v1/mcp/servers/${serverId}/resources/read?uri=${encodeURIComponent(uri)}`
      ),
      /** List prompts from an MCP server. */
      listPrompts: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/prompts`),
      /** Render a prompt with arguments. */
      getPrompt: (serverId, promptName, args) => this.request(
        "POST",
        `/v1/mcp/servers/${serverId}/prompts/${promptName}`,
        { arguments: args }
      )
    };
  }
  // ── Memory ────────────────────────────────────────────────────────────────
  get memory() {
    return {
      /** List all memories for an agent. */
      list: (agentId, opts) => {
        const params = new URLSearchParams();
        if (opts?.type) params.set("type", opts.type);
        if (opts?.limit) params.set("limit", String(opts.limit));
        const qs = params.toString();
        return this.request(
          "GET",
          `/v1/memory/agents/${agentId}${qs ? `?${qs}` : ""}`
        );
      },
      /** Get memory stats for an agent. */
      stats: (agentId) => this.request("GET", `/v1/memory/agents/${agentId}/stats`),
      /** Retrieve memories most relevant to a query. */
      retrieve: (agentId, query, limit) => {
        const params = new URLSearchParams({ q: query });
        if (limit) params.set("limit", String(limit));
        return this.request(
          "GET",
          `/v1/memory/agents/${agentId}/retrieve?${params}`
        );
      },
      /** Get a single memory by ID. */
      get: (memoryId) => this.request("GET", `/v1/memory/${memoryId}`),
      /** Manually create a memory. */
      create: (params) => this.request("POST", "/v1/memory", params),
      /** Update a memory. */
      update: (memoryId, params) => this.request("PATCH", `/v1/memory/${memoryId}`, params),
      /** Soft-delete (deactivate) a memory. */
      delete: (memoryId) => this.request("DELETE", `/v1/memory/${memoryId}`),
      /** Create an append-only memory scope shared by a set of owned agents. */
      createSharedScope: (params) => this.request("POST", "/v1/memory/shared-scopes", params),
      /** List shared-memory scopes available to an agent. */
      listSharedScopes: (agentId) => this.request("GET", `/v1/memory/shared-scopes/agents/${agentId}`)
    };
  }
  // ── Usage / Observability ─────────────────────────────────────────────────
  get usage() {
    return {
      /** Get aggregated token + cost usage for an agent. */
      getAgentUsage: (agentId, opts) => {
        const params = new URLSearchParams();
        if (opts?.from) params.set("from", opts.from);
        if (opts?.to) params.set("to", opts.to);
        const qs = params.toString();
        return this.request(
          "GET",
          `/v1/usage/agents/${agentId}${qs ? `?${qs}` : ""}`
        );
      },
      /** Get aggregated token + cost usage for a session. */
      getSessionUsage: (sessionId) => this.request("GET", `/v1/usage/sessions/${sessionId}`)
    };
  }
  // ── Credits ──────────────────────────────────────────────────────────────
  get credits() {
    return {
      balance: (filter) => {
        const params = new URLSearchParams();
        if (filter?.principalId) params.set("principalId", filter.principalId);
        if (filter?.workspaceId) params.set("workspaceId", filter.workspaceId);
        const qs = params.toString();
        return this.request("GET", `/v1/credits/balance${qs ? `?${qs}` : ""}`);
      },
      ledger: (filter) => {
        const params = new URLSearchParams();
        if (filter?.principalId) params.set("principalId", filter.principalId);
        if (filter?.workspaceId) params.set("workspaceId", filter.workspaceId);
        if (filter?.limit) params.set("limit", String(filter.limit));
        const qs = params.toString();
        return this.request("GET", `/v1/credits/ledger${qs ? `?${qs}` : ""}`);
      },
      summary: () => this.request("GET", "/v1/credits/summary"),
      campaigns: () => this.request("GET", "/v1/credits/campaigns"),
      claimCampaign: (params) => this.request("POST", "/v1/credits/campaigns/claim", params),
      transfers: () => this.request("GET", "/v1/credits/transfers"),
      gift: (params) => this.request("POST", "/v1/credits/gifts", params),
      grant: (params) => this.request("POST", "/v1/credits/grants", params),
      debit: (params) => this.request("POST", "/v1/credits/debits", params)
    };
  }
  // ── Billing ────────────────────────────────────────────────────────────────
  get billing() {
    return {
      /** Public product catalog served from the backend source of truth. */
      catalog: () => this.request("GET", "/v1/billing/catalog"),
      /** Current plan, status, and entitlements for the caller. */
      subscription: () => this.request("GET", "/v1/billing/subscription"),
      /** Entitlements only (what paid features the caller may use). */
      entitlements: () => this.request("GET", "/v1/billing/entitlements"),
      /** Create a Stripe Checkout session for a subscription plan. */
      subscribe: (planKey) => this.request("POST", "/v1/billing/checkout/subscription", { planKey }),
      /** Create a Stripe Checkout session for a one-time credit top-up. */
      topup: (packKey) => this.request("POST", "/v1/billing/checkout/topup", { packKey }),
      /** Open the Stripe billing portal. */
      portal: () => this.request("POST", "/v1/billing/portal", {})
    };
  }
  // ── Feature flags ────────────────────────────────────────────────────────
  get flags() {
    return {
      /** Evaluate all active flags for the caller (call once at boot). */
      all: () => this.request("GET", "/v1/flags"),
      /** Evaluate a single flag for the caller. */
      evaluate: (key) => this.request("GET", `/v1/flags/${encodeURIComponent(key)}`)
    };
  }
};
var CommonsError = class extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = "CommonsError";
  }
};

// src/workflow-templates.ts
function toolName(prefix, name) {
  return `${prefix}_${name}`.replace(/[^a-zA-Z0-9_]/g, "_");
}
function functionTool(params) {
  return {
    name: params.name,
    displayName: params.displayName,
    description: params.description,
    visibility: "private",
    ownerType: "user",
    category: "public-api",
    tags: params.tags,
    schema: {
      type: "function",
      function: {
        name: params.name,
        description: params.description,
        parameters: {
          type: "object",
          properties: params.properties,
          required: params.required ?? []
        }
      }
    },
    apiSpec: params.apiSpec
  };
}
function listWorkflowTemplates() {
  return [
    {
      name: "country-weather-brief",
      description: "Tool-only workflow using countries.dev and Open-Meteo."
    },
    {
      name: "agent-research-summary",
      description: "Multi-tool workflow with an agent_processor summarization step."
    },
    {
      name: "multi-agent-field-report",
      description: "Multi-tool workflow with two agent_processor nodes."
    },
    {
      name: "workflow-invocation-smoke",
      description: "Parent workflow that invokes another workflow as a workflow node."
    }
  ];
}
function buildWorkflowTemplate(templateName, ctx) {
  switch (templateName) {
    case "country-weather-brief":
      return countryWeatherBrief(ctx);
    case "agent-research-summary":
      return agentResearchSummary(ctx);
    case "multi-agent-field-report":
      return multiAgentFieldReport(ctx);
    case "workflow-invocation-smoke":
      return workflowInvocationSmoke(ctx);
  }
}
function sharedTools(ctx) {
  const countryLookup = functionTool({
    name: toolName(ctx.prefix, "country_lookup"),
    displayName: "countries.dev country search",
    description: "Look up country metadata by country name using countries.dev.",
    tags: ["template", "countries-dev", "public-api"],
    properties: {
      country: {
        type: "string",
        description: 'Country name, for example "Finland" or "Kenya".'
      }
    },
    required: ["country"],
    apiSpec: {
      method: "GET",
      baseUrl: "https://countries.dev",
      path: "/name/{country}",
      authType: "none"
    }
  });
  const weatherForecast = functionTool({
    name: toolName(ctx.prefix, "open_meteo_weather"),
    displayName: "Open-Meteo current weather",
    description: "Get current weather for latitude and longitude using Open-Meteo.",
    tags: ["template", "open-meteo", "public-api", "weather"],
    properties: {
      latitude: { type: "number", description: "Latitude in decimal degrees." },
      longitude: { type: "number", description: "Longitude in decimal degrees." }
    },
    required: ["latitude", "longitude"],
    apiSpec: {
      method: "GET",
      baseUrl: "https://api.open-meteo.com",
      path: "/v1/forecast",
      queryParams: {
        latitude: "{latitude}",
        longitude: "{longitude}",
        current: "temperature_2m,relative_humidity_2m,wind_speed_10m",
        timezone: "auto"
      },
      authType: "none"
    }
  });
  const openLibrarySearch = functionTool({
    name: toolName(ctx.prefix, "open_library_search"),
    displayName: "Open Library search",
    description: "Search books and authors using Open Library.",
    tags: ["template", "open-library", "public-api", "books"],
    properties: {
      query: { type: "string", description: "Book, author, or topic search query." },
      limit: { type: "number", description: "Maximum result count." }
    },
    required: ["query"],
    apiSpec: {
      method: "GET",
      baseUrl: "https://openlibrary.org",
      path: "/search.json",
      queryParams: {
        q: "{query}",
        limit: "{limit}",
        fields: "key,title,author_name,first_publish_year"
      },
      authType: "none"
    }
  });
  const exchangeRate = functionTool({
    name: toolName(ctx.prefix, "frankfurter_exchange_rate"),
    displayName: "Frankfurter exchange rate",
    description: "Get a current exchange rate from USD to another currency using Frankfurter.",
    tags: ["template", "frankfurter", "public-api", "exchange-rate"],
    properties: {
      to: { type: "string", description: 'Target ISO 4217 currency code, for example "JPY".' }
    },
    required: ["to"],
    apiSpec: {
      method: "GET",
      baseUrl: "https://api.frankfurter.dev",
      path: "/v2/rates",
      queryParams: {
        base: "USD",
        quotes: "{to}"
      },
      authType: "none"
    }
  });
  return { countryLookup, weatherForecast, openLibrarySearch, exchangeRate };
}
function countryWeatherDefinition(toolIds) {
  return {
    nodes: [
      { id: "input", type: "input", position: { x: 0, y: 80 } },
      { id: "country", type: "tool", toolId: toolIds.countryLookup, position: { x: 240, y: 20 } },
      { id: "weather", type: "tool", toolId: toolIds.weatherForecast, position: { x: 520, y: 20 } },
      { id: "output", type: "output", position: { x: 820, y: 80 } }
    ],
    edges: [
      {
        id: "input-country",
        source: "input",
        target: "country",
        mapping: { country: "country" }
      },
      {
        id: "country-weather",
        source: "country",
        target: "weather",
        mapping: {
          "0.latlng.0": "latitude",
          "0.latlng.1": "longitude"
        }
      },
      {
        id: "country-output",
        source: "country",
        target: "output",
        mapping: {
          "0.name": "country",
          "0.capital": "capital",
          "0.region": "region",
          "0.population": "population"
        }
      },
      {
        id: "weather-output",
        source: "weather",
        target: "output",
        mapping: {
          "current.temperature_2m": "temperatureC",
          "current.relative_humidity_2m": "humidityPercent",
          "current.wind_speed_10m": "windSpeedKph",
          timezone: "timezone"
        }
      }
    ],
    startNodeId: "input",
    endNodeId: "output"
  };
}
function countryWeatherBrief(ctx) {
  const tools = sharedTools(ctx);
  return {
    name: `${ctx.prefix} Country Weather Brief`,
    description: "Tool-only workflow: country metadata plus current Open-Meteo weather.",
    category: "template",
    tags: ["template", "tool-workflow", "public-api"],
    tools: [
      { key: "countryLookup", payload: tools.countryLookup },
      { key: "weatherForecast", payload: tools.weatherForecast }
    ],
    buildDefinition: (toolIds) => countryWeatherDefinition(toolIds),
    sampleInput: { country: "Finland" }
  };
}
function agentResearchSummary(ctx) {
  const tools = sharedTools(ctx);
  return {
    name: `${ctx.prefix} Agent Research Summary`,
    description: "Multi-tool workflow with an agent_processor that summarizes country and book-search data.",
    category: "template",
    tags: ["template", "agent-processor", "public-api"],
    tools: [
      { key: "countryLookup", payload: tools.countryLookup },
      { key: "openLibrarySearch", payload: tools.openLibrarySearch }
    ],
    buildDefinition: (toolIds, buildCtx) => ({
      nodes: [
        { id: "input", type: "input", position: { x: 0, y: 100 } },
        { id: "country", type: "tool", toolId: toolIds.countryLookup, position: { x: 240, y: 20 } },
        { id: "books", type: "tool", toolId: toolIds.openLibrarySearch, position: { x: 240, y: 180 } },
        {
          id: "analyst",
          type: "agent_processor",
          position: { x: 560, y: 100 },
          config: {
            agentId: buildCtx.agentId,
            prompt: "Create a concise research note from the country metadata and book search results. Include practical context and cite only the data available in the input."
          }
        },
        { id: "output", type: "output", position: { x: 860, y: 100 } }
      ],
      edges: [
        { id: "input-country", source: "input", target: "country", mapping: { country: "country" } },
        { id: "input-books", source: "input", target: "books", mapping: { query: "query", limit: "limit" } },
        { id: "country-analyst", source: "country", target: "analyst", mapping: { "0": "countryData" } },
        { id: "books-analyst", source: "books", target: "analyst", mapping: { docs: "books" } },
        { id: "analyst-output", source: "analyst", target: "output", mapping: { result: "summary" } }
      ],
      startNodeId: "input",
      endNodeId: "output"
    }),
    sampleInput: { country: "Kenya", query: "Kenyan history", limit: 5 }
  };
}
function multiAgentFieldReport(ctx) {
  const tools = sharedTools(ctx);
  return {
    name: `${ctx.prefix} Multi-Agent Field Report`,
    description: "Multi-agent, multi-tool workflow with a researcher agent and reviewer agent.",
    category: "template",
    tags: ["template", "multi-agent", "multi-tool", "public-api"],
    tools: [
      { key: "countryLookup", payload: tools.countryLookup },
      { key: "weatherForecast", payload: tools.weatherForecast },
      { key: "exchangeRate", payload: tools.exchangeRate }
    ],
    buildDefinition: (toolIds, buildCtx) => ({
      nodes: [
        { id: "input", type: "input", position: { x: 0, y: 120 } },
        { id: "country", type: "tool", toolId: toolIds.countryLookup, position: { x: 230, y: 20 } },
        { id: "weather", type: "tool", toolId: toolIds.weatherForecast, position: { x: 500, y: 20 } },
        { id: "exchange-rate", type: "tool", toolId: toolIds.exchangeRate, position: { x: 230, y: 240 } },
        {
          id: "researcher",
          type: "agent_processor",
          position: { x: 760, y: 80 },
          config: {
            agentId: buildCtx.agentId,
            prompt: "Draft a compact field report from the country, weather, and exchange-rate data. Use clear sections and do not invent facts."
          }
        },
        {
          id: "reviewer",
          type: "agent_processor",
          position: { x: 1060, y: 80 },
          config: {
            agentId: buildCtx.reviewerAgentId ?? buildCtx.agentId,
            prompt: "Review the draft field report for clarity, unsupported claims, and operational usefulness. Return the improved final report."
          }
        },
        { id: "output", type: "output", position: { x: 1360, y: 120 } }
      ],
      edges: [
        { id: "input-country", source: "input", target: "country", mapping: { country: "country" } },
        { id: "country-weather", source: "country", target: "weather", mapping: { "0.latlng.0": "latitude", "0.latlng.1": "longitude" } },
        { id: "country-exchange-rate", source: "country", target: "exchange-rate", mapping: { "0.currencies.0.code": "to" } },
        { id: "country-researcher", source: "country", target: "researcher", mapping: { "0": "countryData" } },
        { id: "weather-researcher", source: "weather", target: "researcher", mapping: { current: "weather" } },
        { id: "exchange-rate-researcher", source: "exchange-rate", target: "researcher", mapping: { "0": "exchangeRate" } },
        { id: "researcher-reviewer", source: "researcher", target: "reviewer", mapping: { result: "draftReport" } },
        { id: "reviewer-output", source: "reviewer", target: "output", mapping: { result: "finalReport" } }
      ],
      startNodeId: "input",
      endNodeId: "output"
    }),
    sampleInput: { country: "Japan" }
  };
}
function workflowInvocationSmoke(ctx) {
  return {
    name: `${ctx.prefix} Workflow Invocation Smoke`,
    description: "Parent workflow template that expects a child workflowId and invokes it as a workflow node.",
    category: "template",
    tags: ["template", "workflow-invocation"],
    tools: [],
    buildDefinition: (_toolIds, buildCtx) => ({
      nodes: [
        { id: "input", type: "input", position: { x: 0, y: 80 } },
        {
          id: "child-workflow",
          type: "workflow",
          position: { x: 280, y: 80 },
          config: {
            workflowId: buildCtx.childWorkflowId,
            timeoutMs: 9e4
          }
        },
        { id: "output", type: "output", position: { x: 620, y: 80 } }
      ],
      edges: [
        { id: "input-child", source: "input", target: "child-workflow" },
        { id: "child-output", source: "child-workflow", target: "output", mapping: { result: "childResult", executionId: "childExecutionId" } }
      ],
      startNodeId: "input",
      endNodeId: "output"
    }),
    sampleInput: { country: "Finland" }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CommonsClient,
  CommonsError,
  buildWorkflowTemplate,
  listWorkflowTemplates
});
//# sourceMappingURL=index.cjs.map