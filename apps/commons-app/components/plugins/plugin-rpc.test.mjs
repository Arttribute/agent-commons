import assert from "node:assert/strict";
import test from "node:test";

import {
  createPluginRpcLimiter,
  dispatchPluginRpc,
  parsePluginRpcRequest,
  pluginRpcActionForRequest,
  pluginRpcCopilotPrompt,
  preflightPluginRpcRequest,
} from "./plugin-rpc.ts";

function request(method, params = {}, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function plugin({ capabilities = [], permissions = [] } = {}) {
  return {
    pluginId: "plugin-a",
    name: "Test app",
    slug: "test-app",
    version: "1.0.0",
    entryUrl: "https://plugins.example.test/app",
    deploymentId: "deployment-a",
    status: "active",
    manifest: {
      schemaVersion: "2",
      surfaces: [{ type: "page" }],
      permissions,
      capabilities,
    },
    updatedAt: "2026-08-23T00:00:00.000Z",
  };
}

function options(app, overrides = {}) {
  return {
    plugin: app,
    surface: "page",
    confirmAction: async () => true,
    navigate: () => undefined,
    openCopilot: () => undefined,
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertRpcError(response, code, message) {
  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 1,
    error: { code, message },
  });
}

test("parsePluginRpcRequest rejects unknown methods and oversized parameters", () => {
  assert.deepEqual(parsePluginRpcRequest(request("admin.delete", {})), {
    ok: false,
    id: 1,
    code: -32601,
    message: "This Commons method is not available.",
  });

  assert.deepEqual(
    parsePluginRpcRequest(request("tasks.list", { query: "x".repeat(33_000) })),
    {
      ok: false,
      id: 1,
      code: -32602,
      message: "Invalid or oversized Commons request parameters.",
    },
  );
});

test("capability checks happen before a protected API is called", async () => {
  let fetches = 0;
  const response = await dispatchPluginRpc(
    request("tasks.list"),
    options(plugin(), {
      fetcher: async () => {
        fetches += 1;
        return jsonResponse([]);
      },
    }),
  );

  assertRpcError(
    response,
    -32001,
    "This app was not granted the tasks.read capability.",
  );
  assert.equal(fetches, 0);
});

test("client preflight rejects unauthorized mutations before confirmation", () => {
  assert.deepEqual(
    preflightPluginRpcRequest(
      plugin(),
      request("tasks.create", { title: "New task", agentId: "agent-1" }),
    ),
    {
      ok: false,
      code: -32001,
      message: "This app was not granted the tasks.write capability.",
    },
  );

  assert.deepEqual(
    preflightPluginRpcRequest(
      plugin({
        capabilities: [{ name: "tasks.write", resourceIds: ["task-allowed"] }],
      }),
      request("tasks.update", {
        taskId: "task-hidden",
        title: "Changed",
      }),
    ),
    {
      ok: false,
      code: -32002,
      message: "This app cannot access that Commons resource.",
    },
  );

  assert.deepEqual(
    preflightPluginRpcRequest(
      plugin({ capabilities: [{ name: "tasks.write" }] }),
      request("tasks.create", {
        title: "Run workflow",
        agentId: "agent-1",
        workflowId: "workflow-1",
      }),
    ),
    {
      ok: false,
      code: -32001,
      message:
        "Creating workflow tasks requires the workflows.execute capability.",
    },
  );
});

test("confirmation actions expose exact bounded mutation details", () => {
  assert.deepEqual(
    pluginRpcActionForRequest(
      request("tasks.create", {
        title: "Weekly review",
        agentId: "agent-1",
        description: "Summarize active work",
        scheduledFor: "2026-08-30T09:00:00+03:00",
        isRecurring: true,
        cronExpression: "0 9 * * 1",
        tools: ["github", "calendar"],
      }),
    ),
    {
      method: "tasks.create",
      summary: "Create this Commons task?",
      details: [
        { label: "Task", value: "Weekly review" },
        { label: "Agent", value: "agent-1" },
        { label: "Description", value: "Summarize active work" },
        { label: "Scheduled for", value: "2026-08-30T06:00:00.000Z" },
        { label: "Recurring", value: "Yes" },
        { label: "Schedule", value: "0 9 * * 1" },
        { label: "Session", value: "A new task session will be created" },
        { label: "Tools", value: "github, calendar" },
      ],
    },
  );

  const action = pluginRpcActionForRequest(
    request("copilot.open", { prompt: "x".repeat(700) }),
  );
  assert.equal(action.details[0].value.slice(0, 600), "x".repeat(600));
  assert.match(action.details[0].value, /… \(100 more characters\)$/);
  assert.equal(
    pluginRpcCopilotPrompt(
      request("copilot.open", { prompt: `  ${"x".repeat(4_100)}  ` }),
    ).length,
    4_000,
  );
});

test("resource-scoped read grants only return authorized tasks", async () => {
  const app = plugin({
    capabilities: [{ name: "tasks.read", resourceIds: ["task-allowed"] }],
  });
  const response = await dispatchPluginRpc(
    request("tasks.list", { limit: 100 }),
    options(app, {
      fetcher: async (url) => {
        assert.equal(url, "/api/tasks");
        return jsonResponse({
          data: [
            { taskId: "task-allowed", title: "Visible" },
            { taskId: "task-hidden", title: "Hidden" },
          ],
        });
      },
    }),
  );

  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 1,
    result: {
      items: [
        {
          taskId: "task-allowed",
          title: "Visible",
          studioPath: "/studio/tasks/task-allowed",
        },
      ],
      total: 1,
    },
  });
});

