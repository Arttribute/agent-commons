import type {
  UiPlugin,
  UiPluginCapabilityGrant,
  UiPluginCapabilityName,
  UiPluginSurfaceType,
} from "./types";

const MAX_REQUEST_BYTES = 32_000;
const MAX_LIST_ITEMS = 100;
const DEFAULT_LIST_ITEMS = 50;
const MAX_STRING_LENGTH = 8_000;

const METHOD_CAPABILITIES = {
  "agents.list": "agents.read",
  "tasks.list": "tasks.read",
  "tasks.create": "tasks.write",
  "tasks.update": "tasks.write",
  "workflows.list": "workflows.read",
  "workflows.execute": "workflows.execute",
  "library.list": "library.read",
  "tools.list": "tools.read",
  "copilot.open": "copilot.prompt",
} as const satisfies Partial<Record<PluginRpcMethod, UiPluginCapabilityName>>;

export type PluginRpcMethod =
  | "agents.list"
  | "tasks.list"
  | "tasks.create"
  | "tasks.update"
  | "workflows.list"
  | "workflows.execute"
  | "library.list"
  | "tools.list"
  | "copilot.open"
  | "navigation.open"
  | "storage.get"
  | "storage.set"
  | "storage.remove"
  | "ui.resize";

export type PluginRpcRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: PluginRpcMethod;
  params: Record<string, unknown>;
};

export type PluginRpcResponse =
  | { jsonrpc: "2.0"; id: string | number; result: unknown }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string };
    };

export type PluginRpcAction = {
  method:
    | "tasks.create"
    | "tasks.update"
    | "workflows.execute"
    | "copilot.open";
  summary: string;
  details: Array<{ label: string; value: string }>;
};

export type PluginRpcPreflight =
  | { ok: true }
  | { ok: false; code: number; message: string };

export type PluginRpcResize = {
  width: number;
  height: number;
};

export type PluginRpcDispatcherOptions = {
  plugin: UiPlugin;
  surface: UiPluginSurfaceType;
  fetcher?: typeof fetch;
  confirmAction: (action: PluginRpcAction) => boolean | Promise<boolean>;
  navigate: (path: string) => void;
  openCopilot: (prompt: string) => void;
  resize?: (
    requested: PluginRpcResize,
  ) => PluginRpcResize | Promise<PluginRpcResize>;
  storage?: {
    get: (key: string) => string | null | Promise<string | null>;
    set: (key: string, value: string) => void | Promise<void>;
    remove: (key: string) => void | Promise<void>;
  };
};

export type PluginRpcLimit = {
  allowed: true;
  release: () => void;
};

export type PluginRpcLimitError = {
  allowed: false;
  message: string;
};

const RPC_METHODS = new Set<PluginRpcMethod>([
  "agents.list",
  "tasks.list",
  "tasks.create",
  "tasks.update",
  "workflows.list",
  "workflows.execute",
  "library.list",
  "tools.list",
  "copilot.open",
  "navigation.open",
  "storage.get",
  "storage.set",
  "storage.remove",
  "ui.resize",
]);

/**
 * Per-frame limiter. A plugin cannot occupy the browser with unbounded fetches
 * or use postMessage as a high-rate IPC channel.
 */
export function createPluginRpcLimiter(options?: {
  maxConcurrent?: number;
  maxPerMinute?: number;
}) {
  const maxConcurrent = options?.maxConcurrent ?? 8;
  const maxPerMinute = options?.maxPerMinute ?? 60;
  let inFlight = 0;
  let recent: number[] = [];

  return {
    begin(now = Date.now()): PluginRpcLimit | PluginRpcLimitError {
      recent = recent.filter((timestamp) => now - timestamp < 60_000);
      if (inFlight >= maxConcurrent) {
        return {
          allowed: false,
          message: "Too many Commons requests are already running.",
        };
      }
      if (recent.length >= maxPerMinute) {
        return {
          allowed: false,
          message: "This app reached its Commons request limit.",
        };
      }
      recent.push(now);
      inFlight += 1;
      let released = false;
      return {
        allowed: true,
        release: () => {
          if (released) return;
          released = true;
          inFlight = Math.max(0, inFlight - 1);
        },
      };
    },
  };
}

