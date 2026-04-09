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
  CommonsError: () => CommonsError
});
module.exports = __toCommonJS(index_exports);

// src/client.ts
var CommonsClient = class {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
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
      // ── Autonomy / Heartbeat ─────────────────────────────────────────────
      /** Get the current heartbeat/autonomy status for an agent. */
      getAutonomy: (agentId) => this.request("GET", `/v1/agents/${agentId}/autonomy`),
      /** Enable or disable the heartbeat, optionally setting the interval. */
      setAutonomy: (agentId, params) => this.request("PUT", `/v1/agents/${agentId}/autonomy`, params),
      /** Trigger a single heartbeat beat immediately. */
      triggerHeartbeat: (agentId) => this.request("POST", `/v1/agents/${agentId}/autonomy/trigger`)
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
      list: (ownerId, ownerType) => this.request("GET", `/v1/workflows?ownerId=${ownerId}&ownerType=${ownerType}`),
      get: (workflowId) => this.request("GET", `/v1/workflows/${workflowId}`),
      update: (workflowId, updates) => this.request("PUT", `/v1/workflows/${workflowId}`, updates),
      delete: (workflowId) => this.request("DELETE", `/v1/workflows/${workflowId}`),
      execute: (workflowId, params) => this.request("POST", `/v1/workflows/${workflowId}/execute`, params),
      getExecution: (workflowId, executionId) => this.request("GET", `/v1/workflows/${workflowId}/executions/${executionId}`),
      listExecutions: (workflowId, limit) => this.request("GET", `/v1/workflows/${workflowId}/executions${limit ? `?limit=${limit}` : ""}`),
      cancelExecution: (workflowId, executionId) => this.request("POST", `/v1/workflows/${workflowId}/executions/${executionId}/cancel`),
      /** Approve a paused human_approval node and resume execution. */
      approveExecution: (workflowId, executionId, params) => this.request("POST", `/v1/workflows/${workflowId}/executions/${executionId}/approve`, params),
      /** Reject a paused human_approval node and terminate execution. */
      rejectExecution: (workflowId, executionId, params) => this.request("POST", `/v1/workflows/${workflowId}/executions/${executionId}/reject`, params),
      /** Stream execution progress via SSE. Returns an async generator. */
      stream: (workflowId, executionId) => this._streamSse(`/v1/workflows/${workflowId}/executions/${executionId}/stream`)
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
      /** Stream task status updates via SSE. Returns an async generator. */
      stream: (taskId) => this._streamSse(`/v1/tasks/${taskId}/stream`)
    };
  }
  // ── Sessions ──────────────────────────────────────────────────────────────
  get sessions() {
    return {
      list: (agentId, initiatorId) => this.request("GET", `/v1/sessions/list/${agentId}/${initiatorId}`),
      /** List all sessions for a user across all agents. */
      listByUser: (initiator) => this.request("GET", `/v1/sessions/user/${encodeURIComponent(initiator)}`),
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
        if (filter?.isPublic !== void 0) params.set("isPublic", String(filter.isPublic));
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
        const q = new URLSearchParams({ principalId, principalType }).toString();
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
            if (event.type !== "heartbeat") yield event;
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
      listTasks: (agentId, limit) => this.request("GET", `/v1/a2a/${agentId}/tasks${limit ? `?limit=${limit}` : ""}`),
      /** Stream A2A task updates (SSE). */
      stream: (agentId, taskId) => this._streamSse(`/v1/a2a/${agentId}/tasks/${taskId}/stream`)
    };
  }
  // ── MCP ───────────────────────────────────────────────────────────────────
  get mcp() {
    return {
      /** List MCP servers for an owner. */
      listServers: (ownerId, ownerType) => this.request("GET", `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`),
      /** Create a new MCP server. */
      createServer: (params) => {
        const { ownerId, ownerType, ...dto } = params;
        return this.request("POST", `/v1/mcp/servers?ownerId=${ownerId}&ownerType=${ownerType}`, dto);
      },
      /** Get MCP server by ID. */
      getServer: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}`),
      /** Delete an MCP server. */
      deleteServer: (serverId) => this.request("DELETE", `/v1/mcp/servers/${serverId}`),
      /** Connect to an MCP server. */
      connect: (serverId) => this.request("POST", `/v1/mcp/servers/${serverId}/connect`),
      /** Disconnect from an MCP server. */
      disconnect: (serverId) => this.request("POST", `/v1/mcp/servers/${serverId}/disconnect`),
      /** Sync tools + resources + prompts from the MCP server. */
      sync: (serverId) => this.request("POST", `/v1/mcp/servers/${serverId}/sync`, {}),
      /** List tools discovered from an MCP server. */
      listTools: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/tools`),
      /** List all MCP tools across all servers for a given owner. */
      listToolsByOwner: (ownerId, ownerType) => this.request("GET", `/v1/mcp/tools?ownerId=${ownerId}&ownerType=${ownerType}`),
      /** List resources from an MCP server. */
      listResources: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/resources`),
      /** Read a resource by URI. */
      readResource: (serverId, uri) => this.request("GET", `/v1/mcp/servers/${serverId}/resources/read?uri=${encodeURIComponent(uri)}`),
      /** List prompts from an MCP server. */
      listPrompts: (serverId) => this.request("GET", `/v1/mcp/servers/${serverId}/prompts`),
      /** Render a prompt with arguments. */
      getPrompt: (serverId, promptName, args) => this.request("POST", `/v1/mcp/servers/${serverId}/prompts/${promptName}`, { arguments: args })
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
        return this.request("GET", `/v1/memory/agents/${agentId}${qs ? `?${qs}` : ""}`);
      },
      /** Get memory stats for an agent. */
      stats: (agentId) => this.request("GET", `/v1/memory/agents/${agentId}/stats`),
      /** Retrieve memories most relevant to a query. */
      retrieve: (agentId, query, limit) => {
        const params = new URLSearchParams({ q: query });
        if (limit) params.set("limit", String(limit));
        return this.request("GET", `/v1/memory/agents/${agentId}/retrieve?${params}`);
      },
      /** Get a single memory by ID. */
      get: (memoryId) => this.request("GET", `/v1/memory/${memoryId}`),
      /** Manually create a memory. */
      create: (params) => this.request("POST", "/v1/memory", params),
      /** Update a memory. */
      update: (memoryId, params) => this.request("PATCH", `/v1/memory/${memoryId}`, params),
      /** Soft-delete (deactivate) a memory. */
      delete: (memoryId) => this.request("DELETE", `/v1/memory/${memoryId}`)
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
        return this.request("GET", `/v1/usage/agents/${agentId}${qs ? `?${qs}` : ""}`);
      },
      /** Get aggregated token + cost usage for a session. */
      getSessionUsage: (sessionId) => this.request("GET", `/v1/usage/sessions/${sessionId}`)
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CommonsClient,
  CommonsError
});
//# sourceMappingURL=index.cjs.map