test("a resource-scoped task write grant cannot create arbitrary tasks", async () => {
  let confirmations = 0;
  let fetches = 0;
  const app = plugin({
    capabilities: [{ name: "tasks.write", resourceIds: ["task-1"] }],
  });
  const response = await dispatchPluginRpc(
    request("tasks.create", { title: "New task", agentId: "agent-1" }),
    options(app, {
      confirmAction: async () => {
        confirmations += 1;
        return true;
      },
      fetcher: async () => {
        fetches += 1;
        return jsonResponse({});
      },
    }),
  );

  assertRpcError(
    response,
    -32002,
    "This app has a resource-scoped task grant and cannot create new tasks.",
  );
  assert.equal(confirmations, 0);
  assert.equal(fetches, 0);
});

test("task updates enforce resource scope before confirmation", async () => {
  let confirmations = 0;
  let fetches = 0;
  const app = plugin({
    capabilities: [{ name: "tasks.write", resourceIds: ["task-allowed"] }],
  });
  const response = await dispatchPluginRpc(
    request("tasks.update", { taskId: "task-hidden", title: "Changed" }),
    options(app, {
      confirmAction: async () => {
        confirmations += 1;
        return true;
      },
      fetcher: async () => {
        fetches += 1;
        return jsonResponse({});
      },
    }),
  );

  assertRpcError(
    response,
    -32002,
    "This app cannot access that Commons resource.",
  );
  assert.equal(confirmations, 0);
  assert.equal(fetches, 0);
});

test("task updates do not reach the API when confirmation is declined", async () => {
  let action;
  let fetches = 0;
  const app = plugin({ capabilities: [{ name: "tasks.write" }] });
  const response = await dispatchPluginRpc(
    request("tasks.update", { taskId: "task-1", title: "Changed" }),
    options(app, {
      confirmAction: async (candidate) => {
        action = candidate;
        return false;
      },
      fetcher: async () => {
        fetches += 1;
        return jsonResponse({});
      },
    }),
  );

  assert.deepEqual(action, {
    method: "tasks.update",
    summary: "Apply these changes to the Commons task?",
    details: [
      { label: "Task", value: "task-1" },
      { label: "Title", value: "Changed" },
    ],
  });
  assertRpcError(response, -32003, "The user cancelled this action.");
  assert.equal(fetches, 0);
});

test("workflow execution enforces its resource scope before confirmation", async () => {
  let confirmations = 0;
  let fetches = 0;
  const app = plugin({
    capabilities: [
      { name: "workflows.execute", resourceIds: ["workflow-allowed"] },
    ],
  });
  const response = await dispatchPluginRpc(
    request("workflows.execute", { workflowId: "workflow-hidden" }),
    options(app, {
      confirmAction: async () => {
        confirmations += 1;
        return true;
      },
      fetcher: async () => {
        fetches += 1;
        return jsonResponse({});
      },
    }),
  );

  assertRpcError(
    response,
    -32002,
    "This app cannot access that Commons resource.",
  );
  assert.equal(confirmations, 0);
  assert.equal(fetches, 0);
});

test("authorized workflow execution requires confirmation and posts safe input", async () => {
  let action;
  let fetchCall;
  const app = plugin({
    capabilities: [{ name: "workflows.execute", resourceIds: ["workflow-1"] }],
  });
  const response = await dispatchPluginRpc(
    request("workflows.execute", {
      workflowId: "workflow-1",
      inputData: {
        query: "hello",
        constructor: "discard me",
      },
    }),
    options(app, {
      confirmAction: async (candidate) => {
        action = candidate;
        return true;
      },
      fetcher: async (url, init) => {
        fetchCall = { url, init };
        return jsonResponse({
          executionId: "execution-1",
          status: "running",
        });
      },
    }),
  );

  assert.deepEqual(action, {
    method: "workflows.execute",
    summary: "Run this Commons workflow now?",
    details: [
      { label: "Workflow", value: "workflow-1" },
      {
        label: "Input",
        value: '{\n  "query": "hello"\n}',
      },
    ],
  });
  assert.equal(fetchCall.url, "/api/workflows/workflow-1/execute");
  assert.equal(fetchCall.init.method, "POST");
  assert.deepEqual(JSON.parse(fetchCall.init.body), {
    inputData: { query: "hello" },
  });
  assert.deepEqual(response, {
    jsonrpc: "2.0",
    id: 1,
    result: {
      executionId: "execution-1",
      workflowId: "workflow-1",
      status: "running",
    },
  });
});