export function parsePluginRpcRequest(value: unknown):
  | { ok: true; request: PluginRpcRequest }
  | {
      ok: false;
      id?: string | number;
      code: number;
      message: string;
    } {
  if (!isPlainObject(value)) {
    return { ok: false, code: -32600, message: "Invalid Commons request." };
  }
  const id = parseRpcId(value.id);
  if (id === undefined || value.jsonrpc !== "2.0") {
    return {
      ok: false,
      ...(id === undefined ? {} : { id }),
      code: -32600,
      message: "Invalid Commons request.",
    };
  }
  if (
    typeof value.method !== "string" ||
    !RPC_METHODS.has(value.method as PluginRpcMethod)
  ) {
    return {
      ok: false,
      id,
      code: -32601,
      message: "This Commons method is not available.",
    };
  }
  const params = value.params ?? {};
  if (!isPlainObject(params) || jsonSize(params) > MAX_REQUEST_BYTES) {
    return {
      ok: false,
      id,
      code: -32602,
      message: "Invalid or oversized Commons request parameters.",
    };
  }
  return {
    ok: true,
    request: {
      jsonrpc: "2.0",
      id,
      method: value.method as PluginRpcMethod,
      params,
    },
  };
}

export async function dispatchPluginRpc(
  request: PluginRpcRequest,
  options: PluginRpcDispatcherOptions,
): Promise<PluginRpcResponse> {
  try {
    const result = await dispatch(request, options);
    return { jsonrpc: "2.0", id: request.id, result };
  } catch (cause) {
    const error =
      cause instanceof PluginRpcError
        ? cause
        : new PluginRpcError(
            -32603,
            "The Commons request could not be completed.",
          );
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: { code: error.code, message: error.message },
    };
  }
}

export function pluginCapabilityNames(plugin: UiPlugin) {
  return (plugin.manifest.capabilities ?? []).map((grant) => grant.name);
}

/**
 * Reject requests that the reviewed manifest cannot authorize before showing
 * any confirmation UI. The server repeats these checks against the current
 * active manifest; this client preflight prevents ungranted apps from using
 * confirmation dialogs as a spoofing or nuisance surface.
 */
export function preflightPluginRpcRequest(
  plugin: UiPlugin,
  request: PluginRpcRequest,
): PluginRpcPreflight {
  try {
    const grant = requiredGrant(plugin, request.method);
    if (request.method === "tasks.create") {
      if (grant?.resourceIds?.length) {
        throw new PluginRpcError(
          -32002,
          "This app has a resource-scoped task grant and cannot create new tasks.",
        );
      }
      const body = taskCreateBody(request.params);
      if (body.workflowId) {
        const workflowGrant = plugin.manifest.capabilities?.find(
          (candidate) => candidate.name === "workflows.execute",
        );
        if (!workflowGrant) {
          throw new PluginRpcError(
            -32001,
            "Creating workflow tasks requires the workflows.execute capability.",
          );
        }
        assertResourceAllowed(workflowGrant, body.workflowId);
      }
      if (body.tools?.length) {
        const toolsGrant = plugin.manifest.capabilities?.find(
          (candidate) => candidate.name === "tools.read",
        );
        if (!toolsGrant) {
          throw new PluginRpcError(
            -32001,
            "Assigning tools requires the tools.read capability.",
          );
        }
        body.tools.forEach((toolId) =>
          assertResourceAllowed(toolsGrant, toolId),
        );
      }
    } else if (request.method === "tasks.update") {
      assertResourceAllowed(grant, requiredId(request.params.taskId, "taskId"));
    } else if (request.method === "workflows.execute") {
      assertResourceAllowed(
        grant,
        requiredId(request.params.workflowId, "workflowId"),
      );
    }
    return { ok: true };
  } catch (cause) {
    const error =
      cause instanceof PluginRpcError
        ? cause
        : new PluginRpcError(-32602, "Invalid Commons request.");
    return { ok: false, code: error.code, message: error.message };
  }
}

