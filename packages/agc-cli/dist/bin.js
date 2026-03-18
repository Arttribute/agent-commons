#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/bin.ts
var import_commander11 = require("commander");

// src/commands/login.ts
var import_commander = require("commander");
var readline = __toESM(require("readline"));

// src/config.ts
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");
var import_sdk = require("@agent-commons/sdk");
var CONFIG_DIR = (0, import_path.join)((0, import_os.homedir)(), ".agc");
var CONFIG_FILE = (0, import_path.join)(CONFIG_DIR, "config.json");
var DEFAULT_API_URL = process.env.AGC_API_URL ?? "http://localhost:3001";
function loadConfig() {
  const fromEnv = {
    ...process.env.AGC_API_URL && { apiUrl: process.env.AGC_API_URL },
    ...process.env.AGC_API_KEY && { apiKey: process.env.AGC_API_KEY },
    ...process.env.AGC_INITIATOR && { initiator: process.env.AGC_INITIATOR },
    ...process.env.AGC_AGENT_ID && { defaultAgentId: process.env.AGC_AGENT_ID }
  };
  let fromFile = {};
  if ((0, import_fs.existsSync)(CONFIG_FILE)) {
    try {
      fromFile = JSON.parse((0, import_fs.readFileSync)(CONFIG_FILE, "utf8"));
    } catch {
    }
  }
  return {
    apiUrl: DEFAULT_API_URL,
    ...fromFile,
    ...fromEnv
  };
}
function saveConfig(updates) {
  const current = loadConfig();
  const next = { ...current, ...updates };
  if (!(0, import_fs.existsSync)(CONFIG_DIR)) (0, import_fs.mkdirSync)(CONFIG_DIR, { recursive: true });
  (0, import_fs.writeFileSync)(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 384 });
}
function clearConfig() {
  if ((0, import_fs.existsSync)(CONFIG_FILE)) {
    (0, import_fs.writeFileSync)(CONFIG_FILE, JSON.stringify({ apiUrl: DEFAULT_API_URL }, null, 2));
  }
}
function makeClient(overrides) {
  const cfg = { ...loadConfig(), ...overrides };
  return new import_sdk.CommonsClient({
    baseUrl: cfg.apiUrl,
    apiKey: cfg.apiKey,
    initiator: cfg.initiator
  });
}