test("storage requires permission, validates keys, and bounds stored values", async () => {
  let storageCalls = 0;
  const denied = await dispatchPluginRpc(
    request("storage.get", { key: "preferences.theme" }),
    options(plugin(), {
      storage: {
        get: async () => {
          storageCalls += 1;
          return null;
        },
        set: async () => undefined,
        remove: async () => undefined,
      },
    }),
  );
  assertRpcError(denied, -32001, "This app was not granted storage access.");
  assert.equal(storageCalls, 0);

  const calls = [];
  const storage = {
    get: async (key) => {
      calls.push(["get", key]);
      return "dark";
    },
    set: async (key, value) => {
      calls.push(["set", key, value]);
    },
    remove: async (key) => {
      calls.push(["remove", key]);
    },
  };
  const app = plugin({ permissions: ["storage"] });

  const invalid = await dispatchPluginRpc(
    request("storage.get", { key: "../another-plugin/secret" }),
    options(app, { storage }),
  );
  assertRpcError(invalid, -32602, "Storage keys contain invalid characters.");

  const longValue = "v".repeat(8_250);
  const stored = await dispatchPluginRpc(
    request("storage.set", { key: "preferences.theme", value: longValue }),
    options(app, { storage }),
  );
  assert.deepEqual(stored, {
    jsonrpc: "2.0",
    id: 1,
    result: { stored: true },
  });
  assert.equal(calls[0][0], "set");
  assert.equal(calls[0][1], "preferences.theme");
  assert.equal(calls[0][2].length, 8_000);
});

test("the limiter enforces concurrent and rolling per-minute bounds", () => {
  const concurrencyLimiter = createPluginRpcLimiter({
    maxConcurrent: 1,
    maxPerMinute: 10,
  });
  const first = concurrencyLimiter.begin(1_000);
  assert.equal(first.allowed, true);
  assert.deepEqual(concurrencyLimiter.begin(1_000), {
    allowed: false,
    message: "Too many Commons requests are already running.",
  });
  first.release();
  first.release();
  assert.equal(concurrencyLimiter.begin(1_001).allowed, true);

  const rateLimiter = createPluginRpcLimiter({
    maxConcurrent: 1,
    maxPerMinute: 2,
  });
  const rateFirst = rateLimiter.begin(10_000);
  assert.equal(rateFirst.allowed, true);
  rateFirst.release();
  const rateSecond = rateLimiter.begin(10_001);
  assert.equal(rateSecond.allowed, true);
  rateSecond.release();
  assert.deepEqual(rateLimiter.begin(10_002), {
    allowed: false,
    message: "This app reached its Commons request limit.",
  });
  assert.equal(rateLimiter.begin(70_001).allowed, true);
});

test("copilot prompts require both capability and user confirmation", async () => {
  let confirmations = 0;
  const opened = [];
  const missingCapability = await dispatchPluginRpc(
    request("copilot.open", { prompt: "Investigate this task" }),
    options(plugin(), {
      confirmAction: async () => {
        confirmations += 1;
        return true;
      },
      openCopilot: (prompt) => opened.push(prompt),
    }),
  );
  assertRpcError(
    missingCapability,
    -32001,
    "This app was not granted the copilot.prompt capability.",
  );
  assert.equal(confirmations, 0);

  const app = plugin({ capabilities: [{ name: "copilot.prompt" }] });
  const cancelled = await dispatchPluginRpc(
    request("copilot.open", { prompt: "Investigate this task" }),
    options(app, {
      confirmAction: async () => false,
      openCopilot: (prompt) => opened.push(prompt),
    }),
  );
  assertRpcError(cancelled, -32003, "The user cancelled this action.");
  assert.deepEqual(opened, []);

  let acceptedAction;
  const accepted = await dispatchPluginRpc(
    request("copilot.open", { prompt: "  Investigate this task  " }),
    options(app, {
      confirmAction: async (action) => {
        acceptedAction = action;
        return true;
      },
      openCopilot: (prompt) => opened.push(prompt),
    }),
  );
  assert.deepEqual(acceptedAction, {
    method: "copilot.open",
    summary: "Add this prompt to the Commons Copilot composer?",
    details: [{ label: "Prompt draft", value: "Investigate this task" }],
  });
  assert.deepEqual(opened, ["Investigate this task"]);
  assert.deepEqual(accepted, {
    jsonrpc: "2.0",
    id: 1,
    result: { opened: true },
  });
});