export function pluginRpcActionForRequest(
  request: PluginRpcRequest,
): PluginRpcAction | null {
  if (request.method === "tasks.create") {
    const body = taskCreateBody(request.params);
    return {
      method: request.method,
      summary: "Create this Commons task?",
      details: actionDetails([
        ["Task", body.title],
        ["Agent", body.agentId],
        ["Description", body.description],
        ["Execution", body.executionMode],
        ["Workflow", body.workflowId],
        ["Scheduled for", body.scheduledFor],
        [
          "Recurring",
          body.isRecurring === undefined
            ? undefined
            : body.isRecurring
              ? "Yes"
              : "No",
        ],
        ["Schedule", body.cronExpression],
        ["Priority", numberText(body.priority)],
        ["Session", body.sessionId ?? "A new task session will be created"],
        ["Dependencies", listText(body.dependsOn)],
        ["Tools", listText(body.tools)],
        ["Tool policy", body.toolConstraintType],
        ["Tool instructions", body.toolInstructions],
        [
          "Timeout",
          body.timeoutMs === undefined ? undefined : `${body.timeoutMs} ms`,
        ],
      ]),
    };
  }
  if (request.method === "tasks.update") {
    const taskId = requiredId(request.params.taskId, "taskId");
    const patch = taskUpdateBody(request.params);
    return {
      method: request.method,
      summary: "Apply these changes to the Commons task?",
      details: actionDetails([
        ["Task", taskId],
        ["Title", patch.title],
        ["Description", patch.description],
        ["Priority", numberText(patch.priority)],
      ]),
    };
  }
  if (request.method === "workflows.execute") {
    const workflowId = requiredId(request.params.workflowId, "workflowId");
    const inputData = safeJsonRecord(request.params.inputData ?? {});
    return {
      method: request.method,
      summary: "Run this Commons workflow now?",
      details: actionDetails([
        ["Workflow", workflowId],
        ["Input", JSON.stringify(inputData, null, 2)],
      ]),
    };
  }
  if (request.method === "copilot.open") {
    const prompt = pluginRpcCopilotPrompt(request);
    return {
      method: request.method,
      summary: "Add this prompt to the Commons Copilot composer?",
      details: actionDetails([["Prompt draft", prompt]]),
    };
  }
  return null;
}

export function pluginRpcCopilotPrompt(request: PluginRpcRequest) {
  if (request.method !== "copilot.open") {
    throw new PluginRpcError(-32602, "A Copilot prompt is required.");
  }
  return requiredString(
    request.params.prompt ?? request.params.text,
    "prompt",
    4_000,
  );
}

export function isHostPluginRpcMethod(method: PluginRpcMethod) {
  return [
    "navigation.open",
    "storage.get",
    "storage.set",
    "storage.remove",
    "ui.resize",
  ].includes(method);
}

export function isSafePluginNavigationPath(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 500 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return false;
  }
  try {
    const parsed = new URL(value, "https://commons.invalid");
    return (
      parsed.origin === "https://commons.invalid" &&
      !parsed.pathname.startsWith("/api") &&
      !parsed.pathname.startsWith("/_next") &&
      !parsed.pathname.startsWith("/auth")
    );
  } catch {
    return false;
  }
}

