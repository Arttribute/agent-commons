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
    this.identityUrl = (config.identityUrl ?? "https://auth.agentcommons.io").replace(/\/api\/auth\/?$/, "").replace(/\/$/, "");
    this.identityToken = config.identityToken;
    this.apiKey = config.apiKey;
    this.initiator = config.initiator;
    this._fetch = config.fetch ?? fetch;
  }
  // ── Helpers ───────────────────────────────────────────────────────────────
  headers(extra, json = true) {
    const h = {};
    if (json) h["Content-Type"] = "application/json";
    if (this.apiKey) h["Authorization"] = `Bearer ${this.apiKey}`;
    if (this.initiator) h["x-initiator"] = this.initiator;
    return { ...h, ...extra };
  }
  /**
   * Call an API route that is not yet represented by a resource namespace.
   * Most applications should use the typed helpers below.
   */
  async request(method, path, body, options = {}) {
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(options.headers, !isFormData),
      body: body === void 0 ? void 0 : isFormData ? body : JSON.stringify(body),
      signal: options.signal
    });
    if (!res.ok) {
      const err = await this.errorPayload(res);
      throw new CommonsError(
        this.errorMessage(err, res.statusText),
        res.status,
        err
      );
    }
    if (res.status === 204) return void 0;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      return await res.text();
    }
    return res.json();
  }
  async errorPayload(res) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("json")) {
      return res.json().catch(() => ({ message: res.statusText }));
    }
    const message = await res.text().catch(() => "");
    return { message: message || res.statusText };
  }
  errorMessage(error, fallback) {
    if (!error || typeof error !== "object") return fallback;
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("error" in error) {
      if (typeof error.error === "string") return error.error;
      if (error.error && typeof error.error === "object" && "message" in error.error && typeof error.error.message === "string") {
        return error.error.message;
      }
    }
    return fallback;
  }
  async identityRequest(method, path, body) {
    const headers = {};
    if (body !== void 0) headers["Content-Type"] = "application/json";
    if (this.identityToken) {
      headers.Authorization = `Bearer ${this.identityToken}`;
    }
    const response = await this._fetch(`${this.identityUrl}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === void 0 ? void 0 : JSON.stringify(body)
    });
    if (!response.ok) {
      const error = await this.errorPayload(response);
      throw new CommonsError(
        this.errorMessage(error, response.statusText),
        response.status,
        error
      );
    }
    if (response.status === 204) return void 0;
    return response.json();
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
      manageRuntimeChannel: (agentId, channel, action, params = {}) => this.request(
        "POST",
        `/v1/agents/${encodeURIComponent(agentId)}/runtime/channels/${encodeURIComponent(channel)}/${encodeURIComponent(action)}`,
        params
      ),
      /** List tools assigned to an agent. */
      listTools: (agentId) => this.request("GET", `/v1/agents/${agentId}/tools`),
      /** Assign a tool to an agent. */
      addTool: (agentId, params) => this.request("POST", `/v1/agents/${agentId}/tools`, params),
      /** Update an agent tool assignment. */
      updateTool: (assignmentId, params) => this.request(
        "PATCH",
        `/v1/agents/tools/${encodeURIComponent(assignmentId)}`,
        params
      ),
      /** Remove a tool assignment from an agent. */
      removeTool: (assignmentId) => this.request(
        "DELETE",
        `/v1/agents/tools/${encodeURIComponent(assignmentId)}`
      ),
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
      /** Resume a streamed run after executing a caller-owned CLI tool. */
      submitCliToolResult: (requestId, result) => this.request("POST", "/v1/agents/cli-tool-result", {
        requestId,
        result
      }),
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
      writeComputerFile: (agentId, params) => this.request(
        "POST",
        `/v1/agents/${encodeURIComponent(agentId)}/computer/files/write`,
        params
      ),
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
      testComputerBrowser: (agentId) => this.request(
        "POST",
        `/v1/agents/${encodeURIComponent(agentId)}/computer/browser/test`,
        {}
      ),
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
      discoverPublic: (filter) => {
        const query = new URLSearchParams();
        if (filter?.category) query.set("category", filter.category);
        if (filter?.tags?.length) query.set("tags", filter.tags.join(","));
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/workflows/public${query.size ? `?${query}` : ""}`
        );
      },
      get: (workflowId) => this.request("GET", `/v1/workflows/${workflowId}`),
      update: (workflowId, updates) => this.request("PUT", `/v1/workflows/${workflowId}`, updates),
      delete: (workflowId) => this.request("DELETE", `/v1/workflows/${workflowId}`),
      fork: (workflowId, params) => this.request(
        "POST",
        `/v1/workflows/${encodeURIComponent(workflowId)}/fork`,
        params
      ),
      getWebhook: (workflowId) => this.request(
        "GET",
        `/v1/workflows/${encodeURIComponent(workflowId)}/webhook`
      ),
      rotateWebhookToken: (workflowId) => this.request(
        "POST",
        `/v1/workflows/${encodeURIComponent(workflowId)}/webhook-token`,
        {}
      ),
      disableWebhook: (workflowId) => this.request(
        "DELETE",
        `/v1/workflows/${encodeURIComponent(workflowId)}/webhook-token`
      ),
      executeWebhook: (token, payload, query) => {
        const search = query ? new URLSearchParams(query).toString() : "";
        return this.request(
          "POST",
          `/v1/workflows/webhooks/${encodeURIComponent(token)}${search ? `?${search}` : ""}`,
          payload
        );
      },
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
      getFull: (sessionId) => this.request("GET", `/v1/sessions/${sessionId}/full`),
      /** Rename a session. */
      rename: (sessionId, title) => this.request(
        "PATCH",
        `/v1/sessions/${encodeURIComponent(sessionId)}`,
        { title }
      ),
      /** Delete a session and its owned session data. */
      delete: (sessionId) => this.request(
        "DELETE",
        `/v1/sessions/${encodeURIComponent(sessionId)}`
      ),
      /** Get the full chat transcript for a session. */
      getChat: (sessionId) => this.request(
        "GET",
        `/v1/agents/sessions/${encodeURIComponent(sessionId)}/chat`
      )
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
      /** Get one OAuth connection. */
      getConnection: (connectionId) => this.request(
        "GET",
        `/v1/oauth/connections/${encodeURIComponent(connectionId)}`
      ),
      /** Update connection metadata or its active status. */
      updateConnection: (connectionId, params) => this.request(
        "PUT",
        `/v1/oauth/connections/${encodeURIComponent(connectionId)}`,
        params
      ),
      /**
       * Start an OAuth connect flow. Returns the authorization URL the user
       * must open in a browser to grant access.
       */
      connect: (params) => this.request("POST", "/v1/oauth/connect", params),
      /** Refresh a connection's access token now. */
      refresh: (connectionId) => this.request(
        "POST",
        `/v1/oauth/connections/${encodeURIComponent(connectionId)}/refresh`
      ),
      /** Check whether a connection's token is valid. */
      test: (connectionId) => this.request(
        "GET",
        `/v1/oauth/connections/${encodeURIComponent(connectionId)}/test`
      ),
      /** Revoke a connection and delete its tokens. */
      revoke: (connectionId) => this.request(
        "DELETE",
        `/v1/oauth/connections/${encodeURIComponent(connectionId)}`
      )
    };
  }
  // ── Tool Keys ─────────────────────────────────────────────────────────────
  get toolKeys() {
    return {
      list: () => this.request("GET", "/v1/tool-keys"),
      create: (params) => this.request("POST", "/v1/tool-keys", params),
      get: (keyId) => this.request(
        "GET",
        `/v1/tool-keys/${encodeURIComponent(keyId)}`
      ),
      updateMetadata: (keyId, params) => this.request(
        "PUT",
        `/v1/tool-keys/${encodeURIComponent(keyId)}/metadata`,
        params
      ),
      updateValue: (keyId, value) => this.request(
        "PUT",
        `/v1/tool-keys/${encodeURIComponent(keyId)}/value`,
        { value }
      ),
      test: (keyId) => this.request(
        "POST",
        `/v1/tool-keys/${encodeURIComponent(keyId)}/test`,
        {}
      ),
      mapToTool: (params) => this.request("POST", "/v1/tool-keys/map", params),
      removeMapping: (mappingId) => this.request(
        "DELETE",
        `/v1/tool-keys/map/${encodeURIComponent(mappingId)}`
      ),
      delete: (keyId) => this.request(
        "DELETE",
        `/v1/tool-keys/${encodeURIComponent(keyId)}`
      )
    };
  }
  // ── Tool Permissions ──────────────────────────────────────────────────────
  get toolPermissions() {
    return {
      /** @deprecated Use listForTool with a tool ID. */
      list: (toolId) => this.request(
        "GET",
        `/v1/tool-permissions/tool/${encodeURIComponent(toolId)}`
      ),
      listForTool: (toolId) => this.request(
        "GET",
        `/v1/tool-permissions/tool/${encodeURIComponent(toolId)}`
      ),
      listForSubject: (subjectId, subjectType) => {
        const query = new URLSearchParams({ subjectId, subjectType });
        return this.request(
          "GET",
          `/v1/tool-permissions/subject?${query}`
        );
      },
      accessibleTools: (subjectId, subjectType) => {
        const query = new URLSearchParams({ subjectId, subjectType });
        return this.request(
          "GET",
          `/v1/tool-permissions/accessible-tools?${query}`
        );
      },
      grant: (params) => this.request("POST", "/v1/tool-permissions/grant", params),
      batchGrant: (params) => this.request("POST", "/v1/tool-permissions/batch-grant", params),
      revoke: (permissionId) => this.request(
        "DELETE",
        `/v1/tool-permissions/${encodeURIComponent(permissionId)}`
      ),
      check: (params) => this.request(
        "GET",
        `/v1/tool-permissions/check?${new URLSearchParams(params)}`
      ),
      checkAgentAccess: (toolId, agentId, userId) => {
        const query = new URLSearchParams({ toolId, agentId });
        if (userId) query.set("userId", userId);
        return this.request(
          "GET",
          `/v1/tool-permissions/check-agent-access?${query}`
        );
      },
      transferOwnership: (params) => this.request(
        "POST",
        "/v1/tool-permissions/transfer-ownership",
        params
      )
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
  // ── Developer projects and project API keys ──────────────────────────────
  get developer() {
    return {
      scopes: () => this.identityRequest("GET", "/api/platform/scopes"),
      listProjects: () => this.identityRequest("GET", "/api/platform/projects"),
      createProject: (params) => this.identityRequest("POST", "/api/platform/projects", params),
      listApiKeys: (projectId) => this.identityRequest(
        "GET",
        `/api/platform/projects/${encodeURIComponent(projectId)}/api-keys`
      ),
      createApiKey: (projectId, params) => this.identityRequest(
        "POST",
        `/api/platform/projects/${encodeURIComponent(projectId)}/api-keys`,
        params
      ),
      revokeApiKey: (keyId) => this.identityRequest(
        "DELETE",
        `/api/platform/api-keys/${encodeURIComponent(keyId)}`
      )
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
  // ── Activity and logs ────────────────────────────────────────────────────
  get activity() {
    return {
      list: (filter) => {
        const query = new URLSearchParams();
        if (filter?.actorId) query.set("actorId", filter.actorId);
        if (filter?.eventType) query.set("eventType", filter.eventType);
        if (filter?.since) query.set("since", filter.since);
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/activity/events${query.size ? `?${query}` : ""}`
        );
      }
    };
  }
  get logs() {
    return {
      list: (agentId, filter) => {
        const query = new URLSearchParams();
        if (filter?.sessionId) query.set("sessionId", filter.sessionId);
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/logs/agents/${encodeURIComponent(agentId)}${query.size ? `?${query}` : ""}`
        );
      },
      observability: (agentId, filter) => {
        const query = new URLSearchParams();
        if (filter?.from) query.set("from", filter.from);
        if (filter?.to) query.set("to", filter.to);
        if (filter?.limit) query.set("limit", String(filter.limit));
        return this.request(
          "GET",
          `/v1/logs/agents/${encodeURIComponent(agentId)}/observability${query.size ? `?${query}` : ""}`
        );
      }
    };
  }
  // ── Files and library ────────────────────────────────────────────────────
  get files() {
    return {
      upload: (files, params) => {
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
      get: (fileId, context) => {
        const query = new URLSearchParams();
        if (context?.agentId) query.set("agentId", context.agentId);
        if (context?.sessionId) query.set("sessionId", context.sessionId);
        return this.request(
          "GET",
          `/v1/files/${encodeURIComponent(fileId)}${query.size ? `?${query}` : ""}`
        );
      },
      content: (fileId, options) => {
        const query = new URLSearchParams();
        if (options?.agentId) query.set("agentId", options.agentId);
        if (options?.sessionId) query.set("sessionId", options.sessionId);
        if (options?.offset !== void 0)
          query.set("offset", String(options.offset));
        if (options?.maxChars !== void 0)
          query.set("maxChars", String(options.maxChars));
        if (options?.includeImageUrls !== void 0)
          query.set("includeImageUrls", String(options.includeImageUrls));
        if (options?.includeDownloadUrl !== void 0)
          query.set("includeDownloadUrl", String(options.includeDownloadUrl));
        return this.request(
          "GET",
          `/v1/files/${encodeURIComponent(fileId)}/content${query.size ? `?${query}` : ""}`
        );
      }
    };
  }
  get library() {
    return {
      list: (filter) => {
        const query = new URLSearchParams();
        if (filter?.query) query.set("query", filter.query);
        if (filter?.view) query.set("view", filter.view);
        if (filter?.source) query.set("source", filter.source);
        if (filter?.favorite !== void 0)
          query.set("favorite", String(filter.favorite));
        if (filter?.sessionId) query.set("sessionId", filter.sessionId);
        if (filter?.limit !== void 0)
          query.set("limit", String(filter.limit));
        if (filter?.offset !== void 0)
          query.set("offset", String(filter.offset));
        return this.request(
          "GET",
          `/v1/library${query.size ? `?${query}` : ""}`
        );
      },
      get: (itemId) => this.request(
        "GET",
        `/v1/library/${encodeURIComponent(itemId)}`
      ),
      download: (itemId) => this.request(
        "GET",
        `/v1/library/${encodeURIComponent(itemId)}/download`
      ),
      preview: (itemId) => this.request(
        "GET",
        `/v1/library/${encodeURIComponent(itemId)}/preview`
      ),
      update: (itemId, params) => this.request(
        "PATCH",
        `/v1/library/${encodeURIComponent(itemId)}`,
        params
      ),
      delete: (itemId) => this.request(
        "DELETE",
        `/v1/library/${encodeURIComponent(itemId)}`
      ),
      storagePreference: () => this.request("GET", "/v1/library/preferences/storage"),
      setStoragePreference: (defaultStorageProvider) => this.request("PATCH", "/v1/library/preferences/storage", {
        defaultStorageProvider
      }),
      grant: (itemId, params) => this.request(
        "POST",
        `/v1/library/${encodeURIComponent(itemId)}/grants`,
        params
      ),
      revokeGrant: (itemId, grantId) => this.request(
        "DELETE",
        `/v1/library/${encodeURIComponent(itemId)}/grants/${encodeURIComponent(grantId)}`
      ),
      createShareLink: (itemId, expiresAt) => this.request(
        "POST",
        `/v1/library/${encodeURIComponent(itemId)}/share-links`,
        { expiresAt }
      ),
      revokeShareLink: (itemId, shareId) => this.request(
        "DELETE",
        `/v1/library/${encodeURIComponent(itemId)}/share-links/${encodeURIComponent(shareId)}`
      ),
      resolveShare: (token) => this.request(
        "GET",
        `/v1/shared/artifacts/${encodeURIComponent(token)}`
      )
    };
  }
  // ── Spaces, projects, and goals ──────────────────────────────────────────
  get spaces() {
    return {
      list: (filter) => {
        const query = new URLSearchParams();
        if (filter?.memberId) query.set("memberId", filter.memberId);
        if (filter?.memberType) query.set("memberType", filter.memberType);
        if (filter?.agentIds?.length)
          query.set("agentIds", filter.agentIds.join(","));
        if (filter?.publicOnly !== void 0)
          query.set("publicOnly", String(filter.publicOnly));
        if (filter?.search) query.set("search", filter.search);
        if (filter?.includeMembers !== void 0)
          query.set("includeMembers", String(filter.includeMembers));
        if (filter?.limit !== void 0)
          query.set("limit", String(filter.limit));
        if (filter?.offset !== void 0)
          query.set("offset", String(filter.offset));
        return this.request(
          "GET",
          `/v1/spaces${query.size ? `?${query}` : ""}`
        );
      },
      create: (params, creator) => this.request("POST", "/v1/spaces", params, {
        headers: {
          "x-creator-id": creator.id,
          "x-creator-type": creator.type
        }
      }),
      get: (spaceId) => this.request(
        "GET",
        `/v1/spaces/${encodeURIComponent(spaceId)}`
      ),
      getFull: (spaceId) => this.request(
        "GET",
        `/v1/spaces/${encodeURIComponent(spaceId)}/full`
      ),
      update: (spaceId, params) => this.request(
        "PUT",
        `/v1/spaces/${encodeURIComponent(spaceId)}`,
        params
      ),
      delete: (spaceId) => this.request(
        "DELETE",
        `/v1/spaces/${encodeURIComponent(spaceId)}`
      ),
      issueRtcTicket: (spaceId) => this.request(
        "POST",
        `/v1/spaces/${encodeURIComponent(spaceId)}/rtc-ticket`,
        {}
      ),
      listMembers: (spaceId) => this.request(
        "GET",
        `/v1/spaces/${encodeURIComponent(spaceId)}/members`
      ),
      addMember: (spaceId, params) => this.request(
        "POST",
        `/v1/spaces/${encodeURIComponent(spaceId)}/members`,
        params
      ),
      updateMember: (spaceId, memberId, memberType, params) => this.request(
        "PUT",
        `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}?memberType=${memberType}`,
        params
      ),
      removeMember: (spaceId, memberId, memberType) => this.request(
        "DELETE",
        `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(memberId)}?memberType=${memberType}`
      ),
      listMessages: (spaceId, filter) => {
        const query = new URLSearchParams();
        if (filter?.limit !== void 0)
          query.set("limit", String(filter.limit));
        if (filter?.offset !== void 0)
          query.set("offset", String(filter.offset));
        if (filter?.memberId) query.set("memberId", filter.memberId);
        return this.request(
          "GET",
          `/v1/spaces/${encodeURIComponent(spaceId)}/messages${query.size ? `?${query}` : ""}`
        );
      },
      sendMessage: (spaceId, params, sender) => this.request(
        "POST",
        `/v1/spaces/${encodeURIComponent(spaceId)}/messages`,
        params,
        {
          headers: {
            "x-sender-id": sender.id,
            "x-sender-type": sender.type
          }
        }
      ),
      updateMessage: (spaceId, messageId, params) => this.request(
        "PUT",
        `/v1/spaces/${encodeURIComponent(spaceId)}/messages/${encodeURIComponent(messageId)}`,
        params
      ),
      deleteMessage: (spaceId, messageId) => this.request(
        "DELETE",
        `/v1/spaces/${encodeURIComponent(spaceId)}/messages/${encodeURIComponent(messageId)}`
      )
    };
  }
  get projects() {
    const base = (agentId) => `/v1/agents/${encodeURIComponent(agentId)}/projects`;
    return {
      list: (agentId) => this.request("GET", base(agentId)),
      create: (agentId, params) => this.request("POST", base(agentId), params),
      get: (agentId, projectId) => this.request(
        "GET",
        `${base(agentId)}/${encodeURIComponent(projectId)}`
      ),
      writeFiles: (agentId, projectId, files, replace = false) => this.request(
        "PUT",
        `${base(agentId)}/${encodeURIComponent(projectId)}/files`,
        { files, replace }
      ),
      publish: (agentId, projectId) => this.request(
        "POST",
        `${base(agentId)}/${encodeURIComponent(projectId)}/publish`,
        {}
      ),
      verify: (agentId, projectId, actions) => this.request(
        "POST",
        `${base(agentId)}/${encodeURIComponent(projectId)}/verify`,
        { actions }
      ),
      exportToComputer: (agentId, projectId, params) => this.request(
        "POST",
        `${base(agentId)}/${encodeURIComponent(projectId)}/export`,
        params ?? {}
      ),
      exportToGitHub: (agentId, projectId, params) => this.request(
        "POST",
        `${base(agentId)}/${encodeURIComponent(projectId)}/github`,
        params ?? {}
      )
    };
  }
  get goals() {
    return {
      create: (params) => this.request("POST", "/v1/goals", params),
      get: (goalId) => this.request("GET", `/v1/goals/${encodeURIComponent(goalId)}`),
      updateProgress: (goalId, progress, status) => this.request(
        "PUT",
        `/v1/goals/${encodeURIComponent(goalId)}`,
        { progress, status }
      )
    };
  }
  // ── Audio and liaison agents ─────────────────────────────────────────────
  get audio() {
    return {
      transcribe: (file, options) => {
        const body = new FormData();
        body.append("file", file.data, file.name);
        if (options?.durationMs !== void 0)
          body.set("durationMs", String(options.durationMs));
        return this.request("POST", "/v1/audio/transcriptions", body, {
          headers: options?.idempotencyKey ? { "x-idempotency-key": options.idempotencyKey } : void 0
        });
      }
    };
  }
  get liaisons() {
    return {
      create: (params) => this.request("POST", "/v1/liaison", params),
      interact: (liaisonAgentId, liaisonKey, message) => this.request(
        "POST",
        "/v1/liaison/interact",
        { liaisonAgentId, message },
        { headers: { "x-api-key": liaisonKey } }
      )
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
      /** Stripe invoice history for the caller. */
      invoices: () => this.request("GET", "/v1/billing/invoices"),
      /** Saved Stripe payment methods for the caller. */
      paymentMethods: () => this.request("GET", "/v1/billing/payment-methods"),
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