// src/ui.ts
var import_chalk = __toESM(require("chalk"));
var import_ora = __toESM(require("ora"));
var c = {
  primary: (s) => import_chalk.default.cyan(s),
  success: (s) => import_chalk.default.green(s),
  warn: (s) => import_chalk.default.yellow(s),
  error: (s) => import_chalk.default.red(s),
  dim: (s) => import_chalk.default.dim(s),
  bold: (s) => import_chalk.default.bold(s),
  id: (s) => import_chalk.default.magenta(s),
  label: (s) => import_chalk.default.cyan.bold(s)
};
var sym = {
  ok: import_chalk.default.green("\u2713"),
  fail: import_chalk.default.red("\u2717"),
  arrow: import_chalk.default.cyan("\u2192"),
  bullet: import_chalk.default.dim("\u2022"),
  dot: import_chalk.default.dim("\xB7")
};
function spin(text) {
  return (0, import_ora.default)({ text, color: "cyan" }).start();
}
function table(rows, columns) {
  if (rows.length === 0) {
    console.log(c.dim("  (none)"));
    return;
  }
  const widths = columns.map(
    (col) => Math.max(col.length, ...rows.map((r) => (r[col] ?? "").length))
  );
  const header = columns.map((col, i) => c.label(col.toUpperCase().padEnd(widths[i]))).join("  ");
  const divider = widths.map((w) => import_chalk.default.dim("\u2500".repeat(w))).join("  ");
  console.log("  " + header);
  console.log("  " + divider);
  for (const row of rows) {
    const line = columns.map((col, i) => (row[col] ?? "").padEnd(widths[i])).join("  ");
    console.log("  " + line);
  }
}
function section(title) {
  console.log("\n" + c.bold(title));
}
function detail(pairs) {
  const labelWidth = Math.max(...pairs.map(([k]) => k.length));
  for (const [key, val] of pairs) {
    if (val === void 0 || val === "") continue;
    console.log(`  ${c.dim(key.padEnd(labelWidth))}  ${val}`);
  }
}
function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 6e4) return `${Math.round(ms / 1e3)}s ago`;
  if (ms < 36e5) return `${Math.round(ms / 6e4)}m ago`;
  if (ms < 864e5) return `${Math.round(ms / 36e5)}h ago`;
  return `${Math.round(ms / 864e5)}d ago`;
}
function printError(err) {
  if (err instanceof Error) {
    console.error(c.error(`
Error: ${err.message}`));
  } else {
    console.error(c.error(`
Unknown error: ${String(err)}`));
  }
}
function jsonOut(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function statusBadge(status) {
  switch (status) {
    case "completed":
    case "connected":
    case "active":
    case "success":
      return import_chalk.default.green(status);
    case "running":
    case "working":
    case "submitted":
      return import_chalk.default.cyan(status);
    case "pending":
      return import_chalk.default.yellow(status);
    case "failed":
    case "error":
    case "canceled":
      return import_chalk.default.red(status);
    case "cancelled":
      return import_chalk.default.gray(status);
    case "awaiting_approval":
      return import_chalk.default.magenta(status);
    default:
      return import_chalk.default.dim(status);
  }
}

// src/commands/login.ts
function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: hidden ? void 0 : process.stdout,
      terminal: hidden
    });
    if (hidden) {
      process.stdout.write(question);
      process.stdin.once("data", (data) => {
        process.stdout.write("\n");
        rl.close();
        resolve(data.toString().trim());
      });
      process.stdin.setRawMode?.(false);
    } else {
      rl.question(question, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}
function loginCommand() {
  const cmd = new import_commander.Command("login").description("Configure API credentials");
  cmd.option("--api-url <url>", "API base URL", DEFAULT_API_URL).option("--api-key <key>", "API key (or set AGC_API_KEY env var)").option("--initiator <id>", "Default initiator ID (wallet address or user ID)").action(async (opts) => {
    try {
      const current = loadConfig();
      const apiUrl = opts.apiUrl !== DEFAULT_API_URL ? opts.apiUrl : await prompt(`API URL [${current.apiUrl ?? DEFAULT_API_URL}]: `) || (current.apiUrl ?? DEFAULT_API_URL);
      let apiKey = opts.apiKey;
      if (!apiKey) {
        apiKey = await prompt(`API Key [${current.apiKey ? "****" : "none"}]: `);
        if (!apiKey) apiKey = current.apiKey;
      }
      let initiator = opts.initiator;
      if (!initiator) {
        initiator = await prompt(`Initiator ID [${current.initiator ?? "none"}]: `);
        if (!initiator) initiator = current.initiator;
      }
      saveConfig({ apiUrl, apiKey, initiator });
      console.log(`
${sym.ok} Credentials saved to ~/.agc/config.json`);
      console.log(c.dim("  Run `agc whoami` to verify the connection."));
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}
function logoutCommand() {
  return new import_commander.Command("logout").description("Clear stored credentials").action(() => {
    clearConfig();
    console.log(`${sym.ok} Credentials cleared.`);
  });
}
function whoamiCommand() {
  return new import_commander.Command("whoami").description("Show current configuration and verify API connectivity").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (opts.json) {
      console.log(JSON.stringify({ apiUrl: cfg.apiUrl, initiator: cfg.initiator, hasApiKey: !!cfg.apiKey }, null, 2));
      return;
    }
    console.log(`
${c.bold("Current configuration")}`);
    detail([
      ["API URL", cfg.apiUrl],
      ["Initiator", cfg.initiator ?? c.dim("(not set)")],
      ["API Key", cfg.apiKey ? `****${cfg.apiKey.slice(-4)}` : c.dim("(not set)")],
      ["Agent ID", cfg.defaultAgentId ?? c.dim("(not set)")]
    ]);
    try {
      const client = makeClient();
      if (cfg.initiator) {
        await client.agents.list(cfg.initiator);
        console.log(`
${sym.ok} ${c.success("Connected")} to ${cfg.apiUrl}`);
      } else {
        console.log(`
${c.warn("\u26A0")}  Set an initiator to verify connectivity.`);
      }
    } catch (err) {
      console.log(`
${sym.fail} ${c.error("Could not reach API")}: ${err.message}`);
    }
  });
}
function configCommand() {
  const cmd = new import_commander.Command("config").description("Get or set configuration values");
  cmd.command("set <key> <value>").description("Set a config value (apiUrl, apiKey, initiator, defaultAgentId)").action((key, value) => {
    const allowed = ["apiUrl", "apiKey", "initiator", "defaultAgentId"];
    if (!allowed.includes(key)) {
      console.error(c.error(`Unknown key "${key}". Allowed: ${allowed.join(", ")}`));
      process.exit(1);
    }
    saveConfig({ [key]: value });
    console.log(`${sym.ok} ${key} = ${key === "apiKey" ? "****" : value}`);
  });
  cmd.command("get [key]").description("Get a config value or show all").action((key) => {
    const cfg = loadConfig();
    if (key) {
      console.log(cfg[key] ?? c.dim("(not set)"));
    } else {
      detail([
        ["apiUrl", cfg.apiUrl],
        ["initiator", cfg.initiator ?? ""],
        ["apiKey", cfg.apiKey ? `****${cfg.apiKey.slice(-4)}` : ""],
        ["defaultAgentId", cfg.defaultAgentId ?? ""]
      ]);
    }
  });
  return cmd;
}

// src/commands/agents.ts
var import_commander2 = require("commander");
function agentsCommand() {
  const cmd = new import_commander2.Command("agents").description("Manage agents");
  cmd.command("list").description("List agents owned by the current initiator").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Fetching agents\u2026");
    try {
      const client = makeClient();
      const res = await client.agents.list(cfg.initiator);
      const agents = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(agents);
      section(`Agents (${agents.length})`);
      table(
        agents.map((a) => ({
          ID: a.agentId.slice(0, 8) + "\u2026",
          Name: a.name,
          Model: `${a.modelProvider}/${a.modelId}`,
          Created: relativeTime(a.createdAt)
        })),
        ["ID", "Name", "Model", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <agentId>").description("Show details for an agent").option("--json", "Output as JSON").action(async (agentId, opts) => {
    const spinner = spin("Fetching agent\u2026");
    try {
      const client = makeClient();
      const res = await client.agents.get(agentId);
      const agent = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(agent);
      section(agent.name);
      detail([
        ["Agent ID", c.id(agent.agentId)],
        ["Provider", `${agent.modelProvider} / ${agent.modelId}`],
        ["Instructions", agent.instructions?.slice(0, 80) ?? c.dim("(none)")],
        ["Tools", [...agent.commonTools ?? [], ...agent.externalTools ?? []].join(", ") || c.dim("(none)")],
        ["Created", relativeTime(agent.createdAt)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Create a new agent").requiredOption("--name <name>", "Agent name").option("--instructions <text>", "System instructions").option("--provider <provider>", "Model provider (openai|anthropic|google|groq)", "openai").option("--model <id>", "Model ID", "gpt-4o").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Creating agent\u2026");
    try {
      const client = makeClient();
      const res = await client.agents.create({
        name: opts.name,
        instructions: opts.instructions,
        owner: cfg.initiator,
        modelProvider: opts.provider,
        modelId: opts.model
      });
      const agent = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(agent);
      console.log(`
${sym.ok} Agent created`);
      detail([
        ["Agent ID", c.id(agent.agentId)],
        ["Name", agent.name],
        ["Model", `${agent.modelProvider}/${agent.modelId}`]
      ]);
      console.log(c.dim("\n  Tip: agc config set defaultAgentId " + agent.agentId));
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/sessions.ts
var import_commander3 = require("commander");
function sessionsCommand() {
  const cmd = new import_commander3.Command("sessions").description("Manage chat sessions");
  cmd.command("list").description("List sessions for the current initiator + agent").option("--agent <agentId>", "Filter by agent ID").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const agentId = opts.agent ?? cfg.defaultAgentId;
    if (!agentId) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    const spinner = spin("Fetching sessions\u2026");
    try {
      const client = makeClient();
      const res = await client.sessions.list(agentId, cfg.initiator);
      const sessions = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(sessions);
      section(`Sessions (${sessions.length})`);
      table(
        sessions.map((s) => ({
          ID: s.sessionId.slice(0, 8) + "\u2026",
          Title: s.title ?? c.dim("(untitled)"),
          Model: s.model?.modelId ?? s.model?.name ?? "",
          Created: relativeTime(s.createdAt)
        })),
        ["ID", "Title", "Model", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <sessionId>").description("Show session details").option("--json", "Output as JSON").action(async (sessionId, opts) => {
    const spinner = spin("Fetching session\u2026");
    try {
      const client = makeClient();
      const res = await client.sessions.get(sessionId);
      const session = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(session);
      section("Session");
      detail([
        ["Session ID", c.id(session.sessionId)],
        ["Title", session.title ?? c.dim("(untitled)")],
        ["Agent ID", session.agentId],
        ["Model", session.model?.modelId ?? session.model?.name ?? ""],
        ["Initiator", session.initiator ?? ""],
        ["Created", relativeTime(session.createdAt)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Create a new session").option("--agent <agentId>", "Agent ID").option("--title <title>", "Session title").option("--model <id>", "Model ID (e.g. gpt-4o, claude-sonnet-4-6)").option("--provider <provider>", "Model provider").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    if (!agentId) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId"));
      process.exit(1);
    }
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Creating session\u2026");
    try {
      const client = makeClient();
      const res = await client.sessions.create({
        agentId,
        initiator: cfg.initiator,
        title: opts.title,
        ...opts.model && { model: { modelId: opts.model, provider: opts.provider } }
      });
      const session = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(session);
      console.log(`
${sym.ok} Session created`);
      detail([
        ["Session ID", c.id(session.sessionId)],
        ["Title", session.title ?? c.dim("(untitled)")]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/tools.ts
var import_commander4 = require("commander");
function toolsCommand() {
  const cmd = new import_commander4.Command("tools").description("Discover and manage tools");
  cmd.command("list").description("List available tools").option("--owner <id>", "Filter by owner ID").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const spinner = spin("Fetching tools\u2026");
    try {
      const client = makeClient();
      const filter = opts.owner ? { owner: opts.owner } : {};
      const res = await client.tools.list(filter);
      const tools = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(tools);
      section(`Tools (${tools.length})`);
      table(
        tools.map((t) => ({
          ID: (t.toolId ?? "").slice(0, 8) + "\u2026",
          Name: t.name ?? "",
          Description: (t.description ?? "").slice(0, 50),
          Tags: (t.tags ?? []).join(", ")
        })),
        ["ID", "Name", "Description", "Tags"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <toolId>").description("Show tool details and schema").option("--json", "Output as JSON").action(async (toolId, opts) => {
    const spinner = spin("Fetching tool\u2026");
    try {
      const client = makeClient();
      const res = await client.tools.list({ toolId });
      const tools = res?.data ?? res ?? [];
      const tool = tools.find((t) => t.toolId === toolId || t.name === toolId);
      spinner.stop();
      if (!tool) {
        console.error(c.error(`Tool "${toolId}" not found.`));
        process.exit(1);
      }
      if (opts.json) return jsonOut(tool);
      section(tool.name);
      detail([
        ["Tool ID", c.id(tool.toolId)],
        ["Description", tool.description ?? c.dim("(none)")],
        ["Tags", (tool.tags ?? []).join(", ") || c.dim("(none)")],
        ["Public", tool.isPublic ? "yes" : "no"],
        ["Created", relativeTime(tool.createdAt)]
      ]);
      if (tool.schema) {
        console.log("\n  " + c.label("Schema"));
        console.log("  " + JSON.stringify(tool.schema, null, 2).split("\n").join("\n  "));
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("exec <toolName>").description("Execute a tool directly by name").option("--agent <agentId>", "Agent context for tool execution").option("--args <json>", "Tool arguments as JSON object", "{}").option("--json", "Output result as JSON").action(async (toolName, opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    if (!agentId) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    let args = {};
    try {
      args = JSON.parse(opts.args);
    } catch {
      console.error(c.error("--args must be valid JSON"));
      process.exit(1);
    }
    const prompt2 = `Call the tool "${toolName}" with these arguments: ${JSON.stringify(args)}. Return only the tool result, nothing else.`;
    const spinner = spin(`Executing ${toolName}\u2026`);
    try {
      const client = makeClient();
      const result = await client.run.once({
        agentId,
        messages: [{ role: "user", content: prompt2 }],
        ...cfg.initiator && { initiatorId: cfg.initiator }
      });
      spinner.stop();
      if (opts.json) return jsonOut(result);
      console.log(`
${sym.ok} ${c.label(toolName)}`);
      const text = result?.content ?? result?.text ?? result?.message ?? JSON.stringify(result, null, 2);
      console.log(text);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/workflow.ts
var import_commander5 = require("commander");
function workflowCommand() {
  const cmd = new import_commander5.Command("workflow").description("Run and monitor workflows").alias("wf");
  cmd.command("list").description("List workflows owned by the current initiator").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Fetching workflows\u2026");
    try {
      const client = makeClient();
      const workflows = await client.workflows.list(cfg.initiator, "user");
      spinner.stop();
      if (opts.json) return jsonOut(workflows);
      section(`Workflows (${workflows.length})`);
      table(
        workflows.map((w) => ({
          ID: w.workflowId.slice(0, 8) + "\u2026",
          Name: w.name,
          Nodes: String((w.definition?.nodes ?? []).length),
          Public: w.isPublic ? "yes" : "no",
          Created: relativeTime(w.createdAt)
        })),
        ["ID", "Name", "Nodes", "Public", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <workflowId>").description("Show workflow details").option("--json", "Output as JSON").action(async (workflowId, opts) => {
    const spinner = spin("Fetching workflow\u2026");
    try {
      const client = makeClient();
      const wf = await client.workflows.get(workflowId);
      spinner.stop();
      if (opts.json) return jsonOut(wf);
      section(wf.name);
      detail([
        ["Workflow ID", c.id(wf.workflowId)],
        ["Description", wf.description ?? c.dim("(none)")],
        ["Nodes", String((wf.definition?.nodes ?? []).length)],
        ["Public", wf.isPublic ? "yes" : "no"],
        ["Created", relativeTime(wf.createdAt)]
      ]);
      if (wf.definition?.nodes?.length) {
        console.log("\n  " + c.label("Nodes"));
        for (const node of wf.definition.nodes) {
          console.log(`  ${c.dim("\xB7")} ${node.id} ${c.dim("(" + (node.type ?? "tool") + ")")}`);
        }
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("run <workflowId>").description("Execute a workflow").option("--agent <agentId>", "Agent context").option("--session <sessionId>", "Session context").option("--input <json>", "Input data as JSON string", "{}").option("--watch", "Stream execution progress via SSE").option("--json", "Output result as JSON").action(async (workflowId, opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    let inputData = {};
    try {
      inputData = JSON.parse(opts.input);
    } catch {
      console.error(c.error("--input must be valid JSON"));
      process.exit(1);
    }
    const spinner = spin("Executing workflow\u2026");
    try {
      const client = makeClient();
      const execution = await client.workflows.execute(workflowId, {
        agentId,
        sessionId: opts.session,
        inputData
      });
      spinner.stop();
      if (opts.json && !opts.watch) return jsonOut(execution);
      console.log(`
${sym.ok} Execution started: ${c.id(execution.executionId)}`);
      console.log(`   Status: ${statusBadge(execution.status)}`);
      if (!opts.watch) {
        if (execution.status === "completed") {
          console.log("\n" + c.label("Result"));
          console.log("  " + JSON.stringify(execution.result ?? execution.outputData, null, 2));
        }
        return;
      }
      console.log(c.dim("\nStreaming execution progress...\n"));
      for await (const event of client.workflows.stream(workflowId, execution.executionId)) {
        if (event.type === "status") {
          const e = event;
          process.stdout.write(`\r  ${statusBadge(e.status ?? "")}  node: ${c.dim(e.currentNode ?? "\u2026")}      `);
        } else if (event.type === "completed") {
          process.stdout.write("\n");
          console.log(`
${sym.ok} ${c.success("Completed")}`);
          const e = event;
          if (e.outputData) {
            console.log("\n" + c.label("Output"));
            console.log("  " + JSON.stringify(e.outputData, null, 2));
          }
          break;
        } else if (event.type === "failed" || event.type === "cancelled") {
          process.stdout.write("\n");
          console.error(`
${sym.fail} ${c.error(event.errorMessage ?? event.type)}`);
          break;
        } else if (event.type === "awaiting_approval") {
          process.stdout.write("\n");
          const e = event;
          console.log(`
${c.warn("\u23F8  Awaiting approval")} at node ${c.id(e.pausedAtNode ?? "")}`);
          console.log(c.dim(`   Token: ${e.approvalToken}`));
          console.log(c.dim(`   Use: agc workflow approve ${workflowId} ${execution.executionId} <token>`));
        }
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("executions <workflowId>").description("List recent executions for a workflow").option("--limit <n>", "Max results", "20").option("--json", "Output as JSON").action(async (workflowId, opts) => {
    const spinner = spin("Fetching executions\u2026");
    try {
      const client = makeClient();
      const executions = await client.workflows.listExecutions(workflowId, Number(opts.limit));
      spinner.stop();
      if (opts.json) return jsonOut(executions);
      section(`Executions (${executions.length})`);
      table(
        executions.map((e) => ({
          ID: e.executionId.slice(0, 8) + "\u2026",
          Status: statusBadge(e.status),
          Node: e.currentNode ?? "",
          Started: e.startedAt ? relativeTime(e.startedAt) : ""
        })),
        ["ID", "Status", "Node", "Started"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("approve <workflowId> <executionId> <token>").description("Approve a paused human_approval step").option("--data <json>", "Approval data as JSON", "{}").action(async (workflowId, executionId, token, opts) => {
    let approvalData = {};
    try {
      approvalData = JSON.parse(opts.data);
    } catch {
    }
    const spinner = spin("Approving\u2026");
    try {
      const client = makeClient();
      await client.workflows.approveExecution(workflowId, executionId, {
        approvalToken: token,
        approvalData
      });
      spinner.stop();
      console.log(`${sym.ok} Execution ${c.id(executionId)} approved \u2014 workflow resuming.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("reject <workflowId> <executionId> <token>").description("Reject a paused human_approval step").option("--reason <text>", "Rejection reason").action(async (workflowId, executionId, token, opts) => {
    const spinner = spin("Rejecting\u2026");
    try {
      const client = makeClient();
      await client.workflows.rejectExecution(workflowId, executionId, {
        approvalToken: token,
        reason: opts.reason
      });
      spinner.stop();
      console.log(`${sym.ok} Execution ${c.id(executionId)} rejected.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/task.ts
var import_commander6 = require("commander");
function taskCommand() {
  const cmd = new import_commander6.Command("task").description("Manage and execute tasks").alias("t");
  cmd.command("list").description("List tasks").option("--agent <agentId>", "Filter by agent ID").option("--session <sessionId>", "Filter by session ID").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    const spinner = spin("Fetching tasks\u2026");
    try {
      const client = makeClient();
      const filter = {};
      if (agentId) filter.agentId = agentId;
      if (opts.session) filter.sessionId = opts.session;
      if (cfg.initiator) {
        filter.ownerId = cfg.initiator;
        filter.ownerType = "user";
      }
      const res = await client.tasks.list(filter);
      const tasks = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(tasks);
      section(`Tasks (${tasks.length})`);
      table(
        tasks.map((t) => ({
          ID: t.taskId.slice(0, 8) + "\u2026",
          Title: (t.title ?? t.description ?? "").slice(0, 40),
          Status: statusBadge(t.status ?? ""),
          Agent: (t.agentId ?? "").slice(0, 8) + "\u2026",
          Created: relativeTime(t.createdAt)
        })),
        ["ID", "Title", "Status", "Agent", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <taskId>").description("Show task details").option("--json", "Output as JSON").action(async (taskId, opts) => {
    const spinner = spin("Fetching task\u2026");
    try {
      const client = makeClient();
      const res = await client.tasks.get(taskId);
      const task = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(task);
      section("Task");
      detail([
        ["Task ID", c.id(task.taskId)],
        ["Title", task.title ?? task.description ?? c.dim("(none)")],
        ["Status", statusBadge(task.status ?? "")],
        ["Agent ID", task.agentId ?? c.dim("(none)")],
        ["Session ID", task.sessionId ?? c.dim("(none)")],
        ["Created", relativeTime(task.createdAt)]
      ]);
      if (task.result) {
        console.log("\n  " + c.label("Result"));
        console.log("  " + JSON.stringify(task.result, null, 2).split("\n").join("\n  "));
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Create a new task").requiredOption("--title <title>", "Task title").option("--agent <agentId>", "Agent ID").option("--session <sessionId>", "Session ID").option("--workflow <workflowId>", "Workflow ID to attach").option("--input <json>", "Input data as JSON", "{}").option("--timeout <ms>", "Execution timeout in milliseconds").option("--execute", "Execute immediately after creation").option("--watch", "Stream execution progress (implies --execute)").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    if (!agentId) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    let inputData = {};
    try {
      inputData = JSON.parse(opts.input);
    } catch {
      console.error(c.error("--input must be valid JSON"));
      process.exit(1);
    }
    const spinner = spin("Creating task\u2026");
    try {
      const client = makeClient();
      const res = await client.tasks.create({
        title: opts.title,
        agentId,
        sessionId: opts.session,
        workflowId: opts.workflow,
        inputData,
        ...opts.timeout && { timeoutMs: Number(opts.timeout) },
        ...cfg.initiator && { ownerId: cfg.initiator, ownerType: "user" }
      });
      const task = res?.data ?? res;
      spinner.stop();
      if (opts.json && !opts.execute && !opts.watch) return jsonOut(task);
      console.log(`
${sym.ok} Task created: ${c.id(task.taskId)}`);
      if (!opts.execute && !opts.watch) return;
      const execSpinner = spin("Executing task\u2026");
      const execRes = await client.tasks.execute(task.taskId);
      execSpinner.stop();
      console.log(`   Status: ${statusBadge(execRes?.data?.status ?? "pending")}`);
      if (!opts.watch) {
        if (execRes?.data?.result) {
          console.log("\n" + c.label("Result"));
          console.log("  " + JSON.stringify(execRes.data.result, null, 2));
        }
        return;
      }
      console.log(c.dim("\nStreaming task progress...\n"));
      for await (const event of client.tasks.stream(task.taskId)) {
        if (event.type === "token") {
          process.stdout.write(event.content ?? "");
        } else if (event.type === "status") {
          const e = event;
          process.stdout.write(`\r  ${statusBadge(e.status ?? "")}  `);
        } else if (event.type === "final" || event.type === "completed") {
          process.stdout.write("\n");
          console.log(`
${sym.ok} ${c.success("Completed")}`);
          const e = event;
          if (e.result ?? e.outputData) {
            console.log("\n" + c.label("Output"));
            console.log("  " + JSON.stringify(e.result ?? e.outputData, null, 2));
          }
          break;
        } else if (event.type === "failed" || event.type === "error") {
          process.stdout.write("\n");
          console.error(`
${sym.fail} ${c.error(event.message ?? event.type)}`);
          break;
        }
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("execute <taskId>").description("Execute an existing task").option("--watch", "Stream execution progress via SSE").option("--json", "Output result as JSON").action(async (taskId, opts) => {
    const spinner = spin("Executing task\u2026");
    try {
      const client = makeClient();
      const res = await client.tasks.execute(taskId);
      spinner.stop();
      if (opts.json && !opts.watch) return jsonOut(res);
      console.log(`
${sym.ok} Execution started`);
      console.log(`   Status: ${statusBadge(res?.data?.status ?? "pending")}`);
      if (!opts.watch) return;
      console.log(c.dim("\nStreaming task progress...\n"));
      for await (const event of client.tasks.stream(taskId)) {
        if (event.type === "token") {
          process.stdout.write(event.content ?? "");
        } else if (event.type === "final" || event.type === "completed") {
          process.stdout.write("\n");
          console.log(`
${sym.ok} ${c.success("Completed")}`);
          break;
        } else if (event.type === "failed" || event.type === "error") {
          process.stdout.write("\n");
          console.error(`
${sym.fail} ${c.error(event.message ?? event.type)}`);
          break;
        }
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("cancel <taskId>").description("Cancel a running task").action(async (taskId) => {
    const spinner = spin("Cancelling task\u2026");
    try {
      const client = makeClient();
      await client.tasks.cancel(taskId);
      spinner.stop();
      console.log(`${sym.ok} Task ${c.id(taskId)} cancelled.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/run.ts
var import_commander7 = require("commander");
function runCommand() {
  return new import_commander7.Command("run").description("Send a single prompt to an agent and stream the response").argument("<prompt>", "Prompt text to send").option("--agent <agentId>", "Agent ID").option("--session <sessionId>", "Session ID").option("--no-stream", "Disable streaming (wait for full response)").option("--json", "Output raw event stream as JSON lines").action(async (prompt2, opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    if (!agentId) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    const params = {
      agentId,
      sessionId: opts.session,
      messages: [{ role: "user", content: prompt2 }],
      ...cfg.initiator && { initiatorId: cfg.initiator }
    };
    if (opts.noStream) {
      const spinner = spin("Running\u2026");
      try {
        const client = makeClient();
        const result = await client.run.once(params);
        spinner.stop();
        if (opts.json) return jsonOut(result);
        const text = result?.content ?? result?.text ?? result?.message ?? JSON.stringify(result);
        console.log(text);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
      return;
    }
    try {
      const client = makeClient();
      let hasOutput = false;
      for await (const event of client.agents.stream(params)) {
        if (opts.json) {
          console.log(JSON.stringify(event));
          continue;
        }
        if (event.type === "token") {
          process.stdout.write(event.content ?? "");
          hasOutput = true;
        } else if (event.type === "final") {
          if (hasOutput) process.stdout.write("\n");
          const e = event;
          if (e.content && !hasOutput) console.log(e.content);
          break;
        } else if (event.type === "error") {
          if (hasOutput) process.stdout.write("\n");
          console.error(`
${sym.fail} ${c.error(event.message ?? "Error")}`);
          process.exit(1);
        }
      }
      if (hasOutput && !opts.json) process.stdout.write("\n");
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });
}

// src/commands/chat.ts
var import_commander8 = require("commander");
var readline2 = __toESM(require("readline"));
var HELP_TEXT = `
  ${c.label("Slash commands")}
  /help          Show this help
  /session       Print the current session ID (copy it to resume later)
  /clear         Clear the terminal screen
  /quit          Exit (session is preserved \u2014 resume with --resume <id>)
`;
function chatCommand() {
  return new import_commander8.Command("chat").description("Start an interactive chat REPL with an agent").option("--agent <agentId>", "Agent ID (or set defaultAgentId in config)").option("--resume <sessionId>", "Resume an existing session by ID").option("--no-stream", "Disable token streaming (wait for full response)").action(async (opts) => {
    const cfg = loadConfig();
    const agentId = opts.agent ?? cfg.defaultAgentId;
    if (!agentId) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const client = makeClient();
    let sessionId = opts.resume ?? "";
    const isResume = !!opts.resume;
    if (!isResume) {
      const spinner = spin("Creating session\u2026");
      try {
        const res = await client.sessions.create({
          agentId,
          initiator: cfg.initiator,
          title: `agc chat ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16)}`
        });
        const session = res?.data ?? res;
        sessionId = session.sessionId;
        spinner.stop();
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    } else {
      const spinner = spin("Loading session\u2026");
      try {
        const res = await client.sessions.get(sessionId);
        const session = res?.data ?? res;
        if (session.agentId && session.agentId !== agentId) {
          spinner.stop();
          console.log(c.warn(`  Note: session ${sessionId} was created with agent ${session.agentId}, not ${agentId}`));
        } else {
          spinner.stop();
        }
      } catch {
        spinner.stop();
        console.error(c.error(`Session "${sessionId}" not found.`));
        process.exit(1);
      }
    }
    console.log(`
${c.bold("Agent Commons Chat")}`);
    detail([
      ["Agent", agentId],
      ["Session", c.id(sessionId) + (isResume ? c.dim(" (resumed)") : c.dim(" (new)"))]
    ]);
    console.log(c.dim("\nType your message and press Enter. Type /help for commands.\n"));
    const rl = readline2.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      prompt: c.primary("you") + c.dim(" \u203A ")
    });
    rl.prompt();
    rl.on("line", async (line) => {
      const input = line.trim();
      if (!input) {
        rl.prompt();
        return;
      }
      if (input === "/quit" || input === "/exit" || input === "/q") {
        console.log(c.dim(`
Session saved. Resume with: agc chat --resume ${sessionId}`));
        rl.close();
        process.exit(0);
      }
      if (input === "/help") {
        console.log(HELP_TEXT);
        rl.prompt();
        return;
      }
      if (input === "/session") {
        console.log(c.dim(`  ${sessionId}`));
        console.log(c.dim(`  Resume with: agc chat --resume ${sessionId}`));
        rl.prompt();
        return;
      }
      if (input === "/clear") {
        process.stdout.write("\x1B[2J\x1B[H");
        rl.prompt();
        return;
      }
      if (input.startsWith("/")) {
        console.log(c.warn(`  Unknown command "${input}". Type /help for available commands.`));
        rl.prompt();
        return;
      }
      rl.pause();
      const params = {
        agentId,
        sessionId,
        messages: [{ role: "user", content: input }]
      };
      process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
      if (opts.noStream) {
        const spinner = spin("");
        try {
          const result = await client.run.once(params);
          spinner.stop();
          const text = extractText(result);
          console.log(text);
        } catch (err) {
          spinner.stop();
          console.error(`
${sym.fail} ${c.error(err.message ?? String(err))}`);
        }
      } else {
        try {
          let hasOutput = false;
          for await (const event of client.agents.stream(params)) {
            if (event.type === "token") {
              process.stdout.write(event.content ?? "");
              hasOutput = true;
            } else if (event.type === "toolStart") {
              const name = event.toolName ?? "";
              if (hasOutput) process.stdout.write("\n");
              process.stdout.write(c.dim(`  [tool] ${name}\u2026`));
              hasOutput = false;
            } else if (event.type === "toolEnd") {
              process.stdout.write(c.dim(" done\n"));
              process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
              hasOutput = false;
            } else if (event.type === "final") {
              const e = event;
              const text = extractText(e?.payload);
              if (text && !hasOutput) process.stdout.write(text);
              break;
            } else if (event.type === "error") {
              if (hasOutput) process.stdout.write("\n");
              console.error(`
${sym.fail} ${c.error(event.message ?? "Stream error")}`);
              break;
            }
          }
          process.stdout.write("\n");
        } catch (err) {
          process.stdout.write("\n");
          console.error(`${sym.fail} ${c.error(err.message ?? String(err))}`);
        }
      }
      console.log();
      rl.resume();
      rl.prompt();
    });
    rl.on("close", () => {
      process.exit(0);
    });
    process.on("SIGINT", () => {
      console.log(c.dim(`
Session preserved. Resume with: agc chat --resume ${sessionId}`));
      process.exit(130);
    });
  });
}
function extractText(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.content === "string") return payload.content;
  if (Array.isArray(payload.content)) {
    return payload.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  }
  if (payload.text) return payload.text;
  if (payload.message) return payload.message;
  return JSON.stringify(payload);
}

// src/commands/mcp.ts
var import_commander9 = require("commander");
function mcpCommand() {
  const cmd = new import_commander9.Command("mcp").description("Manage MCP (Model Context Protocol) servers");
  cmd.command("list").description("List MCP servers for the current initiator").option("--agent <agentId>", "List servers owned by an agent instead of the user").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator && !opts.agent) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const ownerId = opts.agent ?? cfg.initiator;
    const ownerType = opts.agent ? "agent" : "user";
    const spinner = spin("Fetching MCP servers\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.listServers(ownerId, ownerType);
      const servers = res.servers ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(servers);
      section(`MCP Servers (${servers.length})`);
      if (!servers.length) {
        console.log(c.dim("  No MCP servers configured."));
        console.log(c.dim('  Add one with: agc mcp add --name "filesystem" --type stdio --command "npx @mcp/server-filesystem ~/projects"'));
        return;
      }
      table(
        servers.map((s) => ({
          ID: (s.serverId ?? "").slice(0, 8) + "\u2026",
          Name: s.name ?? "",
          Type: s.connectionType ?? "",
          Tools: String(s.toolCount ?? 0),
          Created: relativeTime(s.createdAt)
        })),
        ["ID", "Name", "Type", "Tools", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <serverId>").description("Show details for an MCP server").option("--json", "Output as JSON").action(async (serverId, opts) => {
    const spinner = spin("Fetching server\u2026");
    try {
      const client = makeClient();
      const server = await client.mcp.getServer(serverId);
      spinner.stop();
      if (opts.json) return jsonOut(server);
      section(server.name ?? serverId);
      detail([
        ["Server ID", c.id(server.serverId)],
        ["Type", server.connectionType ?? c.dim("(unknown)")],
        ["Tools", String(server.toolCount ?? 0)],
        ["Public", server.isPublic ? "yes" : "no"],
        ["Created", relativeTime(server.createdAt)]
      ]);
      const cfg = server.connectionConfig;
      if (cfg) {
        console.log("\n  " + c.label("Connection Config"));
        const safe = { ...cfg, apiKey: cfg.apiKey ? "****" : void 0, token: cfg.token ? "****" : void 0 };
        console.log("  " + JSON.stringify(safe, null, 2).split("\n").join("\n  "));
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("add").description("Register a new MCP server").requiredOption("--name <name>", "Server name").requiredOption("--type <type>", "Connection type: stdio | sse | http | streamable-http").option("--command <cmd>", 'Command to run (for stdio type, e.g. "npx @mcp/server-filesystem ~/projects")').option("--url <url>", "Server URL (for sse/http types)").option("--agent <agentId>", "Assign to an agent instead of the current user").option("--public", "Make server publicly visible").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator && !opts.agent) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const validTypes = ["stdio", "sse", "http", "streamable-http"];
    if (!validTypes.includes(opts.type)) {
      console.error(c.error(`Invalid type "${opts.type}". Choose from: ${validTypes.join(", ")}`));
      process.exit(1);
    }
    if (opts.type === "stdio" && !opts.command) {
      console.error(c.error("--command is required for stdio type"));
      process.exit(1);
    }
    if ((opts.type === "sse" || opts.type === "http" || opts.type === "streamable-http") && !opts.url) {
      console.error(c.error("--url is required for sse/http/streamable-http types"));
      process.exit(1);
    }
    const connectionConfig = {};
    if (opts.command) connectionConfig.command = opts.command;
    if (opts.url) connectionConfig.url = opts.url;
    const ownerId = opts.agent ?? cfg.initiator;
    const ownerType = opts.agent ? "agent" : "user";
    const spinner = spin("Registering MCP server\u2026");
    try {
      const client = makeClient();
      const server = await client.mcp.createServer({
        name: opts.name,
        connectionType: opts.type,
        connectionConfig,
        isPublic: !!opts.public,
        ownerId,
        ownerType
      });
      spinner.stop();
      if (opts.json) return jsonOut(server);
      console.log(`
${sym.ok} MCP server registered`);
      detail([
        ["Server ID", c.id(server.serverId)],
        ["Name", server.name],
        ["Type", server.connectionType]
      ]);
      console.log(c.dim(`
  Connect and sync tools with: agc mcp sync ${server.serverId}`));
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("connect <serverId>").description("Connect to an MCP server").action(async (serverId) => {
    const spinner = spin("Connecting\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.connect(serverId);
      spinner.stop();
      if (res.connected) {
        console.log(`${sym.ok} Connected to ${c.id(serverId)}`);
        console.log(c.dim(`  Run \`agc mcp sync ${serverId}\` to discover tools.`));
      } else {
        console.log(c.warn("Connection returned but reported not connected."));
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("disconnect <serverId>").description("Disconnect from an MCP server").action(async (serverId) => {
    const spinner = spin("Disconnecting\u2026");
    try {
      const client = makeClient();
      await client.mcp.disconnect(serverId);
      spinner.stop();
      console.log(`${sym.ok} Disconnected from ${c.id(serverId)}`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("sync <serverId>").description("Sync tools, resources, and prompts from an MCP server").option("--json", "Output as JSON").action(async (serverId, opts) => {
    const spinner = spin("Syncing\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.sync(serverId);
      spinner.stop();
      if (opts.json) return jsonOut(res);
      console.log(`${sym.ok} Sync complete`);
      detail([
        ["Tools discovered", String(res.toolsDiscovered)],
        ["Resources discovered", String(res.resourcesDiscovered)],
        ["Prompts discovered", String(res.promptsDiscovered)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("tools <serverId>").description("List tools discovered from an MCP server").option("--json", "Output as JSON").action(async (serverId, opts) => {
    const spinner = spin("Fetching tools\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.listTools(serverId);
      const tools = res.tools ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(tools);
      section(`MCP Tools (${res.total ?? tools.length})`);
      table(
        tools.map((t) => ({
          Name: t.name ?? "",
          Description: (t.description ?? "").slice(0, 60)
        })),
        ["Name", "Description"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("resources <serverId>").description("List resources from an MCP server").option("--json", "Output as JSON").action(async (serverId, opts) => {
    const spinner = spin("Fetching resources\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.listResources(serverId);
      const resources = res.resources ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(resources);
      section(`MCP Resources (${res.total ?? resources.length})`);
      table(
        resources.map((r) => ({
          URI: r.uri ?? "",
          Name: r.name ?? "",
          MimeType: r.mimeType ?? c.dim("(none)")
        })),
        ["URI", "Name", "MimeType"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("read <serverId> <uri>").description("Read a resource from an MCP server by URI").option("--json", "Output as JSON").action(async (serverId, uri, opts) => {
    const spinner = spin("Reading resource\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.readResource(serverId, uri);
      spinner.stop();
      if (opts.json) return jsonOut(res);
      section(`Resource: ${uri}`);
      const contents = res.contents;
      if (typeof contents === "string") {
        console.log(contents);
      } else {
        console.log(JSON.stringify(contents, null, 2));
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("prompts <serverId>").description("List prompts from an MCP server").option("--json", "Output as JSON").action(async (serverId, opts) => {
    const spinner = spin("Fetching prompts\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.listPrompts(serverId);
      const prompts = res.prompts ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(prompts);
      section(`MCP Prompts (${res.total ?? prompts.length})`);
      table(
        prompts.map((p) => ({
          Name: p.name ?? "",
          Description: (p.description ?? "").slice(0, 60)
        })),
        ["Name", "Description"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("prompt <serverId> <promptName>").description("Render an MCP prompt with optional arguments").option("--args <json>", "Prompt arguments as JSON object", "{}").option("--json", "Output as JSON").action(async (serverId, promptName, opts) => {
    let args = {};
    try {
      args = JSON.parse(opts.args);
    } catch {
      console.error(c.error("--args must be valid JSON"));
      process.exit(1);
    }
    const spinner = spin("Rendering prompt\u2026");
    try {
      const client = makeClient();
      const res = await client.mcp.getPrompt(serverId, promptName, args);
      spinner.stop();
      if (opts.json) return jsonOut(res);
      if (res.description) console.log(c.dim(res.description) + "\n");
      for (const msg of res.messages ?? []) {
        const role = c.label(msg.role ?? "unknown");
        const text = typeof msg.content === "string" ? msg.content : msg.content?.text ?? JSON.stringify(msg.content);
        console.log(`${role}: ${text}
`);
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("remove <serverId>").description("Delete an MCP server").action(async (serverId) => {
    const spinner = spin("Removing server\u2026");
    try {
      const client = makeClient();
      await client.mcp.deleteServer(serverId);
      spinner.stop();
      console.log(`${sym.ok} MCP server ${c.id(serverId)} removed.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/skills.ts
var import_commander10 = require("commander");
function skillsCommand() {
  const cmd = new import_commander10.Command("skills").description("Discover and manage skills");
  cmd.command("list").description("List available skills").option("--owner <id>", "Filter by owner ID").option("--platform", "Show platform-only skills").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching skills\u2026");
    try {
      const client = makeClient();
      const filter = {};
      if (opts.owner) filter.ownerId = opts.owner;
      if (opts.platform) filter.ownerType = "platform";
      const res = await client.skills.list(filter);
      const skills = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(skills);
      section(`Skills (${skills.length})`);
      table(
        skills.map((s) => ({
          Slug: s.slug ?? "",
          Name: s.name ?? "",
          Description: (s.description ?? "").slice(0, 55),
          Tags: (s.tags ?? []).join(", "),
          Source: s.source ?? ""
        })),
        ["Slug", "Name", "Description", "Tags", "Source"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("index").description("Show compact skill index (progressive disclosure view)").option("--owner <id>", "Filter by owner ID").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching skill index\u2026");
    try {
      const client = makeClient();
      const res = await client.skills.getIndex(opts.owner);
      const index = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(index);
      section(`Skill Index (${index.length})`);
      table(
        index.map((s) => ({
          "Icon": s.icon ?? " ",
          "Slug": s.slug ?? "",
          "Name": s.name ?? "",
          "Description": (s.description ?? "").slice(0, 55),
          "Triggers": (s.triggers ?? []).slice(0, 3).join(", ")
        })),
        ["Icon", "Slug", "Name", "Description", "Triggers"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <skillId>").description("Show full skill details and instructions").option("--json", "Output as JSON").action(async (skillId, opts) => {
    const spinner = spin("Fetching skill\u2026");
    try {
      const client = makeClient();
      const res = await client.skills.get(skillId);
      const skill = res?.data ?? res;
      spinner.stop();
      if (!skill) {
        console.error(c.error(`Skill "${skillId}" not found.`));
        process.exit(1);
      }
      if (opts.json) return jsonOut(skill);
      section(skill.name);
      detail([
        ["Skill ID", c.id(skill.skillId)],
        ["Slug", skill.slug],
        ["Description", skill.description ?? c.dim("(none)")],
        ["Tags", (skill.tags ?? []).join(", ") || c.dim("(none)")],
        ["Tools", (skill.tools ?? []).join(", ") || c.dim("(none)")],
        ["Source", skill.source ?? c.dim("(none)")],
        ["Version", skill.version ?? "1.0.0"],
        ["Public", skill.isPublic ? "yes" : "no"],
        ["Usage", String(skill.usageCount ?? 0)]
      ]);
      if (skill.instructions) {
        console.log("\n  " + c.label("Instructions"));
        const lines = skill.instructions.split("\n");
        for (const line of lines) {
          console.log("  " + c.dim(line));
        }
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Create a new skill").requiredOption("--slug <slug>", "Unique slug identifier").requiredOption("--name <name>", "Display name").requiredOption("--description <desc>", "Short description").requiredOption("--instructions <text>", "Full skill instructions (markdown)").option("--tools <tools>", "Comma-separated tool names").option("--triggers <triggers>", "Comma-separated trigger phrases").option("--tags <tags>", "Comma-separated tags").option("--icon <icon>", "Emoji icon").option("--public", "Make skill publicly discoverable").option("--json", "Output result as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const spinner = spin("Creating skill\u2026");
    try {
      const client = makeClient();
      const res = await client.skills.create({
        slug: opts.slug,
        name: opts.name,
        description: opts.description,
        instructions: opts.instructions,
        tools: opts.tools ? opts.tools.split(",").map((t) => t.trim()) : [],
        triggers: opts.triggers ? opts.triggers.split(",").map((t) => t.trim()) : [],
        tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [],
        icon: opts.icon,
        isPublic: !!opts.public,
        ownerId: cfg.initiator,
        ownerType: "user",
        source: "user"
      });
      const skill = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(skill);
      console.log(`${sym.ok} Skill ${c.id(skill.skillId)} created`);
      detail([
        ["Slug", skill.slug],
        ["Name", skill.name]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("install <slug>").description("Install a skill by slug (fetch full instructions and print as SKILL.md)").action(async (slug) => {
    const spinner = spin("Loading skill\u2026");
    try {
      const client = makeClient();
      const res = await client.skills.get(slug);
      const skill = res?.data ?? res;
      spinner.stop();
      if (!skill) {
        console.error(c.error(`Skill "${slug}" not found.`));
        process.exit(1);
      }
      const md = [
        `# SKILL: ${skill.name}`,
        ``,
        `**Slug:** ${skill.slug}`,
        `**Version:** ${skill.version ?? "1.0.0"}`,
        `**Tags:** ${(skill.tags ?? []).join(", ")}`,
        `**Tools:** ${(skill.tools ?? []).join(", ") || "none"}`,
        ``,
        `## Description`,
        ``,
        skill.description,
        ``,
        `## Instructions`,
        ``,
        skill.instructions
      ].join("\n");
      console.log(md);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("publish <slug>").description("Make a skill publicly discoverable").option("--json", "Output result as JSON").action(async (slug, opts) => {
    const spinner = spin(`Publishing skill "${slug}"\u2026`);
    try {
      const client = makeClient();
      const res = await client.skills.update(slug, { isPublic: true });
      const skill = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(skill);
      console.log(`${sym.ok} Skill ${c.id(skill.slug)} is now ${c.success("public")}`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("unpublish <slug>").description("Make a skill private (remove from public marketplace)").option("--json", "Output result as JSON").action(async (slug, opts) => {
    const spinner = spin(`Unpublishing skill "${slug}"\u2026`);
    try {
      const client = makeClient();
      const res = await client.skills.update(slug, { isPublic: false });
      const skill = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(skill);
      console.log(`${sym.ok} Skill ${c.id(skill.slug)} is now ${c.warn("private")}`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("update <slug>").description("Update skill properties").option("--name <name>", "New display name").option("--description <desc>", "New description").option("--instructions <text>", "New instructions (markdown)").option("--tools <tools>", "Comma-separated tool names (replaces existing)").option("--triggers <triggers>", "Comma-separated trigger phrases (replaces existing)").option("--tags <tags>", "Comma-separated tags (replaces existing)").option("--icon <icon>", "Emoji icon").option("--json", "Output result as JSON").action(async (slug, opts) => {
    const updates = {};
    if (opts.name) updates.name = opts.name;
    if (opts.description) updates.description = opts.description;
    if (opts.instructions) updates.instructions = opts.instructions;
    if (opts.tools) updates.tools = opts.tools.split(",").map((t) => t.trim());
    if (opts.triggers) updates.triggers = opts.triggers.split(",").map((t) => t.trim());
    if (opts.tags) updates.tags = opts.tags.split(",").map((t) => t.trim());
    if (opts.icon) updates.icon = opts.icon;
    if (Object.keys(updates).length === 0) {
      console.error(c.warn("No fields to update. Use --name, --description, --instructions, etc."));
      process.exit(1);
    }
    const spinner = spin(`Updating skill "${slug}"\u2026`);
    try {
      const client = makeClient();
      const res = await client.skills.update(slug, updates);
      const skill = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(skill);
      console.log(`${sym.ok} Skill ${c.id(skill.slug)} updated`);
      detail([
        ["Name", skill.name],
        ["Description", skill.description ?? c.dim("(none)")],
        ["Public", skill.isPublic ? c.success("yes") : c.warn("no")],
        ["Tags", (skill.tags ?? []).join(", ") || c.dim("(none)")]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("delete <slug>").description("Permanently delete a skill").option("--yes", "Skip confirmation prompt").option("--json", "Output result as JSON").action(async (slug, opts) => {
    if (!opts.yes) {
      const readline3 = await import("readline");
      const rl = readline3.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(
        (resolve) => rl.question(c.warn(`Delete skill "${slug}"? This cannot be undone. [y/N] `), resolve)
      );
      rl.close();
      if (!["y", "yes"].includes(answer.trim().toLowerCase())) {
        console.log(c.dim("Aborted."));
        return;
      }
    }
    const spinner = spin(`Deleting skill "${slug}"\u2026`);
    try {
      const client = makeClient();
      const res = await client.skills.delete(slug);
      spinner.stop();
      if (opts.json) return jsonOut(res);
      console.log(`${sym.ok} Skill ${c.id(slug)} deleted`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/bin.ts
var program = new import_commander11.Command();
program.name("agc").description("Agent Commons CLI \u2014 interact with the Agent Commons platform").version("0.1.0", "-v, --version");
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(whoamiCommand());
program.addCommand(configCommand());
program.addCommand(agentsCommand());
program.addCommand(sessionsCommand());
program.addCommand(toolsCommand());
program.addCommand(workflowCommand());
program.addCommand(taskCommand());
program.addCommand(runCommand());
program.addCommand(chatCommand());
program.addCommand(mcpCommand());
program.addCommand(skillsCommand());
program.on("command:*", () => {
  console.error(`Unknown command: ${program.args.join(" ")}
Run \`agc --help\` to see available commands.`);
  process.exit(1);
});
program.parse(process.argv);