async function dispatch(
  request: PluginRpcRequest,
  options: PluginRpcDispatcherOptions,
) {
  const fetcher = options.fetcher ?? fetch;
  const grant = requiredGrant(options.plugin, request.method);

  switch (request.method) {
    case "agents.list": {
      const { query, limit } = listParams(request.params);
      const items = collection(await fetchJson(fetcher, "/api/agents"))
        .map(sanitizeAgent)
        .filter(isPresent)
        .filter((item) => resourceAllowed(grant, item.agentId));
      return listResult(
        searchItems(items, query, ["name", "description"]),
        limit,
      );
    }

    case "tasks.list": {
      const { query, limit } = listParams(request.params);
      const status = optionalString(request.params.status, 50);
      const agentId = optionalId(request.params.agentId);
      const items = collection(await fetchJson(fetcher, "/api/tasks"))
        .map(sanitizeTask)
        .filter(isPresent)
        .filter((item) => resourceAllowed(grant, item.taskId))
        .filter((item) => !status || item.status === status)
        .filter((item) => !agentId || item.agentId === agentId);
      return listResult(
        searchItems(items, query, ["title", "description"]),
        limit,
      );
    }

    case "tasks.create": {
      if (grant?.resourceIds?.length) {
        throw new PluginRpcError(
          -32002,
          "This app has a resource-scoped task grant and cannot create new tasks.",
        );
      }
      const body = taskCreateBody(request.params);
      await validateTaskCreateReferences(fetcher, options.plugin, body);
      const accepted = await options.confirmAction(
        pluginRpcActionForRequest(request)!,
      );
      if (!accepted)
        throw new PluginRpcError(-32003, "The user cancelled this action.");
      let sessionId: string | undefined = body.sessionId;
      if (!sessionId) {
        const sessionResult = await fetchJson(fetcher, "/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: body.agentId,
            title: `Task: ${body.title}`,
          }),
        });
        sessionId = optionalId(record(sessionResult).sessionId);
        if (!sessionId) {
          throw new PluginRpcError(
            -32050,
            "Commons could not create a task session.",
          );
        }
      }
      const result = await fetchJson(fetcher, "/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, sessionId }),
      });
      const task = sanitizeTask(record(result));
      if (!task)
        throw new PluginRpcError(-32050, "Commons returned an invalid task.");
      return task;
    }

    case "tasks.update": {
      const taskId = requiredId(request.params.taskId, "taskId");
      assertResourceAllowed(grant, taskId);
      const patch = taskUpdateBody(request.params);
      const accepted = await options.confirmAction(
        pluginRpcActionForRequest(request)!,
      );
      if (!accepted)
        throw new PluginRpcError(-32003, "The user cancelled this action.");
      const result = await fetchJson(
        fetcher,
        `/api/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      const task = sanitizeTask(record(result));
      if (!task)
        throw new PluginRpcError(-32050, "Commons returned an invalid task.");
      return task;
    }

    case "workflows.list": {
      const { query, limit } = listParams(request.params);
      const triggerType = optionalString(request.params.triggerType, 50);
      const items = collection(await fetchJson(fetcher, "/api/workflows"))
        .map(sanitizeWorkflow)
        .filter(isPresent)
        .filter((item) => resourceAllowed(grant, item.workflowId))
        .filter((item) => !triggerType || item.triggerType === triggerType);
      return listResult(
        searchItems(items, query, ["name", "description"]),
        limit,
      );
    }

    case "workflows.execute": {
      const workflowId = requiredId(request.params.workflowId, "workflowId");
      assertResourceAllowed(grant, workflowId);
      const inputData = safeJsonRecord(request.params.inputData ?? {});
      const accepted = await options.confirmAction(
        pluginRpcActionForRequest(request)!,
      );
      if (!accepted)
        throw new PluginRpcError(-32003, "The user cancelled this action.");
      const result = await fetchJson(
        fetcher,
        `/api/workflows/${encodeURIComponent(workflowId)}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputData }),
        },
      );
      return sanitizeWorkflowExecution(record(result), workflowId);
    }

    case "library.list": {
      const { query, limit } = listParams(request.params);
      const search = new URLSearchParams();
      if (query) search.set("query", query);
      const view = optionalEnum(request.params.view, [
        "all",
        "images",
        "documents",
        "media",
        "apps",
      ] as const);
      const source = optionalString(request.params.source, 80);
      const favorite = optionalBoolean(request.params.favorite);
      if (view && view !== "all") search.set("view", view);
      if (source) search.set("source", source);
      if (favorite !== undefined) search.set("favorite", String(favorite));
      const suffix = search.size ? `?${search.toString()}` : "";
      const items = collection(
        await fetchJson(fetcher, `/api/library${suffix}`),
      )
        .map(sanitizeLibraryItem)
        .filter(isPresent)
        .filter((item) => resourceAllowed(grant, item.itemId));
      return listResult(items, limit);
    }

    case "tools.list": {
      const { query, limit } = listParams(request.params);
      const category = optionalString(request.params.category, 80);
      const visibility = optionalString(request.params.visibility, 40);
      const items = collection(await fetchJson(fetcher, "/api/tools"))
        .map(sanitizeTool)
        .filter(isPresent)
        .filter((item) => resourceAllowed(grant, item.toolId))
        .filter((item) => !category || item.category === category)
        .filter((item) => !visibility || item.visibility === visibility);
      return listResult(
        searchItems(items, query, ["name", "description"]),
        limit,
      );
    }

    case "copilot.open": {
      const prompt = pluginRpcCopilotPrompt(request);
      const accepted = await options.confirmAction(
        pluginRpcActionForRequest(request)!,
      );
      if (!accepted)
        throw new PluginRpcError(-32003, "The user cancelled this action.");
      options.openCopilot(prompt);
      return { opened: true };
    }

    case "navigation.open": {
      const path = request.params.path;
      if (!isSafePluginNavigationPath(path)) {
        throw new PluginRpcError(
          -32602,
          "A safe Commons page path is required.",
        );
      }
      options.navigate(path);
      return { opened: true, path };
    }

    case "storage.get": {
      const key = storageKey(request.params.key);
      if (!options.storage) {
        throw new PluginRpcError(-32050, "Plugin storage is unavailable.");
      }
      return { value: await options.storage.get(key) };
    }

    case "storage.set": {
      const key = storageKey(request.params.key);
      const value = requiredString(request.params.value, "value", 8_000);
      if (!options.storage) {
        throw new PluginRpcError(-32050, "Plugin storage is unavailable.");
      }
      await options.storage.set(key, value);
      return { stored: true };
    }

    case "storage.remove": {
      const key = storageKey(request.params.key);
      if (!options.storage) {
        throw new PluginRpcError(-32050, "Plugin storage is unavailable.");
      }
      await options.storage.remove(key);
      return { removed: true };
    }

    case "ui.resize": {
      if (options.surface !== "widget") {
        throw new PluginRpcError(
          -32602,
          "Only widget apps can request a frame resize.",
        );
      }
      const requested = {
        width: boundedInteger(request.params.width, "width", 280, 520),
        height: boundedInteger(request.params.height, "height", 240, 720),
      };
      return options.resize ? options.resize(requested) : requested;
    }
  }
}

function requiredGrant(plugin: UiPlugin, method: PluginRpcMethod) {
  if (method === "navigation.open") {
    if (!plugin.manifest.permissions.includes("navigation")) {
      throw new PluginRpcError(
        -32001,
        "This app was not granted navigation access.",
      );
    }
    return undefined;
  }
  if (method.startsWith("storage.")) {
    if (!plugin.manifest.permissions.includes("storage")) {
      throw new PluginRpcError(
        -32001,
        "This app was not granted storage access.",
      );
    }
    return undefined;
  }
  if (method === "ui.resize") return undefined;
  const capability =
    METHOD_CAPABILITIES[method as keyof typeof METHOD_CAPABILITIES];
  if (!capability)
    throw new PluginRpcError(-32601, "This Commons method is not available.");
  const grant = plugin.manifest.capabilities?.find(
    (candidate) => candidate.name === capability,
  );
  if (!grant) {
    throw new PluginRpcError(
      -32001,
      `This app was not granted the ${capability} capability.`,
    );
  }
  return grant;
}

async function fetchJson(
  fetcher: typeof fetch,
  input: string,
  init?: RequestInit,
) {
  let response: Response;
  try {
    response = await fetcher(input, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
    });
  } catch {
    throw new PluginRpcError(-32050, "Commons is temporarily unavailable.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isPlainObject(payload)
      ? safeErrorMessage(payload.message ?? payload.error)
      : undefined;
    throw new PluginRpcError(
      -32050,
      message || `Commons rejected the request (${response.status}).`,
    );
  }
  return payload;
}

function collection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value) && Array.isArray(value.data)) return value.data;
  return [];
}

function record(value: unknown): Record<string, unknown> {
  if (isPlainObject(value) && isPlainObject(value.data)) return value.data;
  if (isPlainObject(value)) return value;
  return {};
}

function sanitizeAgent(value: unknown) {
  if (!isPlainObject(value)) return null;
  const agentId = optionalId(value.agentId);
  const name = optionalString(value.name, 200);
  if (!agentId || !name) return null;
  return compact({
    agentId,
    name,
    description: optionalString(value.description ?? value.persona, 1_000),
    modelProvider: optionalString(value.modelProvider, 100),
    modelId: optionalString(value.modelId, 200),
    status: optionalString(value.status, 50),
    studioPath: `/studio/agents/${encodeURIComponent(agentId)}`,
  });
}

function sanitizeTask(value: unknown) {
  if (!isPlainObject(value)) return null;
  const taskId = optionalId(value.taskId);
  const title = optionalString(value.title, 300);
  if (!taskId || !title) return null;
  return compact({
    taskId,
    title,
    description: optionalString(value.description, 2_000),
    status: optionalString(value.status, 50),
    progress: optionalNumber(value.progress, 0, 100),
    priority: optionalNumber(value.priority, -100, 100),
    scheduledFor: optionalString(value.scheduledFor, 100),
    nextRunAt: optionalString(value.nextRunAt, 100),
    isRecurring: optionalBoolean(value.isRecurring),
    cronExpression: optionalString(value.cronExpression, 200),
    agentId: optionalId(value.agentId),
    workflowId: optionalId(value.workflowId),
    createdAt: optionalString(value.createdAt, 100),
    updatedAt: optionalString(value.updatedAt, 100),
    studioPath: `/studio/tasks/${encodeURIComponent(taskId)}`,
  });
}

function sanitizeWorkflow(value: unknown) {
  if (!isPlainObject(value)) return null;
  const workflowId = optionalId(value.workflowId);
  const name = optionalString(value.name, 200);
  if (!workflowId || !name) return null;
  const definition = isPlainObject(value.definition)
    ? value.definition
    : undefined;
  return compact({
    workflowId,
    name,
    description: optionalString(value.description, 2_000),
    status: optionalString(value.status, 50),
    category: optionalString(value.category, 100),
    triggerType: optionalString(value.triggerType, 50),
    isTemplate: optionalBoolean(value.isTemplate),
    isPublic: optionalBoolean(value.isPublic),
    tags: stringArray(value.tags, 20, 80),
    nodeCount: Array.isArray(definition?.nodes)
      ? definition.nodes.length
      : undefined,
    createdAt: optionalString(value.createdAt, 100),
    updatedAt: optionalString(value.updatedAt, 100),
    studioPath: `/studio/workflows/${encodeURIComponent(workflowId)}`,
  });
}

function sanitizeWorkflowExecution(
  value: Record<string, unknown>,
  workflowId: string,
) {
  return compact({
    executionId: optionalId(value.executionId),
    workflowId: optionalId(value.workflowId) ?? workflowId,
    status: optionalString(value.status, 50) ?? "started",
    startedAt: optionalString(value.startedAt, 100),
    completedAt: optionalString(value.completedAt, 100),
    currentNode: optionalString(value.currentNode, 200),
    errorMessage: optionalString(value.errorMessage ?? value.error, 500),
  });
}

function sanitizeLibraryItem(value: unknown) {
  if (!isPlainObject(value)) return null;
  const itemId = optionalId(value.itemId);
  const name = optionalString(value.name, 300);
  if (!itemId || !name) return null;
  return compact({
    itemId,
    name,
    description: optionalString(value.description, 2_000),
    kind: optionalString(value.kind, 80),
    mimeType: optionalString(value.mimeType, 200),
    sizeBytes: optionalNumber(value.sizeBytes, 0, Number.MAX_SAFE_INTEGER),
    source: optionalString(value.source, 100),
    status: optionalString(value.status, 50),
    visibility: optionalString(value.visibility, 50),
    sourceAgentId: optionalId(value.sourceAgentId),
    sourceSessionId: optionalId(value.sourceSessionId),
    sessionTitle: optionalString(value.sessionTitle, 300),
    isFavorite: optionalBoolean(value.isFavorite),
    createdAt: optionalString(value.createdAt, 100),
    updatedAt: optionalString(value.updatedAt, 100),
    libraryPath: `/library?item=${encodeURIComponent(itemId)}`,
  });
}

function sanitizeTool(value: unknown) {
  if (!isPlainObject(value)) return null;
  const toolId = optionalId(value.toolId);
  const name = optionalString(value.name, 200);
  if (!toolId || !name) return null;
  return compact({
    toolId,
    name,
    description: optionalString(value.description, 2_000),
    category: optionalString(value.category, 100),
    status: optionalString(value.status, 50),
    visibility: optionalString(value.visibility, 50),
    updatedAt: optionalString(value.updatedAt, 100),
    studioPath: `/studio/tools/${encodeURIComponent(toolId)}`,
  });
}

function taskCreateBody(params: Record<string, unknown>) {
  const title = requiredString(params.title, "title", 300);
  return compact({
    title,
    agentId: requiredId(params.agentId, "agentId"),
    sessionId: optionalId(params.sessionId),
    description: optionalString(params.description, 5_000),
    executionMode: optionalEnum(params.executionMode, [
      "single",
      "workflow",
      "sequential",
    ] as const),
    workflowId: optionalId(params.workflowId),
    scheduledFor: optionalDate(params.scheduledFor),
    isRecurring: optionalBoolean(params.isRecurring),
    cronExpression: optionalString(params.cronExpression, 300),
    priority: optionalNumber(params.priority, -100, 100),
    timeoutMs: optionalNumber(params.timeoutMs, 1_000, 86_400_000),
    dependsOn: idArray(params.dependsOn, 50),
    tools: idArray(params.tools, 50),
    toolConstraintType: optionalEnum(params.toolConstraintType, [
      "hard",
      "soft",
      "none",
    ] as const),
    toolInstructions: optionalString(params.toolInstructions, 5_000),
  });
}

async function validateTaskCreateReferences(
  fetcher: typeof fetch,
  plugin: UiPlugin,
  body: ReturnType<typeof taskCreateBody>,
) {
  const agents = collection(await fetchJson(fetcher, "/api/agents"))
    .map(sanitizeAgent)
    .filter(isPresent);
  if (!agents.some((agent) => agent.agentId === body.agentId)) {
    throw new PluginRpcError(
      -32002,
      "This app cannot create a task for that agent.",
    );
  }

  if (body.sessionId) {
    const sessions = collection(
      await fetchJson(
        fetcher,
        `/api/sessions/list?agentId=${encodeURIComponent(body.agentId)}`,
      ),
    );
    if (
      !sessions.some(
        (session) =>
          isPlainObject(session) && session.sessionId === body.sessionId,
      )
    ) {
      throw new PluginRpcError(
        -32002,
        "This app cannot use that task session.",
      );
    }
  }

  if (body.workflowId) {
    const workflowGrant = plugin.manifest.capabilities?.find(
      (candidate) => candidate.name === "workflows.execute",
    );
    if (!workflowGrant) {
      throw new PluginRpcError(
        -32001,
        "Creating workflow tasks requires the workflows.execute capability.",
      );
    }
    assertResourceAllowed(workflowGrant, body.workflowId);
    const workflows = collection(await fetchJson(fetcher, "/api/workflows"))
      .map(sanitizeWorkflow)
      .filter(isPresent);
    if (
      !workflows.some((workflow) => workflow.workflowId === body.workflowId)
    ) {
      throw new PluginRpcError(-32002, "This app cannot use that workflow.");
    }
  }

  if (body.dependsOn?.length) {
    const tasks = collection(await fetchJson(fetcher, "/api/tasks"))
      .map(sanitizeTask)
      .filter(isPresent);
    const ownedIds = new Set(tasks.map((task) => task.taskId));
    if (body.dependsOn.some((taskId) => !ownedIds.has(taskId))) {
      throw new PluginRpcError(
        -32002,
        "This app cannot depend on a task outside your workspace.",
      );
    }
  }

  if (body.tools?.length) {
    const toolsGrant = plugin.manifest.capabilities?.find(
      (candidate) => candidate.name === "tools.read",
    );
    if (!toolsGrant) {
      throw new PluginRpcError(
        -32001,
        "Assigning tools requires the tools.read capability.",
      );
    }
    const tools = collection(await fetchJson(fetcher, "/api/tools"))
      .map(sanitizeTool)
      .filter(isPresent);
    const ownedIds = new Set(tools.map((tool) => tool.toolId));
    if (
      body.tools.some(
        (toolId) =>
          !resourceAllowed(toolsGrant, toolId) || !ownedIds.has(toolId),
      )
    ) {
      throw new PluginRpcError(
        -32002,
        "This app cannot assign one or more requested tools.",
      );
    }
  }
}

function taskUpdateBody(params: Record<string, unknown>) {
  const body = compact({
    title:
      params.title === undefined
        ? undefined
        : requiredString(params.title, "title", 300),
    description: optionalString(params.description, 5_000),
    priority: optionalNumber(params.priority, -100, 100),
  });
  if (!Object.keys(body).length) {
    throw new PluginRpcError(-32602, "At least one task field is required.");
  }
  return body;
}

function actionDetails(
  entries: Array<[label: string, value: string | undefined]>,
) {
  return entries
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([label, value]) => ({ label, value: boundedPreview(value) }));
}

function boundedPreview(value: string, maximum = 600) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum)}… (${value.length - maximum} more characters)`;
}

function listText(value: string[] | undefined) {
  return value?.length ? value.join(", ") : undefined;
}

function numberText(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function listParams(params: Record<string, unknown>) {
  return {
    query: optionalString(params.query, 200)?.toLocaleLowerCase(),
    limit:
      params.limit === undefined
        ? DEFAULT_LIST_ITEMS
        : boundedInteger(params.limit, "limit", 1, MAX_LIST_ITEMS),
  };
}

function listResult<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), total: items.length };
}

function searchItems<T extends Record<string, unknown>>(
  items: T[],
  query: string | undefined,
  keys: Array<keyof T>,
) {
  if (!query) return items;
  return items.filter((item) =>
    keys.some((key) =>
      String(item[key] ?? "")
        .toLocaleLowerCase()
        .includes(query),
    ),
  );
}

function resourceAllowed(
  grant: UiPluginCapabilityGrant | undefined,
  resourceId: string,
) {
  return !grant?.resourceIds?.length || grant.resourceIds.includes(resourceId);
}

function assertResourceAllowed(
  grant: UiPluginCapabilityGrant | undefined,
  resourceId: string,
) {
  if (!resourceAllowed(grant, resourceId)) {
    throw new PluginRpcError(
      -32002,
      "This app cannot access that Commons resource.",
    );
  }
}

function parseRpcId(value: unknown) {
  if (typeof value === "string" && value.length > 0 && value.length <= 200) {
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  return undefined;
}

function jsonSize(value: unknown) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function safeJsonRecord(value: unknown) {
  if (!isPlainObject(value) || jsonSize(value) > 16_000) {
    throw new PluginRpcError(-32602, "inputData must be a small JSON object.");
  }
  return copySafeJson(value, 0) as Record<string, unknown>;
}

function copySafeJson(value: unknown, depth: number): unknown {
  if (depth > 5)
    throw new PluginRpcError(-32602, "inputData is too deeply nested.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value.slice(0, 2_000);
  if (Array.isArray(value)) {
    if (value.length > 100)
      throw new PluginRpcError(-32602, "inputData is too large.");
    return value.map((item) => copySafeJson(item, depth + 1));
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length > 100)
      throw new PluginRpcError(-32602, "inputData is too large.");
    return Object.fromEntries(
      entries
        .filter(
          ([key]) => !["__proto__", "prototype", "constructor"].includes(key),
        )
        .map(([key, item]) => [
          key.slice(0, 200),
          copySafeJson(item, depth + 1),
        ]),
    );
  }
  throw new PluginRpcError(-32602, "inputData contains an unsupported value.");
}

function requiredId(value: unknown, field: string) {
  const id = optionalId(value);
  if (!id) throw new PluginRpcError(-32602, `${field} is required.`);
  return id;
}

function storageKey(value: unknown) {
  const key = requiredString(value, "key", 120);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(key)) {
    throw new PluginRpcError(
      -32602,
      "Storage keys contain invalid characters.",
    );
  }
  return key;
}

function optionalId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= 200 && !/[\u0000-\u001f]/.test(id)
    ? id
    : undefined;
}

function requiredString(
  value: unknown,
  field: string,
  maximum = MAX_STRING_LENGTH,
) {
  const result = optionalString(value, maximum);
  if (!result) throw new PluginRpcError(-32602, `${field} is required.`);
  return result;
}

function optionalString(value: unknown, maximum = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result ? result.slice(0, maximum) : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, value));
}

function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PluginRpcError(-32602, `${field} must be a number.`);
  }
  return Math.round(Math.min(maximum, Math.max(minimum, value)));
}

function optionalDate(value: unknown) {
  const text = optionalString(value, 100);
  if (!text) return undefined;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) {
    throw new PluginRpcError(-32602, "scheduledFor must be a valid date.");
  }
  return date.toISOString();
}

function optionalEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | undefined {
  return typeof value === "string" && values.includes(value)
    ? value
    : undefined;
}

function stringArray(value: unknown, maximum: number, maxLength: number) {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => optionalString(item, maxLength))
    .filter(isPresent)
    .slice(0, maximum);
}

function idArray(value: unknown, maximum: number) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maximum) {
    throw new PluginRpcError(
      -32602,
      "A resource ID list is invalid or too large.",
    );
  }
  return value.map((item) => requiredId(item, "resource ID"));
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as { [K in keyof T]: Exclude<T[K], undefined> };
}

function safeErrorMessage(value: unknown) {
  const message = optionalString(value, 300);
  if (!message) return undefined;
  if (
    /(password|secret|authorization|api[-_ ]?key|bearer|token)\s*[:=]/i.test(
      message,
    )
  ) {
    return "Commons rejected the request.";
  }
  return message;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

class PluginRpcError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
