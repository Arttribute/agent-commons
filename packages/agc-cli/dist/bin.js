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
var import_commander23 = require("commander");
var import_child_process3 = require("child_process");

// src/commands/login.ts
var import_commander = require("commander");
var import_fs2 = require("fs");
var import_os2 = require("os");
var import_path2 = require("path");

// src/config.ts
var import_fs = require("fs");
var import_os = require("os");
var import_path = require("path");
var import_sdk = require("@agent-commons/sdk");
var CONFIG_DIR = (0, import_path.join)((0, import_os.homedir)(), ".agc");
var CONFIG_FILE = (0, import_path.join)(CONFIG_DIR, "config.json");
var DEFAULT_API_URL = process.env.AGC_API_URL ?? "https://api.agentcommons.io";
var DEFAULT_IDENTITY_URL = process.env.COMMONS_IDENTITY_URL ?? "https://auth.agentcommons.io";
var DEFAULT_IDENTITY_CLIENT_ID = process.env.COMMONS_IDENTITY_CLIENT_ID ?? "commons-cli";
function readStoredConfig() {
  if (!(0, import_fs.existsSync)(CONFIG_FILE)) return {};
  try {
    return JSON.parse((0, import_fs.readFileSync)(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}
function loadConfig() {
  const fromEnv = {
    ...process.env.AGC_API_URL && { apiUrl: process.env.AGC_API_URL },
    ...process.env.AGC_API_KEY && { apiKey: process.env.AGC_API_KEY },
    ...process.env.COMMONS_ACCESS_TOKEN && { accessToken: process.env.COMMONS_ACCESS_TOKEN },
    ...process.env.COMMONS_IDENTITY_URL && { identityUrl: process.env.COMMONS_IDENTITY_URL },
    ...process.env.AGC_INITIATOR && { initiator: process.env.AGC_INITIATOR },
    ...process.env.AGC_AGENT_ID && { defaultAgentId: process.env.AGC_AGENT_ID }
  };
  const fromFile = readStoredConfig();
  return {
    apiUrl: DEFAULT_API_URL,
    identityUrl: DEFAULT_IDENTITY_URL,
    identityClientId: DEFAULT_IDENTITY_CLIENT_ID,
    ...fromFile,
    ...fromEnv
  };
}
function saveConfig(updates) {
  const next = {
    apiUrl: DEFAULT_API_URL,
    identityUrl: DEFAULT_IDENTITY_URL,
    identityClientId: DEFAULT_IDENTITY_CLIENT_ID,
    ...readStoredConfig(),
    ...updates
  };
  if (!(0, import_fs.existsSync)(CONFIG_DIR)) {
    (0, import_fs.mkdirSync)(CONFIG_DIR, { recursive: true, mode: 448 });
  }
  (0, import_fs.chmodSync)(CONFIG_DIR, 448);
  const temporaryFile = (0, import_path.join)(CONFIG_DIR, `.config-${process.pid}.tmp`);
  (0, import_fs.writeFileSync)(temporaryFile, JSON.stringify(next, null, 2) + "\n", {
    mode: 384
  });
  (0, import_fs.renameSync)(temporaryFile, CONFIG_FILE);
  (0, import_fs.chmodSync)(CONFIG_FILE, 384);
}
function clearConfig() {
  saveConfig({
    sessionToken: void 0,
    accessToken: void 0,
    accessTokenExpiresAt: void 0,
    userId: void 0,
    userEmail: void 0,
    userName: void 0,
    workspaceId: void 0,
    apiKey: void 0,
    initiator: void 0,
    defaultAgentId: void 0
  });
}
function makeClient(overrides) {
  const cfg = { ...loadConfig(), ...overrides };
  return new import_sdk.CommonsClient({
    baseUrl: cfg.apiUrl,
    identityUrl: cfg.identityUrl,
    identityToken: cfg.sessionToken,
    apiKey: cfg.accessToken ?? cfg.apiKey,
    initiator: cfg.userId ?? cfg.initiator
  });
}
function decodeJwtPayload(token) {
  const [, payload] = token.split(".");
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}
async function ensureAccessToken() {
  const cfg = loadConfig();
  if (cfg.accessToken && !cfg.sessionToken) return cfg;
  if (cfg.apiKey && !cfg.sessionToken) return cfg;
  if (cfg.accessToken && cfg.accessTokenExpiresAt && cfg.accessTokenExpiresAt > Date.now() + 3e4) {
    return cfg;
  }
  if (!cfg.sessionToken || !cfg.identityUrl) return cfg;
  const response = await fetch(
    `${cfg.identityUrl.replace(/\/$/, "")}/api/auth/token`,
    { headers: { Authorization: `Bearer ${cfg.sessionToken}` } }
  );
  if (response.status === 401 || response.status === 403) {
    throw new Error("Your Commons login has expired. Run `agc login` again.");
  }
  if (!response.ok) {
    throw new Error(
      `Commons Identity is unavailable (${response.status}). Please try again.`
    );
  }
  const data = await response.json();
  if (!data.token) throw new Error("Commons Identity did not return an access token.");
  const claims = decodeJwtPayload(data.token);
  const updates = {
    accessToken: data.token,
    accessTokenExpiresAt: typeof claims.exp === "number" ? claims.exp * 1e3 : Date.now() + 10 * 60 * 1e3,
    userId: typeof claims.sub === "string" ? claims.sub : cfg.userId,
    userEmail: typeof claims.email === "string" ? claims.email : cfg.userEmail,
    userName: typeof claims.name === "string" ? claims.name : cfg.userName,
    workspaceId: typeof claims.workspace_id === "string" ? claims.workspace_id : cfg.workspaceId,
    initiator: typeof claims.sub === "string" ? claims.sub : cfg.initiator
  };
  saveConfig(updates);
  return { ...cfg, ...updates };
}

// src/ui.ts
var import_chalk = __toESM(require("chalk"));
var import_ora = __toESM(require("ora"));
var import_child_process = require("child_process");
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
function banner(version = "0.4.0") {
  console.log("");
  console.log(import_chalk.default.cyan("        \u25C7"));
  console.log(import_chalk.default.cyan("    \u256D\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E"));
  console.log(
    import_chalk.default.cyan("    \u2502  ") + import_chalk.default.bold.white("AGENT COMMONS") + import_chalk.default.dim("  //  CLI") + import_chalk.default.cyan(`  v${version}`) + import_chalk.default.cyan("  \u2502")
  );
  console.log(import_chalk.default.cyan("    \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256F"));
  console.log(import_chalk.default.dim("       Build \xB7 run \xB7 connect \xB7 collaborate"));
  console.log("");
}
function step(n, total, title) {
  const fraction = import_chalk.default.dim(`${n}/${total}`);
  console.log(`
${import_chalk.default.cyan.bold("  Step " + n)} ${fraction}  ${import_chalk.default.bold(title)}`);
  console.log(import_chalk.default.dim("  " + "\u2500".repeat(38)));
}
async function select(prompt, choices) {
  if (!process.stdin.isTTY) {
    return choices[0].value;
  }
  let idx = 0;
  const total = choices.length;
  const render = (first = false) => {
    if (!first) {
      process.stdout.write(`\x1B[${total + 2}A\x1B[0J`);
    }
    console.log("\n" + import_chalk.default.bold("  " + prompt));
    for (let i = 0; i < total; i++) {
      const { label, hint } = choices[i];
      if (i === idx) {
        const hintStr = hint ? import_chalk.default.dim("  " + hint) : "";
        process.stdout.write(import_chalk.default.cyan("  \u203A ") + import_chalk.default.bold.white(label) + hintStr + "\n");
      } else {
        process.stdout.write(import_chalk.default.dim("    " + label) + "\n");
      }
    }
  };
  render(true);
  return new Promise((resolve2) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const handler = (data) => {
      const key = String(data);
      if (key === "\x1B[A" || key === "k") {
        idx = (idx - 1 + total) % total;
        render();
      } else if (key === "\x1B[B" || key === "j") {
        idx = (idx + 1) % total;
        render();
      } else if (key === "\r" || key === "\n" || key === " ") {
        cleanup();
        process.stdout.write("\n");
        resolve2(choices[idx].value);
      } else if (key === "") {
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
    };
    const cleanup = () => {
      process.stdin.removeListener("data", handler);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("data", handler);
  });
}
function openBrowser(url) {
  const command = process.platform === "darwin" ? { file: "open", args: [url] } : process.platform === "win32" ? { file: "cmd", args: ["/c", "start", "", url] } : { file: "xdg-open", args: [url] };
  const child = (0, import_child_process.spawn)(command.file, command.args, {
    detached: true,
    stdio: "ignore"
  });
  child.on("error", () => {
  });
  child.unref();
}
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
    console.error(`
  ${sym.fail} ${c.error(err.message)}
`);
  } else {
    console.error(`
  ${sym.fail} ${c.error(String(err))}
`);
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
var CONFIG_FILE2 = (0, import_path2.join)((0, import_os2.homedir)(), ".agc", "config.json");
var CLI_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "activity:read",
  "agents:create",
  "agents:read",
  "agents:write",
  "agents:run",
  "compute:read",
  "compute:write",
  "usage:read"
].join(" ");
async function jsonResponse(response) {
  return response.json().catch(() => ({}));
}
async function signInWithCommons(options) {
  step(1, 2, "Connect your Commons account");
  const starting = spin("Creating a secure sign-in request\u2026");
  const response = await fetch(`${options.identityUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: options.clientId,
      scope: CLI_SCOPES
    })
  });
  const device = await jsonResponse(response);
  starting.stop();
  if (!response.ok || !device.device_code || !device.user_code) {
    throw new Error(
      device.error_description ?? device.error ?? `Could not start Commons sign-in (${response.status}).`
    );
  }
  const verificationUrl = device.verification_uri_complete ?? `${device.verification_uri ?? `${options.identityUrl}/device`}?user_code=${encodeURIComponent(device.user_code)}`;
  console.log(`
  ${c.dim("Open this page to approve the CLI:")}`);
  console.log(`  ${c.primary(verificationUrl)}`);
  console.log(`
  ${c.dim("One-time code")}  ${c.bold(device.user_code)}
`);
  if (options.openBrowser) {
    openBrowser(verificationUrl);
    console.log(`  ${sym.arrow} ${c.dim("Your browser should open automatically.")}`);
  } else {
    console.log(`  ${sym.arrow} ${c.dim("Open the URL in any browser.")}`);
  }
  step(2, 2, "Approve in your browser");
  const waiting = spin("Waiting for approval\u2026");
  const deadline = Date.now() + (device.expires_in ?? 600) * 1e3;
  let intervalMs = Math.max(device.interval ?? 5, 1) * 1e3;
  let sessionToken;
  while (Date.now() < deadline) {
    await new Promise((resolve2) => setTimeout(resolve2, intervalMs));
    const tokenResponse = await fetch(
      `${options.identityUrl}/api/auth/device/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
          client_id: options.clientId
        })
      }
    );
    const token = await jsonResponse(tokenResponse);
    if (tokenResponse.ok && token.access_token) {
      sessionToken = token.access_token;
      break;
    }
    if (token.error === "slow_down") {
      intervalMs += 1e3;
      continue;
    }
    if (token.error === "authorization_pending") continue;
    waiting.stop();
    throw new Error(
      token.error_description ?? token.error ?? "Commons sign-in failed."
    );
  }
  waiting.stop();
  if (!sessionToken) {
    throw new Error("The sign-in request expired before it was approved.");
  }
  saveConfig({
    apiUrl: options.apiUrl,
    identityUrl: options.identityUrl,
    identityClientId: options.clientId,
    sessionToken,
    accessToken: void 0,
    accessTokenExpiresAt: void 0,
    apiKey: void 0
  });
  const authenticated = await ensureAccessToken();
  const identity = authenticated.userEmail ?? authenticated.userName ?? authenticated.userId ?? "Commons user";
  console.log(`
  ${sym.ok} ${c.success("Signed in")}  ${c.bold(identity)}`);
  if (authenticated.workspaceId) {
    console.log(
      `  ${sym.ok} ${c.dim("Workspace")}  ${c.id(authenticated.workspaceId)}`
    );
  }
}
async function useApiKey(options) {
  step(1, 1, "Verify API key");
  const checking = spin("Checking credentials\u2026");
  try {
    const { CommonsClient: CommonsClient2 } = await import("@agent-commons/sdk");
    const client = new CommonsClient2({
      baseUrl: options.apiUrl,
      apiKey: options.apiKey
    });
    const principal = await client.auth.me();
    const initiator = options.initiator ?? (principal.principalType === "user" ? principal.principalId ?? void 0 : void 0);
    saveConfig({
      apiUrl: options.apiUrl,
      apiKey: options.apiKey,
      initiator,
      sessionToken: void 0,
      accessToken: void 0,
      accessTokenExpiresAt: void 0,
      userId: initiator
    });
    checking.stop();
    console.log(`
  ${sym.ok} ${c.success("API key verified")}`);
    if (principal.principalId) {
      console.log(
        `  ${sym.ok} ${c.dim("Principal")}  ${c.id(principal.principalId)}`
      );
    }
  } catch (error) {
    checking.stop();
    throw error;
  }
}
function loginCommand() {
  return new import_commander.Command("login").description("Sign in with your Commons account").option("--api-url <url>", "Use a custom Agent Commons API endpoint").option("--identity-url <url>", "Use a custom Commons Identity endpoint").option("--client-id <id>", "Override the public CLI identity client ID").option("--no-browser", "Do not open the authorization page automatically").option("--api-key <key>", "Use a project API key for automation").option("--initiator <id>", "Optional delegated principal for compatible keys").action(async (opts) => {
    try {
      const current = loadConfig();
      const firstRun = !(0, import_fs2.existsSync)(CONFIG_FILE2);
      const apiUrl = String(opts.apiUrl ?? current.apiUrl ?? DEFAULT_API_URL).replace(
        /\/$/,
        ""
      );
      const identityUrl = String(
        opts.identityUrl ?? current.identityUrl ?? DEFAULT_IDENTITY_URL
      ).replace(/\/$/, "");
      const clientId = String(
        opts.clientId ?? current.identityClientId ?? DEFAULT_IDENTITY_CLIENT_ID
      );
      banner();
      console.log(
        c.bold(
          firstRun ? "  Welcome \u2014 let\u2019s connect your Agent Commons account." : "  Sign in to Agent Commons"
        )
      );
      console.log(
        c.dim(
          opts.apiKey ? "  API-key mode is intended for automation and CI.\n" : "  A browser approval keeps passwords and API keys out of your terminal.\n"
        )
      );
      if (opts.apiKey) {
        await useApiKey({
          apiUrl,
          apiKey: String(opts.apiKey),
          initiator: opts.initiator
        });
      } else {
        await signInWithCommons({
          apiUrl,
          identityUrl,
          clientId,
          openBrowser: opts.browser !== false
        });
      }
      console.log(
        `
  ${sym.ok} ${c.success("Ready.")} ${c.dim("Credentials are stored with user-only permissions.")}`
      );
      console.log(`  ${sym.arrow} ${c.bold("agc")} ${c.dim("open the command center")}`);
      console.log(
        `  ${sym.arrow} ${c.bold("agc agents list")} ${c.dim("list your agents")}`
      );
      console.log(
        `  ${sym.arrow} ${c.bold("agc chat")} ${c.dim("start a conversation")}
`
      );
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });
}
function logoutCommand() {
  return new import_commander.Command("logout").description("Sign out and clear locally stored credentials").action(() => {
    clearConfig();
    console.log(`
  ${sym.ok} Signed out. Local credentials were cleared.
`);
  });
}
function whoamiCommand() {
  return new import_commander.Command("whoami").description("Show the active identity and verify API access").option("--json", "Output as JSON").action(async (opts) => {
    try {
      const cfg = await ensureAccessToken();
      const authenticated = Boolean(
        cfg.sessionToken || cfg.accessToken || cfg.apiKey
      );
      let principal;
      if (authenticated) principal = await makeClient().auth.me();
      const output = {
        apiUrl: cfg.apiUrl,
        identityUrl: cfg.identityUrl,
        userId: cfg.userId ?? cfg.initiator ?? principal?.principalId,
        email: cfg.userEmail,
        name: cfg.userName,
        workspaceId: cfg.workspaceId,
        principalType: principal?.principalType,
        authMode: cfg.sessionToken ? "commons-account" : cfg.apiKey ? "api-key" : cfg.accessToken ? "access-token" : "none",
        authenticated
      };
      if (opts.json) {
        console.log(JSON.stringify(output, null, 2));
        return;
      }
      console.log(`
${c.bold("Identity")}`);
      detail([
        ["Account", cfg.userEmail ?? cfg.userName ?? c.dim("(not available)")],
        ["User ID", output.userId ?? c.dim("(not available)")],
        ["Workspace", cfg.workspaceId ?? c.dim("(not available)")],
        ["Auth", output.authMode],
        ["API", cfg.apiUrl],
        ["Default agent", cfg.defaultAgentId ?? c.dim("(not set)")]
      ]);
      console.log(
        authenticated ? `
  ${sym.ok} ${c.success("Authenticated and connected")}
` : `
  ${c.warn("\u25CB")} Not signed in. Run ${c.bold("agc login")}.
`
      );
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });
}
function configCommand() {
  const command = new import_commander.Command("config").description(
    "Inspect or update CLI preferences"
  );
  const allowed = [
    "apiUrl",
    "identityUrl",
    "apiKey",
    "initiator",
    "defaultAgentId"
  ];
  command.command("set <key> <value>").description(`Set a preference (${allowed.join(", ")})`).action((key, value) => {
    if (!allowed.includes(key)) {
      console.error(
        c.error(`Unknown key "${key}". Allowed: ${allowed.join(", ")}`)
      );
      process.exitCode = 1;
      return;
    }
    saveConfig({ [key]: value });
    console.log(
      `${sym.ok} ${key} = ${key === "apiKey" ? `****${value.slice(-4)}` : value}`
    );
  });
  command.command("get [key]").description("Show one preference or the complete non-secret configuration").action((key) => {
    const cfg = loadConfig();
    if (key) {
      if (["apiKey", "sessionToken", "accessToken"].includes(key)) {
        const value = cfg[key];
        console.log(value ? `****${value.slice(-4)}` : c.dim("(not set)"));
        return;
      }
      console.log(String(cfg[key] ?? c.dim("(not set)")));
      return;
    }
    detail([
      ["apiUrl", cfg.apiUrl],
      ["identityUrl", cfg.identityUrl],
      ["user", cfg.userEmail ?? cfg.userId ?? cfg.initiator ?? ""],
      ["workspaceId", cfg.workspaceId ?? ""],
      ["auth", cfg.sessionToken ? "Commons account" : cfg.apiKey ? "API key" : ""],
      ["defaultAgentId", cfg.defaultAgentId ?? ""]
    ]);
  });
  return command;
}

// src/commands/agents.ts
var import_commander2 = require("commander");
function agentsCommand() {
  const cmd = new import_commander2.Command("agents").description("Manage agents");
  cmd.command("list").description("List agents owned by the current initiator").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
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
          Runtime: a.runtimeType ?? "native",
          Model: `${a.modelProvider}/${a.modelId}`,
          Created: relativeTime(a.createdAt)
        })),
        ["ID", "Name", "Runtime", "Model", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <agentId>").description("Show details for an agent").option("--json", "Output as JSON").action(async (agentId2, opts) => {
    const spinner = spin("Fetching agent\u2026");
    try {
      const client = makeClient();
      const res = await client.agents.get(agentId2);
      const agent = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(agent);
      section(agent.name);
      detail([
        ["Agent ID", c.id(agent.agentId)],
        ["Provider", `${agent.modelProvider} / ${agent.modelId}`],
        ["Runtime", agent.runtimeType ?? "native"],
        ["Runtime status", agent.runtimeStatus ?? "ready"],
        ["Instructions", agent.instructions?.slice(0, 80) ?? c.dim("(none)")],
        [
          "Tools",
          [...agent.commonTools ?? [], ...agent.externalTools ?? []].join(
            ", "
          ) || c.dim("(none)")
        ],
        ["Created", relativeTime(agent.createdAt)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Create a new agent").requiredOption("--name <name>", "Agent name").option("--instructions <text>", "System instructions").option(
    "--provider <provider>",
    "Model provider (openai|anthropic|google|groq|openrouter|xai|ollama|custom)",
    "openai"
  ).option("--model <id>", "Model ID", "gpt-5.4-mini").option("--model-api-key <key>", "Provider API key (BYOK)").option(
    "--model-base-url <url>",
    "Base URL for custom or local OpenAI-compatible providers"
  ).option(
    "--runtime <runtime>",
    "Agent runtime (native|openclaw|hermes|custom)",
    "native"
  ).option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Creating agent\u2026");
    try {
      if (!["native", "openclaw", "hermes", "custom"].includes(opts.runtime)) {
        throw new Error(`Unsupported runtime "${opts.runtime}"`);
      }
      const client = makeClient();
      const res = await client.agents.create({
        name: opts.name,
        instructions: opts.instructions,
        owner: cfg.initiator,
        modelProvider: opts.provider,
        modelId: opts.model,
        modelApiKey: opts.modelApiKey,
        modelBaseUrl: opts.modelBaseUrl,
        runtimeType: opts.runtime
      });
      const agent = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(agent);
      console.log(`
${sym.ok} Agent created`);
      detail([
        ["Agent ID", c.id(agent.agentId)],
        ["Name", agent.name],
        ["Model", `${agent.modelProvider}/${agent.modelId}`],
        ["Runtime", agent.runtimeType ?? opts.runtime]
      ]);
      console.log(
        c.dim("\n  Tip: agc config set defaultAgentId " + agent.agentId)
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  const runtime = cmd.command("runtime").description("Manage an agent runtime");
  runtime.command("status <agentId>").description("Show managed runtime status and capabilities").option("--json", "Output as JSON").action(async (agentId2, opts) => {
    const spinner = spin("Fetching runtime status\u2026");
    try {
      const result = await makeClient().agents.getRuntime(agentId2);
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      detail([
        ["Runtime", result.data.runtimeType],
        ["Status", result.data.status],
        ["Managed", result.data.managed ? "yes" : "no"],
        ["Computer", result.data.computer?.computerId ?? c.dim("(none)")]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  for (const action of ["deploy", "restart", "sleep"]) {
    runtime.command(`${action} <agentId>`).description(
      `${action[0].toUpperCase()}${action.slice(1)} the managed agent runtime`
    ).action(async (agentId2) => {
      const spinner = spin(
        `${action[0].toUpperCase()}${action.slice(1)}ing runtime\u2026`
      );
      try {
        const client = makeClient();
        const result = action === "deploy" ? await client.agents.deployRuntime(agentId2) : action === "restart" ? await client.agents.restartRuntime(agentId2) : await client.agents.sleepRuntime(agentId2);
        spinner.stop();
        console.log(`
${sym.ok} Runtime ${result.data.status}`);
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    });
  }
  const autonomy = cmd.command("autonomy").description("Manage agent heartbeat");
  autonomy.command("status").description("Show autonomy status for an agent").requiredOption("--agent <agentId>", "Agent ID").option("--json", "Output as JSON").action(async (opts) => {
    const client = makeClient();
    const spinner = spin("Fetching autonomy status\u2026");
    try {
      const res = await client.agents.getAutonomy(opts.agent);
      spinner.stop();
      const s = res.data;
      if (opts.json) return jsonOut(s);
      console.log(`
${c.bold("Heartbeat Status")}`);
      detail([
        ["Enabled", s.enabled ? c.bold("yes") : "no"],
        ["Interval", s.intervalSec ? `${s.intervalSec}s` : "n/a"],
        ["Armed", s.isArmed ? c.bold("yes") : "no"],
        [
          "Last beat",
          s.lastBeatAt ? new Date(s.lastBeatAt).toLocaleString() : "never"
        ],
        [
          "Next beat",
          s.nextBeatAt ? new Date(s.nextBeatAt).toLocaleString() : "n/a"
        ]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  autonomy.command("enable").description("Enable heartbeat for an agent").requiredOption("--agent <agentId>", "Agent ID").option(
    "--interval <seconds>",
    "Heartbeat interval in seconds (min 30)",
    "300"
  ).action(async (opts) => {
    const client = makeClient();
    const spinner = spin("Enabling autonomy\u2026");
    try {
      await client.agents.setAutonomy(opts.agent, {
        enabled: true,
        intervalSec: parseInt(opts.interval, 10)
      });
      spinner.stop();
      console.log(
        `
${sym.ok} Autonomy enabled for agent ${c.id(opts.agent)}`
      );
      console.log(c.dim(`  Heartbeat every ${opts.interval}s`));
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  autonomy.command("disable").description("Disable heartbeat for an agent").requiredOption("--agent <agentId>", "Agent ID").action(async (opts) => {
    const client = makeClient();
    const spinner = spin("Disabling autonomy\u2026");
    try {
      await client.agents.setAutonomy(opts.agent, { enabled: false });
      spinner.stop();
      console.log(
        `
${sym.ok} Autonomy disabled for agent ${c.id(opts.agent)}`
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  autonomy.command("trigger").description("Trigger a single heartbeat immediately").requiredOption("--agent <agentId>", "Agent ID").action(async (opts) => {
    const client = makeClient();
    const spinner = spin("Triggering heartbeat\u2026");
    try {
      await client.agents.triggerHeartbeat(opts.agent);
      spinner.stop();
      console.log(
        `
${sym.ok} Heartbeat triggered for agent ${c.id(opts.agent)}`
      );
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
  cmd.command("list").description("List sessions \u2014 all for the current user, or filtered by agent").option("--agent <agentId>", "Filter by agent ID (default: all agents)").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Fetching sessions\u2026");
    try {
      const client = makeClient();
      const agentId2 = opts.agent;
      const res = agentId2 ? await client.sessions.list(agentId2, cfg.initiator) : await client.sessions.listByUser(cfg.initiator);
      const sessions = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(sessions);
      section(`Sessions (${sessions.length})${agentId2 ? ` \u2014 agent ${agentId2.slice(0, 8)}\u2026` : " \u2014 all agents"}`);
      table(
        sessions.map((s) => ({
          ID: s.sessionId.slice(0, 8) + "\u2026",
          Agent: s.agentId ? s.agentId.slice(0, 8) + "\u2026" : "",
          Title: s.title ?? c.dim("(untitled)"),
          Created: relativeTime(s.createdAt)
        })),
        ["ID", "Agent", "Title", "Created"]
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
  cmd.command("create").description("Create a new session").option("--agent <agentId>", "Agent ID").option("--title <title>", "Session title").option("--model <id>", "Model ID (e.g. gpt-5.4-mini, claude-sonnet-4-6)").option("--provider <provider>", "Model provider").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
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
        agentId: agentId2,
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
  cmd.command("rename <sessionId> <title>").description("Rename a session").option("--json", "Output as JSON").action(async (sessionId, title, opts) => {
    const spinner = spin("Renaming session\u2026");
    try {
      const result = await makeClient().sessions.rename(sessionId, title);
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`
${sym.ok} Session renamed to ${c.bold(result.data.title ?? title)}`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("delete <sessionId>").description("Delete a session").option("--json", "Output as JSON").action(async (sessionId, opts) => {
    const spinner = spin("Deleting session\u2026");
    try {
      const result = await makeClient().sessions.delete(sessionId);
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`
${sym.ok} Session deleted.`);
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
var import_fs3 = require("fs");
function toolsCommand() {
  const cmd = new import_commander4.Command("tools").description("Discover and manage tools");
  cmd.command("create").description("Create a tool from a JSON file").requiredOption("--file <path>", "Path to a JSON tool definition").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    let payload;
    try {
      payload = JSON.parse((0, import_fs3.readFileSync)(opts.file, "utf8"));
    } catch (error) {
      console.error(c.error(`Could not read tool file: ${error.message}`));
      process.exit(1);
    }
    if (!payload.name || !payload.schema) {
      console.error(c.error('Tool file must include at least "name" and "schema".'));
      process.exit(1);
    }
    const spinner = spin("Creating tool\u2026");
    try {
      const client = makeClient();
      const res = await client.tools.create({
        ...payload,
        owner: cfg.initiator,
        ownerType: payload.ownerType ?? "user"
      });
      const tool = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(tool);
      console.log(`
${sym.ok} Tool created`);
      detail([
        ["Tool ID", c.id(tool.toolId)],
        ["Name", tool.name],
        ["Visibility", tool.visibility ?? payload.visibility ?? "private"]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
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
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
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
    const prompt = `Call the tool "${toolName}" with these arguments: ${JSON.stringify(args)}. Return only the tool result, nothing else.`;
    const spinner = spin(`Executing ${toolName}\u2026`);
    try {
      const client = makeClient();
      const result = await client.run.once({
        agentId: agentId2,
        messages: [{ role: "user", content: prompt }],
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

// src/commands/connections.ts
var import_commander5 = require("commander");
function connectionsCommand() {
  const cmd = new import_commander5.Command("connections").description(
    "Manage OAuth account connections (Google Workspace, GitHub, Slack, \u2026) that agents act with"
  );
  cmd.command("list", { isDefault: true }).description("List your connected accounts").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const spinner = spin("Fetching connections\u2026");
    try {
      const client = makeClient();
      const res = await client.oauth.listConnections(
        cfg.initiator ? { ownerId: cfg.initiator, ownerType: "user" } : void 0
      );
      const connections = res?.connections ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(connections);
      section(`Connections (${connections.length})`);
      if (connections.length === 0) {
        console.log(c.dim("  No connected accounts. Run `agc connections connect <provider>`."));
        return;
      }
      table(
        connections.map((conn) => ({
          ID: (conn.connectionId ?? "").slice(0, 8) + "\u2026",
          Provider: conn.providerDisplayName || conn.providerKey || "",
          Account: conn.providerUserEmail || conn.providerUserName || "",
          Status: conn.status ?? "",
          Scopes: String((conn.scopes ?? []).length),
          Used: conn.lastUsedAt ? relativeTime(conn.lastUsedAt) : c.dim("never")
        })),
        ["ID", "Provider", "Account", "Status", "Scopes", "Used"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("providers").description("List OAuth providers available to connect").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching providers\u2026");
    try {
      const client = makeClient();
      const res = await client.oauth.listProviders();
      const providers = res?.providers ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(providers);
      section(`Providers (${providers.length})`);
      table(
        providers.map((p) => ({
          Key: p.providerKey ?? "",
          Name: p.displayName ?? "",
          Active: p.isActive ? "yes" : "no"
        })),
        ["Key", "Name", "Active"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("connect <providerKey>").description("Connect an account: prints an authorization URL to open in your browser").option("--scopes <scopes>", "Space-separated OAuth scopes to request").option("--no-browser", "Do not open the authorization URL automatically").option("--json", "Output as JSON").action(async (providerKey, opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const spinner = spin("Starting OAuth flow\u2026");
    try {
      const client = makeClient();
      const res = await client.oauth.connect({
        providerKey,
        ...opts.scopes ? { scopes: String(opts.scopes).split(/\s+/).filter(Boolean) } : {}
      });
      spinner.stop();
      if (opts.json) return jsonOut(res);
      if (opts.browser !== false) openBrowser(res.authorizationUrl);
      console.log(`
${sym.ok} Authorize the connection in your browser:`);
      console.log(`
  ${c.id(res.authorizationUrl)}
`);
      console.log(c.dim("  After approving, the connection appears in `agc connections list`."));
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("get <connectionId>").description("Show a connected account").option("--json", "Output as JSON").action(async (connectionId, opts) => {
    const spinner = spin("Fetching connection\u2026");
    try {
      const result = await makeClient().oauth.getConnection(connectionId);
      spinner.stop();
      if (opts.json) return jsonOut(result.connection);
      const connection = result.connection;
      detail([
        ["Connection ID", c.id(connection.connectionId)],
        ["Provider", connection.providerDisplayName ?? connection.providerKey],
        ["Account", connection.providerUserEmail ?? connection.providerUserName ?? ""],
        ["Status", connection.status],
        ["Scopes", connection.scopes.join(", ")],
        [
          "Expires",
          connection.accessTokenExpiresAt ?? connection.expiresAt ?? c.dim("(does not expire)")
        ]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("refresh <connectionId>").description("Refresh a connected account token").action(async (connectionId) => {
    const spinner = spin("Refreshing connection\u2026");
    try {
      await makeClient().oauth.refresh(connectionId);
      spinner.stop();
      console.log(`${sym.ok} Connection refreshed.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("rename <connectionId> <name>").description("Set a friendly name for a connected account").action(async (connectionId, name) => {
    const spinner = spin("Updating connection\u2026");
    try {
      await makeClient().oauth.updateConnection(connectionId, {
        displayName: name
      });
      spinner.stop();
      console.log(`${sym.ok} Connection renamed to ${c.bold(name)}.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("test <connectionId>").description("Check that a connection is active and its token is valid").option("--json", "Output as JSON").action(async (connectionId, opts) => {
    const spinner = spin("Testing connection\u2026");
    try {
      const client = makeClient();
      const res = await client.oauth.test(connectionId);
      spinner.stop();
      if (opts.json) return jsonOut(res);
      detail([
        ["Status", res.status],
        ["Token valid", res.accessTokenValid ? "yes" : "no"],
        ["Account", res.providerUserEmail ?? c.dim("(unknown)")],
        ["Last error", res.error ?? c.dim("(none)")]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("revoke <connectionId>").description("Revoke a connection and delete its stored tokens").action(async (connectionId) => {
    const spinner = spin("Revoking connection\u2026");
    try {
      const client = makeClient();
      await client.oauth.revoke(connectionId);
      spinner.stop();
      console.log(`${sym.ok} Connection revoked.`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/workflow.ts
var import_commander6 = require("commander");
var import_fs4 = require("fs");
var import_sdk2 = require("@agent-commons/sdk");
function workflowCommand() {
  const cmd = new import_commander6.Command("workflow").description("Run and monitor workflows").alias("wf");
  async function createTemplateWorkflow(params) {
    const client = makeClient();
    const template = (0, import_sdk2.buildWorkflowTemplate)(params.templateName, params.ctx);
    const toolIds = {};
    const createdTools = [];
    for (const tool of template.tools) {
      const created = await client.tools.create({
        ...tool.payload,
        owner: params.ctx.ownerId,
        ownerType: "user"
      });
      const createdTool = created?.data ?? created;
      toolIds[tool.key] = createdTool.toolId;
      createdTools.push(createdTool);
    }
    const workflow = await client.workflows.create({
      name: template.name,
      description: template.description,
      ownerId: params.ctx.ownerId,
      ownerType: "user",
      isPublic: params.isPublic,
      category: template.category,
      tags: template.tags,
      definition: template.buildDefinition(toolIds, params.ctx)
    });
    return { template, workflow, createdTools };
  }
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
  cmd.command("create").description("Create a workflow from a JSON file").requiredOption("--file <path>", "Path to a workflow payload or definition JSON file").option("--name <name>", "Workflow name").option("--description <text>", "Workflow description").option("--public", "Make workflow public").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    let fileJson;
    try {
      fileJson = JSON.parse((0, import_fs4.readFileSync)(opts.file, "utf8"));
    } catch (error) {
      console.error(c.error(`Could not read workflow file: ${error.message}`));
      process.exit(1);
    }
    const definition = fileJson.definition ?? fileJson;
    if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
      console.error(c.error('Workflow file must include a definition with "nodes" and "edges".'));
      process.exit(1);
    }
    const spinner = spin("Creating workflow\u2026");
    try {
      const client = makeClient();
      const workflow = await client.workflows.create({
        name: opts.name ?? fileJson.name ?? "CLI Workflow",
        description: opts.description ?? fileJson.description,
        definition,
        ownerId: cfg.initiator,
        ownerType: "user",
        isPublic: opts.public ?? fileJson.isPublic,
        category: fileJson.category,
        tags: fileJson.tags
      });
      spinner.stop();
      if (opts.json) return jsonOut(workflow);
      console.log(`
${sym.ok} Workflow created`);
      detail([
        ["Workflow ID", c.id(workflow.workflowId)],
        ["Name", workflow.name],
        ["Nodes", String((workflow.definition?.nodes ?? []).length)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  const templates = cmd.command("templates").description("Create workflows from built-in templates");
  templates.command("list").description("List built-in workflow templates").option("--json", "Output as JSON").action((opts) => {
    const rows = (0, import_sdk2.listWorkflowTemplates)();
    if (opts.json) return jsonOut(rows);
    section(`Workflow Templates (${rows.length})`);
    table(
      rows.map((template) => ({
        Name: template.name,
        Description: template.description
      })),
      ["Name", "Description"]
    );
  });
  templates.command("create <templateName>").description("Create a workflow template and its required API tools").option("--prefix <prefix>", "Stable prefix for generated tool/workflow names").option("--agent <agentId>", "Agent ID for agent_processor nodes").option("--reviewer-agent <agentId>", "Second agent ID for multi-agent templates").option("--child-workflow <workflowId>", "Child workflow ID for workflow-invocation-smoke").option("--public", "Make workflow public").option("--run", "Run the workflow after creating it").option("--input <json>", "Run input JSON; defaults to template sample input").option("--json", "Output as JSON").action(async (templateNameRaw, opts) => {
    const cfg = loadConfig();
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const templateNames = (0, import_sdk2.listWorkflowTemplates)().map((item) => item.name);
    if (!templateNames.includes(templateNameRaw)) {
      console.error(c.error(`Unknown template "${templateNameRaw}".`));
      console.error(c.dim(`Available: ${templateNames.join(", ")}`));
      process.exit(1);
    }
    const templateName = templateNameRaw;
    const needsAgent = templateName === "agent-research-summary" || templateName === "multi-agent-field-report";
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (needsAgent && !agentId2) {
      console.error(c.error("This template requires --agent <agentId> or a configured defaultAgentId."));
      process.exit(1);
    }
    const prefix = opts.prefix ?? `cli_${templateName.replace(/[^a-z0-9]+/gi, "_")}_${Date.now().toString(36)}`;
    const spinner = spin("Creating workflow template\u2026");
    try {
      let childWorkflowId = opts.childWorkflow;
      let childResult;
      if (templateName === "workflow-invocation-smoke" && !childWorkflowId) {
        const childCtx = {
          ownerId: cfg.initiator,
          prefix: `${prefix}_child`
        };
        childResult = await createTemplateWorkflow({
          templateName: "country-weather-brief",
          ctx: childCtx,
          isPublic: opts.public
        });
        childWorkflowId = childResult.workflow.workflowId;
      }
      const ctx = {
        ownerId: cfg.initiator,
        prefix,
        agentId: agentId2,
        reviewerAgentId: opts.reviewerAgent,
        childWorkflowId
      };
      const result = await createTemplateWorkflow({
        templateName,
        ctx,
        isPublic: opts.public
      });
      let execution;
      if (opts.run) {
        let inputData = result.template.sampleInput;
        if (opts.input) {
          try {
            inputData = JSON.parse(opts.input);
          } catch {
            throw new Error("--input must be valid JSON");
          }
        }
        execution = await makeClient().workflows.execute(result.workflow.workflowId, {
          agentId: agentId2,
          inputData,
          userId: cfg.initiator
        });
      }
      spinner.stop();
      const output = { ...result, child: childResult, execution };
      if (opts.json) return jsonOut(output);
      console.log(`
${sym.ok} Workflow template created`);
      if (childResult) {
        detail([
          ["Child workflow", c.id(childResult.workflow.workflowId)],
          ["Parent workflow", c.id(result.workflow.workflowId)],
          ["Template", templateName]
        ]);
      } else {
        detail([
          ["Workflow ID", c.id(result.workflow.workflowId)],
          ["Template", templateName],
          ["Tools created", String(result.createdTools.length)]
        ]);
      }
      if (execution) {
        console.log(`
${sym.ok} Execution started: ${c.id(execution.executionId)}`);
        console.log(`   Status: ${statusBadge(execution.status)}`);
        const resultData = execution.result ?? execution.outputData;
        if (resultData !== void 0) {
          console.log("\n" + c.label("Result"));
          console.log("  " + JSON.stringify(resultData, null, 2).replace(/\n/g, "\n  "));
        }
      } else {
        console.log(c.dim(`
  Run it with: agc workflow run ${result.workflow.workflowId} --input '${JSON.stringify(result.template.sampleInput)}'`));
      }
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
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
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
        agentId: agentId2,
        sessionId: opts.session,
        inputData
      });
      spinner.stop();
      if (opts.json && !opts.watch) return jsonOut(execution);
      console.log(`
${sym.ok} Execution started: ${c.id(execution.executionId)}`);
      console.log(`   Status: ${statusBadge(execution.status)}`);
      if (!opts.watch) {
        const result = execution.result ?? execution.outputData;
        if (execution.status === "completed") {
          console.log("\n" + c.label("Result"));
          console.log("  " + JSON.stringify(result, null, 2));
          const steps = execution.stepResults ?? execution.nodeResults;
          if (steps && Object.keys(steps).length > 0) {
            console.log("\n" + c.label("Step Results"));
            for (const [nodeId, step2] of Object.entries(steps)) {
              const icon = step2.status === "success" ? sym.ok : step2.status === "error" ? sym.fail : "\xB7";
              const dur = step2.duration != null ? c.dim(` (${(step2.duration / 1e3).toFixed(2)}s)`) : "";
              console.log(`  ${icon} ${c.id(nodeId)}${dur}`);
              if (step2.error) console.log(`    ${c.error(step2.error)}`);
              else if (step2.output !== void 0) console.log(`    ${JSON.stringify(step2.output, null, 2).replace(/\n/g, "\n    ")}`);
            }
          }
        } else {
          console.log(c.dim(`
  Workflow is ${execution.status}. Use --watch to stream progress.`));
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
          if (e.outputData != null) {
            console.log("\n" + c.label("Output"));
            console.log("  " + JSON.stringify(e.outputData, null, 2));
          }
          if (e.nodeResults && Object.keys(e.nodeResults).length > 0) {
            console.log("\n" + c.label("Step Results"));
            for (const [nodeId, step2] of Object.entries(e.nodeResults)) {
              const icon = step2.status === "success" ? sym.ok : step2.status === "error" ? sym.fail : "\xB7";
              const dur = step2.duration != null ? c.dim(` (${(step2.duration / 1e3).toFixed(2)}s)`) : "";
              console.log(`  ${icon} ${c.id(nodeId)}${dur}`);
              if (step2.error) console.log(`    ${c.error(step2.error)}`);
              else if (step2.output !== void 0) console.log(`    ${JSON.stringify(step2.output, null, 2).replace(/\n/g, "\n    ")}`);
            }
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
var import_commander7 = require("commander");
function taskCommand() {
  const cmd = new import_commander7.Command("task").description("Manage and execute tasks").alias("t");
  cmd.command("list").description("List tasks").option("--agent <agentId>", "Filter by agent ID").option("--session <sessionId>", "Filter by session ID").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    const spinner = spin("Fetching tasks\u2026");
    try {
      const client = makeClient();
      const filter = {};
      if (agentId2) filter.agentId = agentId2;
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
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
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
        agentId: agentId2,
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
var import_commander8 = require("commander");
var readline2 = __toESM(require("readline"));

// src/local-tools.ts
var import_fs5 = require("fs");
var import_path3 = require("path");
var import_child_process2 = require("child_process");
var readline = __toESM(require("readline"));
var pdfParse = require("pdf-parse/lib/pdf-parse.js");
var managedProcesses = /* @__PURE__ */ new Map();
function capBuffer(existing, chunk, maxBytes) {
  const joined = existing + chunk;
  if (joined.length <= maxBytes) return joined;
  return "\u2026(truncated)\n" + joined.slice(-(maxBytes - 20));
}
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", "node_modules", ".cache", "__pycache__", ".next", "dist", "build", ".DS_Store"]);
function buildDirSnapshot(dir, maxDepth = 2) {
  const lines = [`${dir}/`];
  function walk(d, depth, prefix) {
    if (lines.length >= 300) return;
    let entries;
    try {
      entries = (0, import_fs5.readdirSync)(d, { withFileTypes: true });
    } catch {
      return;
    }
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of sorted) {
      if (lines.length >= 300) {
        lines.push(`${prefix}... (truncated)`);
        return;
      }
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      const isDir = entry.isDirectory();
      lines.push(`${prefix}${entry.name}${isDir ? "/" : ""}`);
      if (isDir && depth < maxDepth) walk((0, import_path3.join)(d, entry.name), depth + 1, prefix + "  ");
    }
  }
  walk(dir, 1, "  ");
  return lines.join("\n");
}
function readFileForContext(rootDir, filePath) {
  try {
    const abs = (0, import_path3.resolve)(rootDir, filePath);
    const rel = (0, import_path3.relative)(rootDir, abs);
    if (rel.startsWith("..") || rel.startsWith("/")) return `[error: path escapes session root]`;
    for (const pat of [/\/\.ssh\//, /\/\.aws\//, /\/\.env$/, /\/\.env\./, /id_rsa/, /id_ed25519/]) {
      if (pat.test(abs)) return `[error: sensitive path blocked]`;
    }
    if (!(0, import_fs5.existsSync)(abs)) return `[error: file not found: ${filePath}]`;
    const stat = (0, import_fs5.statSync)(abs);
    if (stat.isDirectory()) return `[error: "${filePath}" is a directory \u2014 use list_directory]`;
    if (stat.size > 1e5) return `[truncated \u2014 file too large (${Math.round(stat.size / 1024)} KB). Use cli_read_file for full content]`;
    return (0, import_fs5.readFileSync)(abs, "utf8");
  } catch (err) {
    return `[error reading file: ${err?.message}]`;
  }
}
function buildLocalToolsManifest(rootDir, snapshot, fileContextBlocks = [], autoApprove = false) {
  const fileSection = fileContextBlocks.length ? `
### File contents included in this turn

${fileContextBlocks.join("\n\n")}
` : "";
  return `
## CLI Local File System \u2014 ACTIVE

You are running inside a CLI session with DIRECT access to the user's local machine. The following tools are in your tool list and execute on the user's machine in real time.

**Session root:** ${rootDir}

### Current file system (live snapshot)

\`\`\`
${snapshot}
\`\`\`
${fileSection}

### MANDATORY RULES \u2014 READ CAREFULLY

1. **Call cli_* tools immediately and directly.** Do NOT create tasks (createTask) for local file operations. Do NOT delegate to sub-agents. Do NOT ask the user to run commands themselves.
2. **Own the request through completion.** Continue across tool calls, process polling, retries, debugging, and verification. Do not stop after describing a plan or asking whether to proceed when the request is already clear.
3. **Use actual tool output as evidence.** Summarize the important result; do not fabricate success or dump noisy logs unless they help diagnose a failure.
4. **Never fabricate results.** Wait for the real tool output before responding.
5. **Sensitive paths are blocked** (.ssh, .gnupg, .aws, .env, credentials). Attempting to access them will return an error.
6. ${autoApprove ? "**cli_write_file and cli_run_command execute immediately** \u2014 auto-approve is active, no user confirmation is required." : "**cli_write_file and cli_run_command require the user to confirm** before executing \u2014 you will see the result after they approve."}
7. **Git commits must carry the agc co-author trailer.** Always include \`--trailer "Co-Authored-By: <AgentName> (agc) <agc-agent@users.noreply.github.com>"\` when running \`git commit\`. The CLI injects this automatically \u2014 do not omit it or pass \`--no-trailer\`.

### Available CLI tools

| Tool | What it does |
|------|-------------|
| \`cli_list_directory\` | List files and folders at a path |
| \`cli_read_file\` | Read a file (PDF and Word docs are extracted to text) |
| \`cli_write_file\` | Write or overwrite a file (user confirmation required) |
| \`cli_search_files\` | Find files matching a pattern |
| \`cli_run_command\` | Run a short command and return its output (user confirmation required) |
| \`cli_start_process\` | Start a long-running command in the background; returns a processId immediately |
| \`cli_wait_for_process\` | Block up to N seconds for a background process, then return current output |
| \`cli_process_status\` | Instant non-blocking check on a background process |
| \`cli_kill_process\` | Kill a running background process |
| \`cli_list_processes\` | List all background processes started this session |

### Choosing between run_command and start_process

| Situation | Use |
|-----------|-----|
| Command finishes in under ~30s | \`cli_run_command\` |
| Command may take minutes (npm install, build, scaffold) | \`cli_start_process\` + \`cli_wait_for_process\` |
| Command needs live stdin (e.g. a REPL) | \`cli_run_command\` with \`"interactive": true\` |

### run_command options
- \`timeout_seconds\` (default 120, max 300) \u2014 kill the process after N seconds
- \`interactive\` (boolean) \u2014 connects the user's terminal stdin for commands that need input

### start_process + wait_for_process pattern

For long commands like \`npx create-next-app@latest my-app --yes\`:

1. Call \`cli_start_process\` \u2014 it returns \`{processId, status: "running"}\` immediately.
2. Call \`cli_wait_for_process\` with \`{"processId": "...", "wait_seconds": 60}\`.
3. Repeat step 2 until \`status\` is \`"done"\` or \`"error"\`; diagnose and repair errors when possible.
4. Continue with the rest of the assignment and verify the final outcome before responding.

Do not end the turn merely because a process is still running. Keep polling within the same run. Progress events may be streamed by the client, but the final answer comes only after completion or a genuine blocker.

### Example \u2014 scaffolding a Next.js project

\`\`\`
cli_start_process: {"command": "npx", "args": ["create-next-app@latest", "my-app", "--yes"], "cwd": "Desktop"}
\u2192 {processId: "proc_1a2b", status: "running"}

cli_wait_for_process: {"processId": "proc_1a2b", "wait_seconds": 60}
\u2192 {status: "running", elapsedSec: 60, stdout: "Creating project...
Installing packages\u2026"}

cli_wait_for_process: {"processId": "proc_1a2b", "wait_seconds": 60}
\u2192 {status: "done", exitCode: 0, elapsedSec: 93, stdout: "Success! Created my-app"}

Continue by running the requested checks and opening/inspecting the app when the assignment requires it.
\`\`\`
`;
}
var TOOL_CALL_RE = /```tool\s*\n([\s\S]*?)\n```/;
function extractToolCall(text) {
  const match = text.match(TOOL_CALL_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (typeof parsed.tool === "string") return parsed;
  } catch {
  }
  return null;
}
function injectAgcTrailer(command, args, agentId2, agentName) {
  if (command !== "git") return args;
  if (!args.some((a) => a === "commit")) return args;
  if (args.some((a) => a.includes("Co-Authored-By: agc"))) return args;
  const identity = agentName ? `${agentName} (agc)` : agentId2 ? `agc/${agentId2}` : "agc agent";
  return [...args, "--trailer", `Co-Authored-By: ${identity} <agc-agent@users.noreply.github.com>`];
}
var AGC_HOOK_MARKER = "# agc-session:";
var HOOK_BACKUP_SUFFIX = ".agc-backup";
function findGitDir(rootDir) {
  const gitPath = (0, import_path3.join)(rootDir, ".git");
  if (!(0, import_fs5.existsSync)(gitPath)) return null;
  const s = (0, import_fs5.statSync)(gitPath);
  if (s.isDirectory()) return gitPath;
  if (s.isFile()) {
    const content = (0, import_fs5.readFileSync)(gitPath, "utf8");
    const match = content.match(/^gitdir:\s*(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}
function installGitHook(rootDir, sessionId, agentId2, agentName) {
  const gitDir = findGitDir(rootDir);
  if (!gitDir) return;
  const hooksDir = (0, import_path3.join)(gitDir, "hooks");
  (0, import_fs5.mkdirSync)(hooksDir, { recursive: true });
  const hookPath = (0, import_path3.join)(hooksDir, "prepare-commit-msg");
  if ((0, import_fs5.existsSync)(hookPath)) {
    const existing = (0, import_fs5.readFileSync)(hookPath, "utf8");
    if (!existing.includes(AGC_HOOK_MARKER)) {
      (0, import_fs5.writeFileSync)(hookPath + HOOK_BACKUP_SUFFIX, existing, { mode: 493 });
    }
  }
  const identity = agentName ? `${agentName} (agc)` : agentId2 ? `agc/${agentId2}` : "agc agent";
  const trailer = `Co-Authored-By: ${identity} <agc-agent@users.noreply.github.com>`;
  const chainLine = (0, import_fs5.existsSync)(hookPath + HOOK_BACKUP_SUFFIX) ? `
# chain pre-existing hook
"$(dirname "$0")/prepare-commit-msg${HOOK_BACKUP_SUFFIX}" "$@" 2>/dev/null || true
` : "";
  const hook = `#!/bin/sh
${AGC_HOOK_MARKER}${sessionId}
COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
${chainLine}
case "$COMMIT_SOURCE" in merge|squash) exit 0 ;; esac
TRAILER="${trailer}"
grep -qF "$TRAILER" "$COMMIT_MSG_FILE" 2>/dev/null && exit 0
printf '\\n%s\\n' "$TRAILER" >> "$COMMIT_MSG_FILE"
`;
  (0, import_fs5.writeFileSync)(hookPath, hook, { mode: 493 });
}
function removeGitHook(rootDir) {
  const gitDir = findGitDir(rootDir);
  if (!gitDir) return;
  const hookPath = (0, import_path3.join)(gitDir, "hooks", "prepare-commit-msg");
  if (!(0, import_fs5.existsSync)(hookPath)) return;
  const content = (0, import_fs5.readFileSync)(hookPath, "utf8");
  if (!content.includes(AGC_HOOK_MARKER)) return;
  const backupPath = hookPath + HOOK_BACKUP_SUFFIX;
  if ((0, import_fs5.existsSync)(backupPath)) {
    (0, import_fs5.writeFileSync)(hookPath, (0, import_fs5.readFileSync)(backupPath, "utf8"), { mode: 493 });
    (0, import_fs5.unlinkSync)(backupPath);
  } else {
    (0, import_fs5.unlinkSync)(hookPath);
  }
}
function safePath(root, userPath) {
  const abs = (0, import_path3.resolve)(root, userPath);
  const rel = (0, import_path3.relative)(root, abs);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path "${userPath}" escapes the session root. Access denied.`);
  }
  return abs;
}
var BLOCKED_PATTERNS = [
  /\/\.ssh\//,
  /\/\.gnupg\//,
  /\/\.agc\//,
  /\/\.aws\//,
  /\/\.env$/,
  /\/\.env\./,
  /id_rsa/,
  /id_ed25519/
];
function assertNotSensitive(abs) {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(abs)) {
      throw new Error(`Access to "${abs}" is blocked for security reasons.`);
    }
  }
}
async function confirm(message, config, permissionKey) {
  if (config.autoApprove) return true;
  const cached = config.permissions.get(permissionKey);
  if (cached === "allow") return true;
  if (cached === "deny") return false;
  return new Promise((resolve2) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(
      `
  \x1B[33m\u26A0\x1B[0m  ${message}
  \x1B[2m[y] Yes  [n] No  [A] Always allow this type  [N] Never allow this type\x1B[0m
  \x1B[36m?\x1B[0m  `
    );
    rl.once("line", (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "a") {
        config.permissions.set(permissionKey, "allow");
        resolve2(true);
      } else if (a === "n" || a === "nn") {
        config.permissions.set(permissionKey, "deny");
        resolve2(false);
      } else {
        resolve2(a === "y" || a === "yes" || a === "");
      }
    });
  });
}
var OFFICE_EXTS = /* @__PURE__ */ new Set([".docx", ".doc", ".rtf", ".odt", ".pages"]);
var PDF_EXTS = /* @__PURE__ */ new Set([".pdf"]);
var UNREADABLE_BINARY_EXTS = /* @__PURE__ */ new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".tiff",
  ".mp3",
  ".mp4",
  ".wav",
  ".aac",
  ".ogg",
  ".flac",
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".psd",
  ".ai",
  ".sketch",
  ".figma",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt"
]);
function extractViaCommand(cmd, cmdArgs) {
  return new Promise((res) => {
    (0, import_child_process2.execFile)(cmd, cmdArgs, { timeout: 3e4, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
      if (err) res("");
      else res(stdout.trim());
    });
  });
}
async function extractPdfText(abs) {
  try {
    const buffer = (0, import_fs5.readFileSync)(abs);
    const data = await pdfParse(buffer);
    const text2 = data.text?.trim();
    if (text2) {
      const MAX_CHARS = 15e4;
      if (text2.length > MAX_CHARS) {
        return text2.slice(0, MAX_CHARS) + `

[\u2026truncated \u2014 showing first ${MAX_CHARS.toLocaleString()} characters of ${text2.length.toLocaleString()} total]`;
      }
      return text2;
    }
  } catch {
  }
  const text = await extractViaCommand("pdftotext", [abs, "-"]);
  if (text) return text;
  return `[Cannot extract PDF text: the file may be scanned/image-only or password-protected]`;
}
async function extractOfficeText(abs, ext) {
  const text = await extractViaCommand("textutil", ["-stdout", "-cat", "txt", abs]);
  if (text) return text;
  return `[Cannot extract ${ext} text: textutil failed or is unavailable on this system]`;
}
async function toolReadFile(args, cfg) {
  const { path: userPath } = args;
  if (!userPath) throw new Error('read_file requires a "path" argument');
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  if (!(0, import_fs5.existsSync)(abs)) throw new Error(`File not found: ${userPath}`);
  const stat = (0, import_fs5.statSync)(abs);
  if (stat.isDirectory()) throw new Error(`"${userPath}" is a directory, not a file`);
  const ext = (0, import_path3.extname)(abs).toLowerCase();
  if (PDF_EXTS.has(ext)) {
    if (stat.size > 5e7) throw new Error(`PDF too large to read (${Math.round(stat.size / 1e6)} MB). Max 50 MB.`);
    return extractPdfText(abs);
  }
  if (OFFICE_EXTS.has(ext)) {
    if (stat.size > 2e7) throw new Error(`Document too large to read (${Math.round(stat.size / 1e6)} MB). Max 20 MB.`);
    return extractOfficeText(abs, ext);
  }
  if (UNREADABLE_BINARY_EXTS.has(ext)) {
    throw new Error(`Cannot read binary file "${userPath}" (${ext} format). Only text, PDF, and Office documents are supported.`);
  }
  if (stat.size > 5e5) throw new Error(`File too large to read (${Math.round(stat.size / 1024)} KB). Max 500 KB.`);
  return (0, import_fs5.readFileSync)(abs, "utf8");
}
async function toolWriteFile(args, cfg) {
  const { path: userPath, content } = args;
  if (!userPath) throw new Error('write_file requires a "path" argument');
  if (content === void 0) throw new Error('write_file requires a "content" argument');
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  const ok = await confirm(
    `Agent wants to write file: \x1B[1m${abs}\x1B[0m (${String(content).length} chars)`,
    cfg,
    "write_file"
  );
  if (!ok) return "User denied write operation.";
  (0, import_fs5.mkdirSync)((0, import_path3.dirname)(abs), { recursive: true });
  (0, import_fs5.writeFileSync)(abs, content, "utf8");
  return `Written ${String(content).length} bytes to ${userPath}`;
}
async function toolListDirectory(args, cfg) {
  const userPath = args.path ?? ".";
  const abs = safePath(cfg.rootDir, userPath);
  assertNotSensitive(abs);
  if (!(0, import_fs5.existsSync)(abs)) throw new Error(`Directory not found: ${userPath}`);
  const entries = (0, import_fs5.readdirSync)(abs, { withFileTypes: true });
  const lines = entries.map((e) => {
    const type = e.isDirectory() ? "d" : e.isSymbolicLink() ? "l" : "f";
    return `[${type}] ${e.name}`;
  });
  return lines.join("\n") || "(empty directory)";
}
async function toolSearchFiles(args, cfg) {
  const { pattern, directory } = args;
  if (!pattern) throw new Error('search_files requires a "pattern" argument');
  const baseDir = safePath(cfg.rootDir, directory ?? ".");
  assertNotSensitive(baseDir);
  const results = [];
  const pat = new RegExp(
    pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."),
    "i"
  );
  function walk(dir, depth = 0) {
    if (results.length >= 50 || depth > 10) return;
    try {
      for (const entry of (0, import_fs5.readdirSync)(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") && depth > 0) continue;
        const full = (0, import_path3.join)(dir, entry.name);
        const rel = (0, import_path3.relative)(cfg.rootDir, full);
        if (pat.test(entry.name) || pat.test(rel)) results.push(rel);
        if (entry.isDirectory()) walk(full, depth + 1);
      }
    } catch {
    }
  }
  walk(baseDir);
  return results.length ? results.join("\n") : "No files found matching: " + pattern;
}
async function toolRunCommand(args, cfg) {
  const { command, args: cmdArgs = [], cwd, timeout_seconds, interactive } = args;
  if (!command || typeof command !== "string") throw new Error('run_command requires a "command" string');
  if (!Array.isArray(cmdArgs)) throw new Error('"args" must be an array of strings');
  const workDir = cwd ? safePath(cfg.rootDir, cwd) : cfg.rootDir;
  const injectedArgs = injectAgcTrailer(command, cmdArgs, cfg.agentId, cfg.agentName);
  const preview = [command, ...injectedArgs].join(" ");
  const timeoutMs = Math.min((typeof timeout_seconds === "number" ? timeout_seconds : 120) * 1e3, 3e5);
  const ok = await confirm(
    `Agent wants to run: \x1B[1m${preview}\x1B[0m
  \x1B[2min: ${workDir}\x1B[0m`,
    cfg,
    "run_command"
  );
  if (!ok) return "User denied command execution.";
  if (interactive) {
    return new Promise((resolve2) => {
      const child = (0, import_child_process2.spawn)(command, injectedArgs.map(String), { cwd: workDir, stdio: "inherit" });
      const timer = setTimeout(() => {
        child.kill();
        resolve2(`(command timed out after ${timeoutMs / 1e3}s)`);
      }, timeoutMs);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve2(`(command exited with code ${code ?? "unknown"})`);
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve2(`Error: ${err.message}`);
      });
    });
  }
  return new Promise((resolve2) => {
    (0, import_child_process2.execFile)(command, injectedArgs.map(String), { cwd: workDir, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const out = [stdout, stderr].filter(Boolean).join("\n--- stderr ---\n");
      if (err && !out) return resolve2(`Error: ${err.message}`);
      resolve2(out || "(no output)");
    });
  });
}
async function toolStartProcess(args, cfg) {
  const { command, args: cmdArgs = [], cwd } = args;
  if (!command || typeof command !== "string") throw new Error('start_process requires a "command" string');
  if (!Array.isArray(cmdArgs)) throw new Error('"args" must be an array of strings');
  const workDir = cwd ? safePath(cfg.rootDir, cwd) : cfg.rootDir;
  const preview = [command, ...cmdArgs].join(" ");
  const ok = await confirm(
    `Agent wants to start background process: \x1B[1m${preview}\x1B[0m
  \x1B[2min: ${workDir}\x1B[0m`,
    cfg,
    "start_process"
  );
  if (!ok) return JSON.stringify({ error: "User denied process start." });
  const id = `proc_${Date.now().toString(36)}`;
  const child = (0, import_child_process2.spawn)(command, cmdArgs.map(String), {
    cwd: workDir,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });
  const proc = {
    id,
    command: preview,
    status: "running",
    exitCode: null,
    stdout: "",
    stderr: "",
    startedAt: /* @__PURE__ */ new Date(),
    endedAt: null,
    child
  };
  child.stdout?.on("data", (chunk) => {
    proc.stdout = capBuffer(proc.stdout, chunk.toString(), 2e5);
  });
  child.stderr?.on("data", (chunk) => {
    proc.stderr = capBuffer(proc.stderr, chunk.toString(), 5e4);
  });
  child.on("close", (code) => {
    proc.status = code === 0 ? "done" : "error";
    proc.exitCode = code;
    proc.endedAt = /* @__PURE__ */ new Date();
  });
  child.on("error", (err) => {
    proc.status = "error";
    proc.endedAt = /* @__PURE__ */ new Date();
    proc.stderr = capBuffer(proc.stderr, `
Spawn error: ${err.message}`, 5e4);
  });
  managedProcesses.set(id, proc);
  cfg.appendLog({ type: "process_start", processId: id, command: preview, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  return JSON.stringify({ processId: id, status: "running", command: preview });
}
function processSnapshot(proc) {
  const elapsedSec = Math.round((Date.now() - proc.startedAt.getTime()) / 1e3);
  const recentStdout = proc.stdout.length > 4e3 ? "\u2026(earlier output truncated)\n" + proc.stdout.slice(-4e3) : proc.stdout;
  return JSON.stringify({
    processId: proc.id,
    command: proc.command,
    status: proc.status,
    exitCode: proc.exitCode,
    elapsedSec,
    stdout: recentStdout || "(no output yet)",
    stderr: proc.stderr.slice(-1e3) || void 0
  });
}
async function toolProcessStatus(args, _cfg) {
  const { processId } = args;
  if (!processId) throw new Error('process_status requires a "processId" argument');
  const proc = managedProcesses.get(processId);
  if (!proc) return JSON.stringify({ error: `No process found with id "${processId}"` });
  return processSnapshot(proc);
}
async function toolWaitForProcess(args, _cfg) {
  const { processId, wait_seconds = 60 } = args;
  if (!processId) throw new Error('wait_for_process requires a "processId" argument');
  const proc = managedProcesses.get(processId);
  if (!proc) return JSON.stringify({ error: `No process found with id "${processId}"` });
  if (proc.status !== "running") return processSnapshot(proc);
  const maxWait = Math.min((typeof wait_seconds === "number" ? wait_seconds : 60) * 1e3, 12e4);
  const deadline = Date.now() + maxWait;
  await new Promise((resolve2) => {
    const tick = setInterval(() => {
      if (proc.status !== "running" || Date.now() >= deadline) {
        clearInterval(tick);
        resolve2();
      }
    }, 500);
  });
  return processSnapshot(proc);
}
async function toolKillProcess(args, cfg) {
  const { processId } = args;
  if (!processId) throw new Error('kill_process requires a "processId" argument');
  const proc = managedProcesses.get(processId);
  if (!proc) return JSON.stringify({ error: `No process found with id "${processId}"` });
  if (proc.status !== "running") return JSON.stringify({ error: `Process "${processId}" is not running (status: ${proc.status})` });
  proc.child.kill("SIGTERM");
  proc.status = "killed";
  proc.endedAt = /* @__PURE__ */ new Date();
  cfg.appendLog({ type: "process_killed", processId, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  return JSON.stringify({ processId, status: "killed" });
}
async function toolListProcesses(_args, _cfg) {
  if (managedProcesses.size === 0) return JSON.stringify([]);
  const list = [...managedProcesses.values()].map((p) => ({
    processId: p.id,
    command: p.command,
    status: p.status,
    elapsedSec: Math.round((Date.now() - p.startedAt.getTime()) / 1e3)
  }));
  return JSON.stringify(list);
}
async function runLocalTool(call, cfg) {
  const { tool, args } = call;
  cfg.appendLog({
    type: "local_tool_call",
    tool,
    args,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  let result;
  try {
    switch (tool) {
      case "read_file":
        result = await toolReadFile(args, cfg);
        break;
      case "write_file":
        result = await toolWriteFile(args, cfg);
        break;
      case "list_directory":
        result = await toolListDirectory(args, cfg);
        break;
      case "search_files":
        result = await toolSearchFiles(args, cfg);
        break;
      case "run_command":
        result = await toolRunCommand(args, cfg);
        break;
      case "start_process":
        result = await toolStartProcess(args, cfg);
        break;
      case "process_status":
        result = await toolProcessStatus(args, cfg);
        break;
      case "wait_for_process":
        result = await toolWaitForProcess(args, cfg);
        break;
      case "kill_process":
        result = await toolKillProcess(args, cfg);
        break;
      case "list_processes":
        result = await toolListProcesses(args, cfg);
        break;
      default:
        result = `Unknown tool: "${tool}". Available: read_file, write_file, list_directory, search_files, run_command, start_process, wait_for_process, process_status, kill_process, list_processes`;
    }
  } catch (err) {
    result = `Error: ${err?.message ?? String(err)}`;
  }
  cfg.appendLog({
    type: "local_tool_result",
    tool,
    result: result.slice(0, 2e3),
    // cap log size
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  return result;
}

// src/commands/run.ts
function runCommand() {
  return new import_commander8.Command("run").description("Send a single prompt to an agent and stream the response").argument("<prompt>", "Prompt text to send").option("--agent <agentId>", "Agent ID").option("--session <sessionId>", "Resume an existing session by ID").option(
    "--new-session",
    "Create a new session and print its ID for future use"
  ).option(
    "--computer",
    "Give the agent access to its persistent cloud computer"
  ).option(
    "--local",
    "Enable local file system access (with permission prompts)"
  ).option(
    "-y, --yes",
    "Enable local file system access and auto-approve all operations"
  ).option("--no-stream", "Disable streaming (wait for full response)").option("--json", "Output raw event stream as JSON lines").option(
    "--provenance <mode>",
    "Provenance capture: off, metadata, or full",
    "metadata"
  ).option(
    "--onchain-provenance",
    "Request an optional on-chain anchor for this run"
  ).action(async (prompt, opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(
        c.error(
          "Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"
        )
      );
      process.exit(1);
    }
    if (opts.session && opts.newSession) {
      console.error(
        c.error("Cannot use --session and --new-session together.")
      );
      process.exit(1);
    }
    if (!["off", "metadata", "full"].includes(opts.provenance)) {
      console.error(c.error("--provenance must be off, metadata, or full."));
      process.exit(1);
    }
    if (opts.onchainProvenance && opts.provenance === "off") {
      console.error(
        c.error("--onchain-provenance requires metadata or full capture.")
      );
      process.exit(1);
    }
    const client = makeClient();
    let sessionId = opts.session;
    if (opts.session) {
      const spinner = spin("Loading session\u2026");
      try {
        await client.sessions.get(opts.session);
        spinner.stop();
      } catch {
        spinner.stop();
        console.error(c.error(`Session "${opts.session}" not found.`));
        process.exit(1);
      }
    }
    if (opts.newSession) {
      const spinner = spin("Creating session\u2026");
      try {
        const res = await client.sessions.create({
          agentId: agentId2,
          initiator: cfg.initiator ?? "",
          title: `agc run ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16)}`,
          source: "cli"
        });
        const session = res?.data ?? res;
        sessionId = session.sessionId;
        spinner.stop();
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
    }
    const localEnabled = opts.yes || opts.local;
    const autoApprove = !!opts.yes;
    let localToolsCfg = null;
    let cliContext;
    if (localEnabled) {
      const rootDir = process.cwd();
      localToolsCfg = {
        rootDir,
        sessionId: sessionId ?? "run",
        appendLog: () => {
        },
        permissions: /* @__PURE__ */ new Map(),
        agentId: agentId2,
        autoApprove
      };
      const snapshot = buildDirSnapshot(rootDir, 2);
      cliContext = buildLocalToolsManifest(
        rootDir,
        snapshot,
        [],
        autoApprove
      );
    }
    if (!opts.json) {
      const rows = [];
      if (sessionId) {
        const label = opts.newSession ? `${c.id(sessionId)}${c.dim(" (new)")}` : `${c.id(sessionId)}${c.dim(" (resumed)")}`;
        rows.push(["Session", label]);
      }
      if (localEnabled) {
        rows.push([
          "Local tools",
          autoApprove ? c.warn("enabled  (auto-approve on)") : c.success("enabled")
        ]);
      }
      if (opts.computer) {
        rows.push([
          "Cloud computer",
          c.success("enabled") + c.dim("  (persistent, remote)")
        ]);
      }
      if (rows.length) {
        detail(rows);
        console.log();
      }
    }
    const params = {
      agentId: agentId2,
      sessionId,
      messages: [{ role: "user", content: prompt }],
      ...cfg.initiator && { initiatorId: cfg.initiator },
      ...opts.computer && { computerRequest: { enabled: true } },
      ...cliContext && { cliContext },
      provenance: {
        mode: opts.provenance,
        onchain: Boolean(opts.onchainProvenance)
      }
    };
    if (opts.noStream && !localEnabled) {
      const spinner = spin("Running\u2026");
      try {
        const result = await client.run.once(params);
        spinner.stop();
        if (opts.json) return jsonOut(result);
        const text = result?.content ?? result?.text ?? result?.message ?? JSON.stringify(result);
        console.log(text);
        if (sessionId)
          console.log(
            c.dim(
              `
Session: ${sessionId}  (resume with: agc run --session ${sessionId} "<prompt>")`
            )
          );
      } catch (err) {
        spinner.stop();
        printError(err);
        process.exit(1);
      }
      return;
    }
    try {
      let hasOutput = false;
      let toolStartMs = 0;
      let lastToolName = "";
      for await (const event of client.agents.stream(params)) {
        if (opts.json) {
          console.log(JSON.stringify(event));
          continue;
        }
        if (event.type === "token") {
          process.stdout.write(event.content ?? "");
          hasOutput = true;
        } else if (event.type === "cli_tool_request" && localToolsCfg) {
          const { requestId, tool: toolName, args } = event;
          const displayName = String(toolName).replace("cli_", "");
          if (hasOutput) {
            process.stdout.write("\n");
            hasOutput = false;
          }
          process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(displayName)}`);
          const startMs = Date.now();
          let result;
          let toolOk = true;
          try {
            result = await runLocalTool(
              { tool: displayName, args: args ?? {} },
              localToolsCfg
            );
          } catch (err) {
            result = `Error: ${err?.message ?? String(err)}`;
            toolOk = false;
          }
          const elapsed = ((Date.now() - startMs) / 1e3).toFixed(1);
          readline2.cursorTo(process.stdout, 0);
          readline2.clearLine(process.stdout, 0);
          process.stdout.write(
            `  ${c.dim("\u2500")} ${c.bold(displayName)}  ${toolOk ? sym.ok : sym.fail}  ${c.dim("(" + elapsed + "s)")}
`
          );
          try {
            await client.agents.submitCliToolResult(requestId, result);
          } catch {
          }
        } else if (event.type === "toolStart") {
          lastToolName = event.toolName ?? "";
          toolStartMs = Date.now();
          if (hasOutput) {
            process.stdout.write("\n");
            hasOutput = false;
          }
          process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(lastToolName)}`);
        } else if (event.type === "toolEnd") {
          const elapsed = ((Date.now() - toolStartMs) / 1e3).toFixed(1);
          readline2.cursorTo(process.stdout, 0);
          readline2.clearLine(process.stdout, 0);
          process.stdout.write(
            `  ${c.dim("\u2500")} ${c.bold(lastToolName)}  ${sym.ok}  ${c.dim("(" + elapsed + "s)")}
`
          );
        } else if (event.type === "final") {
          if (hasOutput) process.stdout.write("\n");
          const e = event;
          const finalText = e.content ?? e.payload?.content ?? e.payload?.text ?? e.payload?.message;
          if (finalText && !hasOutput) console.log(finalText);
          if (sessionId)
            console.log(
              c.dim(
                `
Session: ${sessionId}  (resume with: agc run --session ${sessionId} "<prompt>")`
              )
            );
          break;
        } else if (event.type === "error") {
          if (hasOutput) process.stdout.write("\n");
          console.error(
            `
${sym.fail} ${c.error(event.message ?? "Error")}`
          );
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
var import_commander9 = require("commander");
var readline3 = __toESM(require("readline"));
var import_fs6 = require("fs");
var import_path4 = require("path");
var import_os3 = require("os");
var SESSIONS_DIR = (0, import_path4.join)((0, import_os3.homedir)(), ".agc", "sessions");
function ensureSessionsDir() {
  if (!(0, import_fs6.existsSync)(SESSIONS_DIR)) (0, import_fs6.mkdirSync)(SESSIONS_DIR, { recursive: true });
}
function appendSessionLog(sessionId, record) {
  try {
    ensureSessionsDir();
    const file = (0, import_path4.join)(SESSIONS_DIR, `${sessionId}.jsonl`);
    (0, import_fs6.appendFileSync)(file, JSON.stringify(record) + "\n", { mode: 384 });
  } catch {
  }
}
var HELP_TEXT = `
  ${c.label("Slash commands")}
  /help          Show this help
  /session       Print the current session ID (copy it to resume later)
  /tools         Show local tool status and permissions
  /clear         Clear the terminal screen
  /quit          Exit (session is preserved \u2014 resume with --resume <id>)

  ${c.label("File context")}
  Use @path/to/file in your message to inject that file's contents into context.
  Example: "review @src/index.ts and suggest improvements"
`;
var LOCAL_TOOLS_DISCLAIMER = `
  ${c.warn("\u26A0")}  ${c.bold("Local file system access enabled")}

  ${c.dim("The agent can read and write files, list directories, search files,")}
  ${c.dim("and execute shell commands on your machine.")}

  ${c.dim("Rules:")}
  ${sym.bullet} ${c.dim("All paths are restricted to:")} ${c.primary(process.cwd())}
  ${sym.bullet} ${c.dim("Sensitive paths (.ssh, .env, .aws, credentials) are always blocked")}
  ${sym.bullet} ${c.dim("Write and run_command operations require your confirmation")}
  ${sym.bullet} ${c.dim("You can deny any individual request")}

  ${c.dim("Session activity is logged to")} ${c.primary("~/.agc/sessions/")}
`;
function chatCommand() {
  return new import_commander9.Command("chat").description("Start an interactive chat REPL with an agent").option("--agent <agentId>", "Agent ID (or set defaultAgentId in config)").option("--resume <sessionId>", "Resume an existing session by ID").option("--computer", "Give the agent access to its persistent cloud computer").option("--no-stream", "Disable token streaming (wait for full response)").option("--no-local", "Disable local file system access for the agent").action(async (opts) => {
    const localEnabled = opts.local !== false;
    const cfg = loadConfig();
    let agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2 && cfg.initiator) {
      try {
        const listed = await makeClient().agents.list(cfg.initiator);
        const agents = listed?.data ?? listed ?? [];
        agentId2 = agents.find((agent) => agent.isDefault)?.agentId ?? agents[0]?.agentId;
      } catch {
      }
    }
    if (!agentId2) {
      console.error(c.error("No default agent is available. Specify --agent <agentId> or run `agc agents list`."));
      process.exit(1);
    }
    if (!cfg.initiator) {
      console.error(c.error("No initiator set. Run `agc login` first."));
      process.exit(1);
    }
    const client = makeClient();
    let sessionId = opts.resume ?? "";
    const isResume = !!opts.resume;
    const initiator = cfg.initiator ?? "";
    if (!isResume) {
      const spinner = spin("Creating session\u2026");
      try {
        const res = await client.sessions.create({
          agentId: agentId2,
          initiator,
          title: `agc chat ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16)}`,
          source: "cli"
        });
        const session = res?.data ?? res;
        sessionId = session.sessionId;
        spinner.stop();
        appendSessionLog(sessionId, {
          type: "session_start",
          sessionId,
          agentId: agentId2,
          initiator,
          source: "cli",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
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
        if (session.agentId && session.agentId !== agentId2) {
          spinner.stop();
          console.log(c.warn(`  Note: session ${sessionId} was created with agent ${session.agentId}, not ${agentId2}`));
        } else {
          spinner.stop();
        }
      } catch {
        spinner.stop();
        console.error(c.error(`Session "${sessionId}" not found.`));
        process.exit(1);
      }
    }
    let agentName;
    let walletLine = "";
    await Promise.allSettled([
      client.agents.get(agentId2).then((res) => {
        agentName = (res?.data ?? res)?.name;
      }),
      client.wallets.primary(agentId2).then(async (primary) => {
        const w = primary?.data ?? primary;
        if (w?.id) {
          const bal = await client.wallets.balance(w.id).catch(() => null);
          const b = bal?.data ?? bal;
          const addr = `${w.address.slice(0, 6)}\u2026${w.address.slice(-4)}`;
          const usdc = b?.usdc ?? "0";
          walletLine = `${addr}  ${c.bold(usdc + " USDC")}`;
        }
      })
    ]);
    console.log(`
${c.bold("Agent Commons Chat")}`);
    const headerRows = [
      ["Agent", agentName ? `${agentName}  ${c.dim(agentId2)}` : agentId2],
      ["Session", c.id(sessionId) + (isResume ? c.dim(" (resumed)") : c.dim(" (new)"))]
    ];
    if (walletLine) headerRows.push(["Wallet", walletLine]);
    if (opts.computer) headerRows.push(["Cloud computer", c.success("enabled") + c.dim("  (persistent, remote)")]);
    if (localEnabled) headerRows.push(["Local tools", c.success("enabled") + c.dim("  (read, write, search, run)")]);
    detail(headerRows);
    let localToolsCfg = null;
    if (localEnabled) {
      console.log(LOCAL_TOOLS_DISCLAIMER);
      const rootDir = process.cwd();
      localToolsCfg = {
        rootDir,
        sessionId,
        agentId: agentId2,
        agentName,
        appendLog: (record) => appendSessionLog(sessionId, record),
        permissions: /* @__PURE__ */ new Map()
      };
      installGitHook(rootDir, sessionId, agentId2, agentName);
      appendSessionLog(sessionId, {
        type: "local_tools_enabled",
        rootDir,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    console.log(c.dim("\nType your message and press Enter. Type /help for commands.\n"));
    const rl = readline3.createInterface({
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
      if (input === "/tools") {
        if (!localToolsCfg) {
          console.log(c.dim(`  Local tools are disabled. Remove ${c.bold("--no-local")} flag to re-enable them.`));
        } else {
          console.log(`
  ${c.bold("Local tools")} ${c.success("enabled")}`);
          console.log(`  ${c.dim("Root directory:")} ${c.primary(localToolsCfg.rootDir)}`);
          const perms = [...localToolsCfg.permissions.entries()];
          if (perms.length) {
            console.log(`  ${c.dim("Cached permissions:")}`);
            for (const [k, v] of perms) {
              const badge = v === "allow" ? c.success("allow") : c.error("deny");
              console.log(`    ${sym.bullet} ${k}: ${badge}`);
            }
          }
        }
        console.log();
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
      appendSessionLog(sessionId, {
        type: "message",
        role: "user",
        content: input,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      let userMessage = input;
      let cliContext;
      if (localToolsCfg) {
        const rootDir = localToolsCfg.rootDir;
        const atRefs = [...input.matchAll(/@([\S]+)/g)].map((m) => m[1]);
        const fileContextBlocks = [];
        for (const ref of atRefs) {
          const content = readFileForContext(rootDir, ref);
          fileContextBlocks.push(`**${ref}**
\`\`\`
${content}
\`\`\``);
        }
        const snapshot = buildDirSnapshot(rootDir, 2);
        cliContext = buildLocalToolsManifest(rootDir, snapshot, fileContextBlocks);
      }
      const params = {
        agentId: agentId2,
        sessionId,
        messages: [{ role: "user", content: userMessage }],
        ...opts.computer && { computerRequest: { enabled: true } },
        ...cliContext && { cliContext }
      };
      if (opts.noStream) {
        process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
        const spinner = spin("thinking\u2026");
        try {
          const result = await client.run.once(params);
          spinner.stop();
          process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
          const text = extractText(result);
          console.log(text);
          appendSessionLog(sessionId, {
            type: "message",
            role: "assistant",
            content: text,
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (err) {
          spinner.stop();
          console.error(`
${sym.fail} ${c.error(err.message ?? String(err))}`);
        }
      } else {
        try {
          let hasOutput = false;
          let agentContent = "";
          let toolStartMs = 0;
          let lastToolName = "";
          const thinkingSpinner = spin("thinking\u2026");
          for await (const event of client.agents.stream(params)) {
            if (event.type === "token") {
              if (thinkingSpinner.isSpinning) {
                thinkingSpinner.stop();
                process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
              }
              const tok = event.content ?? "";
              process.stdout.write(tok);
              agentContent += tok;
              hasOutput = true;
            } else if (event.type === "cli_tool_request" && localToolsCfg) {
              if (thinkingSpinner.isSpinning) thinkingSpinner.stop();
              const { requestId, tool: toolName, args } = event;
              const displayName = String(toolName).replace("cli_", "");
              const argStr = toolArgSummary(displayName, args ?? {});
              const isWaiting = displayName === "wait_for_process";
              if (hasOutput) {
                process.stdout.write("\n");
                hasOutput = false;
              }
              process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(displayName)}${argStr ? "  " + c.dim(argStr) : ""}`);
              const startMs = Date.now();
              let elapsedSec = 0;
              let elapsedInterval = null;
              if (isWaiting) {
                elapsedInterval = setInterval(() => {
                  elapsedSec++;
                  readline3.cursorTo(process.stdout, 0);
                  process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(displayName)}${argStr ? "  " + c.dim(argStr) : ""}  ${c.dim(elapsedSec + "s\u2026")}`);
                }, 1e3);
              }
              let result;
              let toolOk = true;
              try {
                result = await runLocalTool({ tool: displayName, args: args ?? {} }, localToolsCfg);
              } catch (err) {
                result = `Error: ${err?.message ?? String(err)}`;
                toolOk = false;
              }
              if (elapsedInterval) clearInterval(elapsedInterval);
              const elapsed = ((Date.now() - startMs) / 1e3).toFixed(1);
              const preview = toolOk ? toolResultPreview(displayName, result) : "";
              readline3.cursorTo(process.stdout, 0);
              readline3.clearLine(process.stdout, 0);
              const statusIcon = toolOk ? sym.ok : sym.fail;
              const previewPart = preview ? `  ${c.dim(preview)}` : "";
              process.stdout.write(
                `  ${c.dim("\u2500")} ${c.bold(displayName)}${argStr ? "  " + c.dim(argStr) : ""}  ${statusIcon}${previewPart}  ${c.dim("(" + elapsed + "s)")}
`
              );
              appendSessionLog(sessionId, {
                type: "local_tool_result",
                tool: toolName,
                result: result.slice(0, 4e3),
                timestamp: (/* @__PURE__ */ new Date()).toISOString()
              });
              try {
                await client.agents.submitCliToolResult(requestId, result);
              } catch (postErr) {
                console.error(c.warn(`
  [local] Failed to submit tool result: ${postErr?.message}`));
              }
            } else if (event.type === "keepalive") {
            } else if (event.type === "toolStart") {
              if (thinkingSpinner.isSpinning) thinkingSpinner.stop();
              lastToolName = event.toolName ?? "";
              toolStartMs = Date.now();
              if (hasOutput) process.stdout.write("\n");
              process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(lastToolName)}`);
              hasOutput = false;
            } else if (event.type === "toolEnd") {
              const elapsed = ((Date.now() - toolStartMs) / 1e3).toFixed(1);
              readline3.cursorTo(process.stdout, 0);
              readline3.clearLine(process.stdout, 0);
              process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(lastToolName)}  ${sym.ok}  ${c.dim("(" + elapsed + "s)")}
`);
              process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
              hasOutput = false;
            } else if (event.type === "final") {
              const e = event;
              const text = extractText(e?.payload);
              if (text && !hasOutput) {
                process.stdout.write(text);
                agentContent += text;
              }
              const usage = e?.payload?.usage;
              if (usage) {
                const inputTok = usage.inputTokens ?? 0;
                const outputTok = usage.outputTokens ?? 0;
                const cachedTok = usage.cachedTokens ?? 0;
                const total = usage.totalTokens ?? inputTok + outputTok;
                const cost = typeof usage.costUsd === "number" ? `$${usage.costUsd.toFixed(4)}` : "";
                const parts = [total ? `${total.toLocaleString()} tokens` : "", cost].filter(Boolean);
                if (parts.length) process.stdout.write("\n" + c.dim(`  \u21B3 ${parts.join(" \xB7 ")}`));
                if (cachedTok > 0) process.stdout.write(c.dim(` (${cachedTok.toLocaleString()} cached)`));
                appendSessionLog(sessionId, {
                  type: "message",
                  role: "assistant",
                  content: agentContent,
                  usage: {
                    inputTokens: inputTok,
                    outputTokens: outputTok,
                    cachedTokens: cachedTok,
                    totalTokens: total,
                    costUsd: usage.costUsd
                  },
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
              } else {
                appendSessionLog(sessionId, {
                  type: "message",
                  role: "assistant",
                  content: agentContent,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                });
              }
              break;
            } else if (event.type === "error") {
              if (thinkingSpinner.isSpinning) thinkingSpinner.stop();
              if (hasOutput) process.stdout.write("\n");
              console.error(`
${sym.fail} ${c.error(event.message ?? "Stream error")}`);
              break;
            }
          }
          if (thinkingSpinner.isSpinning) thinkingSpinner.stop();
          process.stdout.write("\n");
          if (localToolsCfg && agentContent) {
            await handleLocalToolLoop(agentContent, localToolsCfg, client, agentId2, sessionId, appendSessionLog, !!opts.computer);
          }
        } catch (err) {
          process.stdout.write("\n");
          console.error(`${sym.fail} ${c.error(err.message ?? String(err))}`);
        }
      }
      console.log();
      readline3.cursorTo(process.stdout, 0);
      readline3.clearLine(process.stdout, 0);
      rl.resume();
      rl.prompt();
    });
    const cleanup = () => {
      if (localToolsCfg) removeGitHook(localToolsCfg.rootDir);
    };
    rl.on("close", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGINT", () => {
      cleanup();
      console.log(c.dim(`
Session preserved. Resume with: agc chat --resume ${sessionId}`));
      process.exit(130);
    });
  });
}
var MAX_TOOL_DEPTH = 10;
async function handleLocalToolLoop(agentText, cfg, client, agentId2, sessionId, appendLog, computerEnabled = false, depth = 0) {
  if (depth >= MAX_TOOL_DEPTH) {
    console.log(c.dim(`
  [local] Max tool depth reached (${MAX_TOOL_DEPTH}). Stopping tool loop.
`));
    return;
  }
  const toolCall = extractToolCall(agentText);
  if (!toolCall) return;
  const argStr = toolArgSummary(toolCall.tool, toolCall.args ?? {});
  process.stdout.write(`
  ${c.dim("\u2500")} ${c.bold(toolCall.tool)}${argStr ? "  " + c.dim(argStr) : ""}`);
  const startMs = Date.now();
  let result;
  let toolOk = true;
  try {
    result = await runLocalTool(toolCall, cfg);
  } catch (err) {
    result = `Error: ${err?.message ?? String(err)}`;
    toolOk = false;
  }
  const elapsed = ((Date.now() - startMs) / 1e3).toFixed(1);
  const preview = toolOk ? toolResultPreview(toolCall.tool, result) : "";
  readline3.cursorTo(process.stdout, 0);
  readline3.clearLine(process.stdout, 0);
  const previewPart = preview ? `  ${c.dim(preview)}` : "";
  process.stdout.write(
    `  ${c.dim("\u2500")} ${c.bold(toolCall.tool)}${argStr ? "  " + c.dim(argStr) : ""}  ${toolOk ? sym.ok : sym.fail}${previewPart}  ${c.dim("(" + elapsed + "s)")}
`
  );
  const resultMsg = `[Tool result: ${toolCall.tool}]
\`\`\`
${result}
\`\`\``;
  appendLog(sessionId, {
    type: "message",
    role: "tool",
    tool: toolCall.tool,
    result: result.slice(0, 4e3),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
  let followContent = "";
  try {
    let loopToolName = "";
    let loopToolStartMs = 0;
    for await (const evt of client.agents.stream({
      agentId: agentId2,
      sessionId,
      messages: [{ role: "user", content: resultMsg }],
      ...computerEnabled && { computerRequest: { enabled: true } }
    })) {
      if (evt.type === "token") {
        const tok = evt.content ?? "";
        process.stdout.write(tok);
        followContent += tok;
      } else if (evt.type === "toolStart") {
        loopToolName = evt.toolName ?? "";
        loopToolStartMs = Date.now();
        if (followContent) process.stdout.write("\n");
        process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(loopToolName)}`);
      } else if (evt.type === "toolEnd") {
        const elapsed2 = ((Date.now() - loopToolStartMs) / 1e3).toFixed(1);
        readline3.cursorTo(process.stdout, 0);
        readline3.clearLine(process.stdout, 0);
        process.stdout.write(`  ${c.dim("\u2500")} ${c.bold(loopToolName)}  ${sym.ok}  ${c.dim("(" + elapsed2 + "s)")}
`);
        process.stdout.write(c.primary("agent") + c.dim(" \u203A "));
      } else if (evt.type === "final") {
        const txt = extractText(evt?.payload);
        if (txt && !followContent) {
          process.stdout.write(txt);
          followContent += txt;
        }
        appendLog(sessionId, {
          type: "message",
          role: "assistant",
          content: followContent,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
        break;
      } else if (evt.type === "error") {
        console.error(`
${sym.fail} ${c.error(evt.message ?? "Stream error")}`);
        break;
      }
    }
    process.stdout.write("\n");
  } catch (err) {
    process.stdout.write("\n");
    console.error(`${sym.fail} ${c.error(err?.message ?? String(err))}`);
    return;
  }
  await handleLocalToolLoop(followContent, cfg, client, agentId2, sessionId, appendLog, computerEnabled, depth + 1);
}
function truncate(s, max) {
  const str = String(s ?? "");
  return str.length <= max ? str : str.slice(0, max - 1) + "\u2026";
}
function toolArgSummary(toolName, args) {
  switch (toolName) {
    case "read_file":
      return truncate(args.path ?? "", 60);
    case "write_file":
      return truncate(args.path ?? "", 60);
    case "delete_file":
      return truncate(args.path ?? "", 60);
    case "list_directory":
      return truncate(args.path ?? ".", 60);
    case "run_command":
      return truncate(args.command ?? "", 60);
    case "start_process":
      return truncate(args.command ?? "", 60);
    case "wait_for_process":
      return truncate(args.process_id ?? "", 20);
    case "process_status":
      return truncate(args.process_id ?? "", 20);
    case "kill_process":
      return truncate(args.process_id ?? "", 20);
    case "list_processes":
      return "";
    case "search_files": {
      const parts = [args.pattern, args.query].filter(Boolean);
      return truncate(parts.join(" "), 60);
    }
    default: {
      const first = args.path ?? args.query ?? args.command ?? args.pattern ?? "";
      return truncate(String(first), 60);
    }
  }
}
function toolResultPreview(toolName, result) {
  if (!result || result.startsWith("Error:")) return "";
  switch (toolName) {
    case "read_file": {
      const lines = result.split("\n").length;
      return `${lines} lines`;
    }
    case "write_file":
      return "written";
    case "delete_file":
      return "deleted";
    case "list_directory": {
      const count = result.split("\n").filter(Boolean).length;
      return `${count} entries`;
    }
    case "run_command": {
      const first = result.split("\n").find((l) => l.trim());
      return first ? truncate(first.trim(), 50) : "done";
    }
    case "start_process": {
      const match = result.match(/process[_\s-]?id[:\s]+([a-zA-Z0-9_-]+)/i) ?? result.match(/"id"[:\s]+"([^"]+)"/);
      return match ? `pid ${match[1]}` : "started";
    }
    case "wait_for_process": {
      if (/done|complete|exit/i.test(result)) return "done";
      if (/running/i.test(result)) return "still running";
      return truncate(result.split("\n")[0]?.trim() ?? "", 40);
    }
    case "search_files": {
      const count = result.split("\n").filter(Boolean).length;
      return `${count} match${count === 1 ? "" : "es"}`;
    }
    default: {
      const first = result.split("\n").find((l) => l.trim());
      return first ? truncate(first.trim(), 50) : "";
    }
  }
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
var import_commander10 = require("commander");
function mcpCommand() {
  const cmd = new import_commander10.Command("mcp").description("Manage MCP (Model Context Protocol) servers");
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
var import_commander11 = require("commander");
function skillsCommand() {
  const cmd = new import_commander11.Command("skills").description("Discover and manage skills");
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
      const readline4 = await import("readline");
      const rl = readline4.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(
        (resolve2) => rl.question(c.warn(`Delete skill "${slug}"? This cannot be undone. [y/N] `), resolve2)
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

// src/commands/wallet.ts
var import_commander12 = require("commander");
function walletCommand() {
  const cmd = new import_commander12.Command("wallet").description("Manage agent wallets");
  cmd.command("list").description("List all wallets for an agent").option("--agent <agentId>", "Agent ID (or use defaultAgentId from config)").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    const spinner = spin("Fetching wallets\u2026");
    try {
      const client = makeClient();
      const wallets = await client.wallets.list(agentId2);
      spinner.stop();
      if (opts.json) return jsonOut(wallets);
      const list = wallets?.data ?? wallets ?? [];
      section(`Wallets for agent ${agentId2.slice(0, 8)}\u2026 (${list.length})`);
      table(
        list.map((w) => ({
          ID: w.id.slice(0, 8) + "\u2026",
          Type: w.walletType,
          Address: w.address,
          Chain: chainName(w.chainId),
          Label: w.label ?? "Primary",
          Active: w.isActive ? sym.ok : sym.fail
        })),
        ["ID", "Type", "Address", "Chain", "Label", "Active"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("show").description("Show the agent's primary wallet address").option("--agent <agentId>", "Agent ID (or use defaultAgentId from config)").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    const spinner = spin("Fetching primary wallet\u2026");
    try {
      const client = makeClient();
      const wallet = await client.wallets.primary(agentId2);
      spinner.stop();
      if (!wallet) {
        console.log(c.warn(`  No wallet found for agent ${agentId2}`));
        console.log(c.dim(`  Run: agc wallet create --agent ${agentId2}`));
        return;
      }
      const w = wallet?.data ?? wallet;
      if (opts.json) return jsonOut(w);
      section("Primary Wallet");
      detail([
        ["Address", w.address],
        ["Type", w.walletType],
        ["Chain", chainName(w.chainId)],
        ["Label", w.label ?? "Primary"],
        ["Wallet ID", w.id]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("balance").description("Show the agent's wallet USDC and ETH balance").option("--agent <agentId>", "Agent ID (or use defaultAgentId from config)").option("--wallet <walletId>", "Specific wallet ID (defaults to primary)").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    const spinner = spin("Fetching balance\u2026");
    try {
      const client = makeClient();
      let walletId = opts.wallet;
      if (!walletId) {
        const primary = await client.wallets.primary(agentId2);
        const w = primary?.data ?? primary;
        if (!w) {
          spinner.stop();
          console.log(c.warn(`  No wallet found. Run: agc wallet create --agent ${agentId2}`));
          return;
        }
        walletId = w.id;
      }
      const balance = await client.wallets.balance(walletId);
      spinner.stop();
      const b = balance?.data ?? balance;
      if (opts.json) return jsonOut(b);
      section("Wallet Balance");
      detail([
        ["Address", b.address],
        ["Chain", chainName(b.chainId)],
        ["USDC", c.bold(b.usdc + " USDC")],
        ["ETH", b.native + " ETH"]
      ]);
      console.log();
      console.log(c.dim("  Fund this wallet by sending USDC to the address above."));
      console.log(c.dim("  Network: Base Sepolia (chain 84532)"));
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Create a new wallet for an agent").option("--agent <agentId>", "Agent ID (or use defaultAgentId from config)").option("--type <type>", "Wallet type: eoa | external (default: eoa)", "eoa").option("--label <label>", "Wallet label (default: Primary)", "Primary").option("--address <address>", "For --type external: owner-provided address").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`"));
      process.exit(1);
    }
    if (opts.type === "external" && !opts.address) {
      console.error(c.error("--address is required for --type external"));
      process.exit(1);
    }
    const spinner = spin("Creating wallet\u2026");
    try {
      const client = makeClient();
      const wallet = await client.wallets.create({
        agentId: agentId2,
        walletType: opts.type,
        label: opts.label,
        externalAddress: opts.address
      });
      spinner.stop();
      const w = wallet?.data ?? wallet;
      if (opts.json) return jsonOut(w);
      console.log(`
${sym.ok} ${c.bold("Wallet created")}`);
      detail([
        ["Address", c.bold(w.address)],
        ["Type", w.walletType],
        ["Chain", chainName(w.chainId)],
        ["Label", w.label],
        ["Wallet ID", w.id]
      ]);
      console.log();
      console.log(c.dim("  Fund this wallet by sending USDC to the address above."));
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("send").description("Send USDC (or ETH) from an agent wallet to another address").requiredOption("--agent <agentId>", "Agent ID").requiredOption("--to <address>", "Recipient address (0x\u2026)").requiredOption("--amount <amount>", "Amount to send (e.g. 10.5)").option("--token <symbol>", "Token to send: USDC or ETH (default: USDC)", "USDC").option("--wallet <walletId>", "Specific wallet ID (defaults to primary)").action(async (opts) => {
    const client = makeClient();
    const spinner = spin("Preparing transfer\u2026");
    try {
      let walletId = opts.wallet;
      if (!walletId) {
        const primary = await client.wallets.primary(opts.agent);
        const w = primary?.data ?? primary;
        if (!w?.id) {
          spinner.stop();
          console.error(c.error(`No wallet found for agent ${opts.agent}. Run: agc wallet create --agent ${opts.agent}`));
          process.exit(1);
        }
        walletId = w.id;
      }
      spinner.text = `Sending ${opts.amount} ${opts.token} \u2192 ${opts.to}\u2026`;
      const result = await client.wallets.transfer(walletId, {
        toAddress: opts.to,
        amount: opts.amount,
        tokenSymbol: opts.token
      });
      const tx = result?.txHash ?? result?.data?.txHash ?? result;
      spinner.stop();
      console.log(`
${c.bold("Transfer sent")}`);
      detail([
        ["Amount", `${opts.amount} ${opts.token}`],
        ["To", opts.to],
        ["Tx Hash", c.id(tx)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("x402-fetch").description("Fetch a URL using an agent wallet to pay any x402 (402 Payment Required) challenge").requiredOption("--agent <agentId>", "Agent ID").requiredOption("--url <url>", "Target URL to fetch").option("--method <method>", "HTTP method", "GET").option("--header <header>", "Extra header in Key:Value format (repeatable)", collect, []).option("--body <body>", "Request body string").option("--json", "Output response as JSON").action(async (opts) => {
    const client = makeClient();
    const spinner = spin(`Fetching ${opts.url}\u2026`);
    try {
      const headers = {};
      for (const h of opts.header) {
        const idx = h.indexOf(":");
        if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
      }
      const res = await client.wallets.x402Fetch(opts.agent, {
        url: opts.url,
        method: opts.method,
        headers: Object.keys(headers).length ? headers : void 0,
        body: opts.body
      });
      spinner.stop();
      if (opts.json) return jsonOut(res);
      console.log(`
${c.bold("Response")}  status ${res.status}`);
      if (res.status === 200) {
        console.log(c.dim(JSON.stringify(res.body, null, 2).slice(0, 1e3)));
      } else {
        console.log(c.warn(JSON.stringify(res.body, null, 2)));
      }
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}
function collect(val, acc) {
  acc.push(val);
  return acc;
}
function chainName(chainId) {
  const names = {
    "84532": "Base Sepolia",
    "8453": "Base",
    "1": "Ethereum",
    "137": "Polygon"
  };
  return names[chainId] ?? `chain ${chainId}`;
}

// src/commands/models.ts
var import_commander13 = require("commander");
function modelsCommand() {
  const cmd = new import_commander13.Command("models").description("List available LLM models");
  cmd.command("ls").description("List all available models grouped by provider").option("--provider <name>", "Filter by provider (openai, anthropic, google, mistral, groq, ollama)").option("--json", "Output as JSON").action(async (opts) => {
    const client = makeClient();
    const spinner = spin("Fetching models\u2026");
    try {
      const res = await client.models.list();
      spinner.stop();
      const all = res?.data ?? res ?? [];
      if (opts.json) return jsonOut(all);
      const filtered = opts.provider ? all.filter((m) => m.provider === opts.provider) : all;
      if (filtered.length === 0) {
        console.log(c.warn("  No models found."));
        return;
      }
      const grouped = {};
      for (const m of filtered) {
        if (!grouped[m.provider]) grouped[m.provider] = [];
        grouped[m.provider].push(m);
      }
      for (const [provider, models] of Object.entries(grouped)) {
        console.log(`
${c.bold(provider.toUpperCase())}`);
        for (const m of models) {
          const tags = [
            m.tier,
            m.supportsTools ? "tools" : "",
            m.supportsVision ? "vision" : ""
          ].filter(Boolean).join(", ");
          const price = m.inputPricePer1kTokens > 0 ? c.dim(` ($${m.inputPricePer1kTokens}/$${m.outputPricePer1kTokens} /1k)`) : c.dim(" (free/local)");
          console.log(`  ${c.id(m.modelId.padEnd(36))} ${m.displayName.padEnd(24)} ${c.dim(tags)}${price}`);
        }
      }
      console.log();
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/memory.ts
var import_commander14 = require("commander");
function memoryCommand() {
  const cmd = new import_commander14.Command("memory").description("View and manage agent memories");
  cmd.command("list").description("List memories for an agent").option("--agent <agentId>", "Agent ID (defaults to configured agent)").option("--type <type>", "Filter by type: episodic | semantic | procedural").option("--limit <n>", "Max results", "50").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId"));
      process.exit(1);
    }
    const spinner = spin("Fetching memories\u2026");
    try {
      const client = makeClient();
      const res = await client.memory.list(agentId2, {
        type: opts.type,
        limit: parseInt(opts.limit, 10)
      });
      const memories = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(memories);
      section(`Memories for ${agentId2.slice(0, 12)}\u2026 (${memories.length})`);
      if (memories.length === 0) {
        console.log(c.dim("  No memories yet"));
        return;
      }
      table(
        memories.map((m) => ({
          ID: m.memoryId?.slice(0, 8) + "\u2026",
          Type: m.memoryType ?? "",
          Content: (m.content ?? "").slice(0, 60),
          Created: relativeTime(m.createdAt)
        })),
        ["ID", "Type", "Content", "Created"]
      );
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("stats").description("Show memory statistics for an agent").option("--agent <agentId>", "Agent ID").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId>"));
      process.exit(1);
    }
    const spinner = spin("Fetching stats\u2026");
    try {
      const client = makeClient();
      const res = await client.memory.stats(agentId2);
      const stats = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(stats);
      section("Memory Stats");
      detail([
        ["Total", String(stats.totalCount ?? 0)],
        ["Episodic", String(stats.episodicCount ?? 0)],
        ["Semantic", String(stats.semanticCount ?? 0)],
        ["Procedural", String(stats.proceduralCount ?? 0)]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("create").description("Manually add a memory for an agent").requiredOption("--agent <agentId>", "Agent ID").requiredOption("--content <text>", "Memory content").option("--type <type>", "Memory type: episodic | semantic | procedural", "semantic").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Creating memory\u2026");
    try {
      const client = makeClient();
      const res = await client.memory.create({
        agentId: opts.agent,
        content: opts.content,
        summary: String(opts.content).slice(0, 200),
        memoryType: opts.type
      });
      const memory = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(memory);
      console.log(`
${sym.ok} Memory created`);
      detail([
        ["ID", c.id(memory.memoryId)],
        ["Type", memory.memoryType ?? ""],
        ["Content", memory.content ?? ""]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("delete <memoryId>").description("Delete a memory by ID").option("--json", "Output as JSON").action(async (memoryId, opts) => {
    const spinner = spin("Deleting memory\u2026");
    try {
      const client = makeClient();
      await client.memory.delete(memoryId);
      spinner.stop();
      if (opts.json) return jsonOut({ deleted: true, memoryId });
      console.log(`
${sym.ok} Memory ${c.id(memoryId)} deleted`);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("search <query>").description("Semantic search over agent memories").option("--agent <agentId>", "Agent ID").option("--limit <n>", "Max results", "10").option("--json", "Output as JSON").action(async (query, opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId>"));
      process.exit(1);
    }
    const spinner = spin("Searching memories\u2026");
    try {
      const client = makeClient();
      const res = await client.memory.retrieve(agentId2, query, parseInt(opts.limit, 10));
      const memories = res?.data ?? res ?? [];
      spinner.stop();
      if (opts.json) return jsonOut(memories);
      section(`Search results (${memories.length})`);
      if (memories.length === 0) {
        console.log(c.dim("  No relevant memories found"));
        return;
      }
      memories.forEach((m, i) => {
        console.log(`
  ${c.dim(`${i + 1}.`)} ${m.content ?? ""}`);
        console.log(`     ${c.dim(`type: ${m.memoryType ?? ""} \xB7 ${relativeTime(m.createdAt)}`)}`);
      });
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/usage.ts
var import_commander15 = require("commander");
function usageCommand() {
  const cmd = new import_commander15.Command("usage").description("View token usage and cost by agent");
  cmd.command("agents").description("Show usage summary for all your agents").option("--owner <address>", "Owner address (defaults to configured initiator)").option("--from <date>", "Start date (ISO, e.g. 2025-01-01)").option("--to <date>", "End date (ISO)").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const owner = opts.owner ?? cfg.initiator;
    if (!owner) {
      console.error(c.error("Specify --owner or run `agc login` first"));
      process.exit(1);
    }
    const spinner = spin("Fetching agents\u2026");
    try {
      const client = makeClient();
      const agentsRes = await client.agents.list(owner);
      const agents = agentsRes?.data ?? [];
      spinner.stop();
      if (agents.length === 0) {
        console.log(c.dim("No agents found"));
        return;
      }
      spin("Fetching usage\u2026");
      const rows = await Promise.allSettled(
        agents.map(
          (a) => client.usage.getAgentUsage(a.agentId, {
            from: opts.from,
            to: opts.to
          }).then((r) => ({
            agentId: a.agentId,
            name: a.name || a.agentId.slice(0, 12),
            ...r?.data ?? r ?? {}
          }))
        )
      );
      const data = rows.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (opts.json) return jsonOut(data);
      let totalTokens = 0, totalCost = 0, totalCalls = 0;
      data.forEach((r) => {
        totalTokens += r.totalTokens ?? 0;
        totalCost += r.totalCostUsd ?? 0;
        totalCalls += r.callCount ?? 0;
      });
      section("Usage Summary");
      detail([
        ["Total tokens", totalTokens.toLocaleString()],
        ["Total cost", `$${totalCost.toFixed(4)} USD`],
        ["LLM calls", totalCalls.toLocaleString()]
      ]);
      const active = data.filter((r) => (r.totalTokens ?? 0) > 0);
      if (active.length) {
        console.log("");
        table(
          active.sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0)).map((r) => ({
            Agent: r.name,
            Calls: (r.callCount ?? 0).toLocaleString(),
            Tokens: (r.totalTokens ?? 0).toLocaleString(),
            "Cost $": (r.totalCostUsd ?? 0).toFixed(4)
          })),
          ["Agent", "Calls", "Tokens", "Cost $"]
        );
      }
    } catch (err) {
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("agent <agentId>").description("Show detailed usage for a specific agent").option("--from <date>", "Start date (ISO)").option("--to <date>", "End date (ISO)").option("--json", "Output as JSON").action(async (agentId2, opts) => {
    const spinner = spin("Fetching usage\u2026");
    try {
      const client = makeClient();
      const res = await client.usage.getAgentUsage(agentId2, {
        from: opts.from,
        to: opts.to
      });
      const data = res?.data ?? res;
      spinner.stop();
      if (opts.json) return jsonOut(data);
      section(`Usage \u2014 ${agentId2.slice(0, 12)}\u2026`);
      detail([
        ["Calls", (data.callCount ?? 0).toLocaleString()],
        ["Input tokens", (data.totalInputTokens ?? 0).toLocaleString()],
        ["Output tokens", (data.totalOutputTokens ?? 0).toLocaleString()],
        ["Total tokens", (data.totalTokens ?? 0).toLocaleString()],
        ["Cost", `$${(data.totalCostUsd ?? 0).toFixed(6)} USD`]
      ]);
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/billing.ts
var import_commander16 = require("commander");
function creditsCommand() {
  const cmd = new import_commander16.Command("credits").description("View your credit balance and ledger");
  cmd.command("balance", { isDefault: true }).description("Show your current credit balance").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching balance\u2026");
    try {
      const client = makeClient();
      const res = await client.credits.balance();
      spinner.stop();
      if (opts.json) return jsonOut(res.data);
      section("Credits");
      detail([["Balance", String(res?.data?.balance ?? 0)]]);
    } catch (e) {
      spinner.stop();
      console.error(c.error(e.message));
      process.exit(1);
    }
  });
  cmd.command("ledger").description("Show recent credit ledger entries").option("--limit <n>", "Max entries", "20").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching ledger\u2026");
    try {
      const client = makeClient();
      const res = await client.credits.ledger({ limit: Number(opts.limit) });
      spinner.stop();
      const rows = res?.data ?? [];
      if (opts.json) return jsonOut(rows);
      section("Credit ledger");
      for (const e of rows) {
        const sign = e.amount >= 0 ? "+" : "";
        console.log(
          `${c.dim(new Date(e.createdAt).toLocaleString())}  ${sign}${e.amount}  ${e.description || e.eventType}`
        );
      }
      if (!rows.length) console.log(c.dim("No entries."));
    } catch (e) {
      spinner.stop();
      console.error(c.error(e.message));
      process.exit(1);
    }
  });
  return cmd;
}
function billingCommand() {
  const cmd = new import_commander16.Command("billing").description("Manage your subscription and top-ups");
  cmd.command("status", { isDefault: true }).description("Show your current plan and entitlements").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching plan\u2026");
    try {
      const client = makeClient();
      const res = await client.billing.subscription();
      spinner.stop();
      if (opts.json) return jsonOut(res.data);
      const d = res.data;
      section("Subscription");
      detail([
        ["Plan", `${d.planName} (${d.planKey})`],
        ["Status", d.status],
        ["Monthly credits", String(d.monthlyCredits)],
        ["Computer use", d.entitlements?.computerUse ? "yes" : "no"],
        [
          "Renews",
          d.currentPeriodEnd ? new Date(d.currentPeriodEnd).toLocaleDateString() : void 0
        ]
      ]);
    } catch (e) {
      spinner.stop();
      console.error(c.error(e.message));
      process.exit(1);
    }
  });
  cmd.command("upgrade <plan>").description("Start a checkout to upgrade (plus | pro | max)").action(async (plan) => {
    try {
      const client = makeClient();
      const res = await client.billing.subscribe(plan);
      const url = res?.data?.url;
      if (!url) {
        console.error(c.error("Could not create checkout session"));
        process.exit(1);
      }
      console.log(c.dim("Opening checkout in your browser:"));
      console.log(url);
      await openBrowser(url);
    } catch (e) {
      console.error(c.error(e.message));
      process.exit(1);
    }
  });
  cmd.command("topup <pack>").description("Buy a one-time credit pack (small | medium | large)").action(async (pack) => {
    try {
      const client = makeClient();
      const res = await client.billing.topup(pack);
      const url = res?.data?.url;
      if (!url) {
        console.error(c.error("Could not create checkout session"));
        process.exit(1);
      }
      console.log(url);
      await openBrowser(url);
    } catch (e) {
      console.error(c.error(e.message));
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/logs.ts
var import_commander17 = require("commander");
var STATUS_COLOR = {
  success: (s) => c.bold(s),
  error: (s) => c.error(s),
  warning: (s) => c.warn(s)
};
function colorStatus(status) {
  return (STATUS_COLOR[status] ?? c.dim)(status);
}
function logsCommand() {
  const cmd = new import_commander17.Command("logs").description("View agent activity logs");
  cmd.command("list").alias("ls").description("List recent log entries for an agent").option("--agent <agentId>", "Agent ID (defaults to configured agent)").option("--session <sessionId>", "Filter by session ID").option("--status <status>", "Filter: success | error | warning").option("--limit <n>", "Max entries to show", "50").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId> or set defaultAgentId"));
      process.exit(1);
    }
    const spinner = spin("Fetching logs\u2026");
    try {
      const client = makeClient();
      const res = await client.logs.list(agentId2, {
        limit: Number(opts.limit),
        sessionId: opts.session
      });
      let logs = res?.data ?? res ?? [];
      if (opts.status) logs = logs.filter((l) => l.status === opts.status);
      spinner.stop();
      if (opts.json) return jsonOut(logs);
      section(`Logs \u2014 ${agentId2.slice(0, 12)}\u2026 (${logs.length})`);
      if (logs.length === 0) {
        console.log(c.dim("  No logs yet"));
        return;
      }
      logs.forEach((l) => {
        const tools = (l.tools ?? []).length > 0 ? ` ${c.dim(`[${l.tools.length} tools]`)}` : "";
        const rt = l.responseTime > 0 ? c.dim(` ${l.responseTime}ms`) : "";
        console.log(
          `  ${colorStatus((l.status ?? "info").padEnd(7))}  ${c.bold(l.action ?? "")}${rt}${tools}`
        );
        if (l.message) {
          console.log(`  ${" ".repeat(10)}${c.dim(l.message.slice(0, 80))}`);
        }
        console.log(`  ${" ".repeat(10)}${c.dim(relativeTime(l.timestamp))}`);
        console.log("");
      });
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  cmd.command("errors").description("Show only error log entries for an agent").option("--agent <agentId>", "Agent ID").option("--limit <n>", "Max entries", "20").option("--json", "Output as JSON").action(async (opts) => {
    const cfg = loadConfig();
    const agentId2 = opts.agent ?? cfg.defaultAgentId;
    if (!agentId2) {
      console.error(c.error("Specify --agent <agentId>"));
      process.exit(1);
    }
    const spinner = spin("Fetching error logs\u2026");
    try {
      const client = makeClient();
      const res = await client.logs.list(agentId2, {
        limit: Number(opts.limit)
      });
      const errors = (res?.data ?? []).filter((l) => l.status === "error");
      spinner.stop();
      if (opts.json) return jsonOut(errors);
      section(`Errors \u2014 ${agentId2.slice(0, 12)}\u2026 (${errors.length})`);
      if (errors.length === 0) {
        console.log(`${sym.ok} No errors found`);
        return;
      }
      errors.forEach((l) => {
        console.log(`  ${c.error("\u2716")} ${c.bold(l.action ?? "")}  ${c.dim(relativeTime(l.timestamp))}`);
        if (l.message) console.log(`    ${c.dim(l.message)}`);
        console.log("");
      });
    } catch (err) {
      spinner.stop();
      printError(err);
      process.exit(1);
    }
  });
  return cmd;
}

// src/commands/computer.ts
var import_commander18 = require("commander");
var RESOURCE_PROFILES = [
  "starter",
  "standard",
  "performance",
  "gpu"
];
var RESOURCE_MODES = ["fixed", "elastic"];
function resolveAgentId(opts) {
  const agentId2 = opts.agent ?? loadConfig().defaultAgentId;
  if (!agentId2) {
    throw new Error(
      "Specify --agent <agentId> or set defaultAgentId with `agc config set defaultAgentId <id>`."
    );
  }
  return agentId2;
}
function unwrap(response) {
  return response?.data ?? response;
}
function displayComputer(computer) {
  if (!computer) {
    section("Persistent cloud computer");
    detail([
      ["Status", statusBadge("disabled")],
      ["Persistence", "persistent"],
      ["Computer ID", c.dim("(not provisioned)")]
    ]);
    console.log(c.dim("  Enable it with: agc computer enable --agent <agentId>"));
    return;
  }
  const wire = computer;
  const resources = computer.resources ?? {};
  const gpu = resources.gpu ?? (wire.gpuCount ? { count: wire.gpuCount, type: wire.gpuType } : null);
  const cpu = resources.vcpu ?? wire.cpuRequest ?? wire.cpuLimit;
  const memory = resources.memoryGiB != null ? `${resources.memoryGiB} GiB` : wire.memoryRequest ?? wire.memoryLimit;
  const storage = resources.storageGiB != null ? `${resources.storageGiB} GiB` : wire.storageLimit;
  section("Persistent cloud computer");
  detail([
    ["Computer ID", computer.computerId ? c.id(computer.computerId) : c.dim("(not provisioned)")],
    ["Enabled", computer.enabled === false ? "no" : c.success("yes")],
    ["Status", statusBadge(computer.status ?? "disabled")],
    ["Desired state", computer.desiredState ?? c.dim("n/a")],
    ["Persistence", computer.persistence ?? wire.lifecycle ?? "persistent"],
    ["Profile", computer.resourceProfile ?? c.dim("n/a")],
    ["Mode", computer.resourceMode ?? c.dim("n/a")],
    ["CPU", cpu != null ? String(cpu) : c.dim("n/a")],
    ["Memory", memory != null ? String(memory) : c.dim("n/a")],
    ["Storage", storage != null ? String(storage) : c.dim("n/a")],
    ["GPU", gpu?.count ? `${gpu.count} \xD7 ${gpu.type ?? "provider default"}` : "none"],
    ["Region", computer.region ?? c.dim("automatic")],
    ["Workspace", computer.workspaceRoot ?? c.dim("not mounted")],
    ["Last activity", computer.lastActivityAt ? relativeTime(computer.lastActivityAt) : c.dim("never")],
    ["Error", computer.errorMessage ?? void 0]
  ]);
}
function parseNumber(value, name, options) {
  if (value === void 0) return void 0;
  const parsed = Number(value);
  const minimum = options?.allowZero ? 0 : Number.MIN_VALUE;
  if (!Number.isFinite(parsed) || parsed < minimum || options?.integer && !Number.isInteger(parsed)) {
    const qualifier = options?.integer ? "whole number" : "number";
    throw new Error(`${name} must be a ${options?.allowZero ? "non-negative" : "positive"} ${qualifier}.`);
  }
  return parsed;
}
async function changeEnabled(agentId2, enabled, json) {
  const spinner = spin(`${enabled ? "Enabling" : "Disabling"} persistent cloud computer\u2026`);
  try {
    const response = await makeClient().agents.updateComputerConfig(agentId2, { enabled });
    const config = unwrap(response);
    spinner.stop();
    if (json) return jsonOut(config);
    console.log(`
${sym.ok} Persistent cloud computer ${enabled ? "enabled" : "disabled"} for agent ${c.id(agentId2)}`);
    if (enabled) {
      console.log(c.dim(`  Wake it now with: agc computer wake --agent ${agentId2}`));
    }
  } catch (error) {
    spinner.stop();
    printError(error);
    process.exitCode = 1;
  }
}
async function lifecycleAction(action, agentId2, reason, json) {
  const verb = action === "wake" ? "Waking" : action === "sleep" ? "Sleeping" : "Restarting";
  const spinner = spin(`${verb} persistent cloud computer\u2026`);
  try {
    const client = makeClient();
    const response = action === "wake" ? await client.agents.wakeComputer(agentId2, reason ? { reason } : void 0) : action === "sleep" ? await client.agents.sleepComputer(agentId2, reason ? { reason } : void 0) : await client.agents.restartComputer(agentId2, reason ? { reason } : void 0);
    const computer = unwrap(response);
    spinner.stop();
    if (json) return jsonOut(computer);
    console.log(`
${sym.ok} Persistent cloud computer ${action === "sleep" ? "is sleeping" : action === "wake" ? "is awake" : "restarted"}`);
    displayComputer(computer);
  } catch (error) {
    spinner.stop();
    printError(error);
    process.exitCode = 1;
  }
}
function addAgentOption(command) {
  return command.option("--agent <agentId>", "Agent ID (defaults to configured agent)");
}
function computerCommand() {
  const command = new import_commander18.Command("computer").description("Manage an agent's one persistent cloud computer");
  addAgentOption(command.command("status").description("Show persistent cloud computer status")).option("--json", "Output as JSON").action(async (opts) => {
    let agentId2;
    try {
      agentId2 = resolveAgentId(opts);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
      return;
    }
    const spinner = spin("Fetching persistent cloud computer\u2026");
    try {
      const computer = unwrap(await makeClient().agents.getComputer(agentId2));
      spinner.stop();
      if (opts.json) return jsonOut(computer);
      displayComputer(computer);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exitCode = 1;
    }
  });
  addAgentOption(command.command("enable").description("Enable a persistent cloud computer for an agent")).option("--json", "Output as JSON").action(async (opts) => {
    try {
      await changeEnabled(resolveAgentId(opts), true, !!opts.json);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });
  addAgentOption(command.command("disable").description("Disable the agent cloud computer")).option("--json", "Output as JSON").action(async (opts) => {
    try {
      await changeEnabled(resolveAgentId(opts), false, !!opts.json);
    } catch (error) {
      printError(error);
      process.exitCode = 1;
    }
  });
  for (const action of ["wake", "sleep", "restart"]) {
    const descriptions = {
      wake: "Wake the persistent cloud computer",
      sleep: "Sleep compute while preserving the persistent workspace",
      restart: "Restart the runtime while preserving the persistent workspace"
    };
    addAgentOption(command.command(action).description(descriptions[action])).option("--reason <text>", `Reason for the ${action}`).option("--json", "Output as JSON").action(async (opts) => {
      try {
        await lifecycleAction(action, resolveAgentId(opts), opts.reason, !!opts.json);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
  }
  addAgentOption(command.command("resize").description("Resize the persistent cloud computer")).option("--profile <profile>", `Resource profile: ${RESOURCE_PROFILES.join(" | ")}`).option("--mode <mode>", `Resource mode: ${RESOURCE_MODES.join(" | ")}`).option("--vcpu <count>", "Requested virtual CPU count").option("--cpu <count>", "Alias for --vcpu").option("--memory <gib>", "Requested memory in GiB").option("--storage <gib>", "Requested persistent storage in GiB").option("--gpu-type <type>", "GPU type, such as nvidia-h100").option("--gpu-count <count>", "GPU count (0 removes GPU allocation)").option("--json", "Output as JSON").action(async (opts) => {
    let agentId2;
    let resize;
    try {
      agentId2 = resolveAgentId(opts);
      if (opts.profile && !RESOURCE_PROFILES.includes(opts.profile)) {
        throw new Error(`--profile must be one of: ${RESOURCE_PROFILES.join(", ")}.`);
      }
      if (opts.mode && !RESOURCE_MODES.includes(opts.mode)) {
        throw new Error(`--mode must be one of: ${RESOURCE_MODES.join(", ")}.`);
      }
      if (opts.vcpu !== void 0 && opts.cpu !== void 0) {
        throw new Error("Use either --vcpu or --cpu, not both.");
      }
      const vcpu = parseNumber(opts.vcpu ?? opts.cpu, "CPU");
      const memoryGiB = parseNumber(opts.memory, "Memory");
      const storageGiB = parseNumber(opts.storage, "Storage");
      const gpuCount = parseNumber(opts.gpuCount, "GPU count", { integer: true, allowZero: true });
      const resources = {
        ...vcpu !== void 0 && { vcpu },
        ...memoryGiB !== void 0 && { memoryGiB },
        ...storageGiB !== void 0 && { storageGiB },
        ...(gpuCount !== void 0 || opts.gpuType) && {
          gpu: { count: gpuCount ?? 1, ...opts.gpuType && { type: opts.gpuType } }
        }
      };
      resize = {
        ...opts.profile && { resourceProfile: opts.profile },
        ...opts.mode && { resourceMode: opts.mode },
        ...Object.keys(resources).length > 0 && { resources }
      };
      if (Object.keys(resize).length === 0) {
        throw new Error("Specify --profile, --mode, or at least one resource value.");
      }
    } catch (error) {
      printError(error);
      process.exitCode = 1;
      return;
    }
    const spinner = spin("Resizing persistent cloud computer\u2026");
    try {
      const computer = unwrap(await makeClient().agents.resizeComputer(agentId2, resize));
      spinner.stop();
      if (opts.json) return jsonOut(computer);
      console.log(`
${sym.ok} Persistent cloud computer resize requested`);
      displayComputer(computer);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exitCode = 1;
    }
  });
  addAgentOption(
    command.command("exec").description("Run a command in the persistent cloud computer").argument("<command...>", "Command and arguments to run")
  ).option("--cwd <path>", "Working directory").option("--timeout <seconds>", "Command timeout in seconds", "120").option("--json", "Output as JSON").action(async (commandParts, opts) => {
    let agentId2;
    let timeoutSeconds;
    try {
      agentId2 = resolveAgentId(opts);
      timeoutSeconds = parseNumber(opts.timeout, "Timeout");
    } catch (error) {
      printError(error);
      process.exitCode = 1;
      return;
    }
    const spinner = spin("Running command in persistent cloud computer\u2026");
    try {
      const result = unwrap(await makeClient().agents.execComputer(agentId2, {
        command: commandParts.join(" "),
        ...opts.cwd && { cwd: opts.cwd },
        ...timeoutSeconds !== void 0 && { timeoutSeconds }
      }));
      spinner.stop();
      if (opts.json) return jsonOut(result);
      const stdout = result?.stdout ?? result?.output ?? result?.result ?? "";
      const stderr = result?.stderr ?? "";
      if (stdout) process.stdout.write(String(stdout).replace(/\n?$/, "\n"));
      if (stderr) process.stderr.write(c.error(String(stderr).replace(/\n?$/, "\n")));
      const exitCode = result?.exitCode ?? result?.exit_code;
      if (exitCode !== void 0 && exitCode !== 0) process.exitCode = Number(exitCode);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exitCode = 1;
    }
  });
  addAgentOption(command.command("events").description("List recent persistent cloud computer events")).option("--limit <count>", "Maximum events", "50").option("--json", "Output as JSON").action(async (opts) => {
    let agentId2;
    let limit;
    try {
      agentId2 = resolveAgentId(opts);
      limit = parseNumber(opts.limit, "Limit", { integer: true });
    } catch (error) {
      printError(error);
      process.exitCode = 1;
      return;
    }
    const spinner = spin("Fetching persistent cloud computer events\u2026");
    try {
      const events = unwrap(await makeClient().agents.listComputerEvents(agentId2, limit));
      spinner.stop();
      if (opts.json) return jsonOut(events);
      section(`Cloud computer events (${events.length})`);
      table(
        events.map((event) => ({
          Event: event.eventType ?? "",
          Summary: event.summary ?? "",
          Actor: event.actorType ?? "",
          When: event.createdAt ? relativeTime(event.createdAt) : ""
        })),
        ["Event", "Summary", "Actor", "When"]
      );
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exitCode = 1;
    }
  });
  return command;
}

// src/commands/library.ts
var import_commander19 = require("commander");
var import_fs7 = require("fs");
var import_path5 = require("path");
function libraryCommand() {
  const command = new import_commander19.Command("library").alias("files").description("Upload, find, and manage files in your Commons library");
  command.command("list", { isDefault: true }).alias("ls").description("List library items").option("--query <text>", "Search names and descriptions").option("--source <source>", "Filter by source").option("--session <sessionId>", "Filter by session").option("--favorites", "Show favorites only").option("--limit <n>", "Maximum items", "50").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching your library\u2026");
    try {
      const result = await makeClient().library.list({
        query: opts.query,
        source: opts.source,
        sessionId: opts.session,
        favorite: opts.favorites ? true : void 0,
        limit: Number(opts.limit)
      });
      spinner.stop();
      if (opts.json) return jsonOut(result);
      section(`Library (${result.data.length})`);
      table(
        result.data.map((item) => ({
          ID: String(item.itemId ?? item.fileId).slice(0, 10) + "\u2026",
          Name: item.name ?? item.originalName ?? "(untitled)",
          Type: item.mimeType ?? "",
          Size: typeof item.size === "number" ? `${Math.ceil(item.size / 1024)} KB` : "",
          Favorite: item.isFavorite ? "\u2605" : "",
          Created: item.createdAt ? relativeTime(item.createdAt) : ""
        })),
        ["ID", "Name", "Type", "Size", "Favorite", "Created"]
      );
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("get <itemId>").description("Show library item details").option("--json", "Output as JSON").action(async (itemId, opts) => {
    const spinner = spin("Fetching library item\u2026");
    try {
      const result = await makeClient().library.get(itemId);
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      const item = result.data;
      detail([
        ["Item ID", c.id(String(item.itemId ?? item.fileId))],
        ["Name", item.name ?? item.originalName ?? "(untitled)"],
        ["Description", item.description ?? ""],
        ["Type", item.mimeType ?? ""],
        ["Storage", item.storageProvider ?? ""],
        ["Favorite", item.isFavorite ? "yes" : "no"],
        ["Created", item.createdAt ? relativeTime(item.createdAt) : ""]
      ]);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("upload <paths...>").description("Upload one or more local files").option("--agent <agentId>", "Associate files with an agent").option("--session <sessionId>", "Associate files with a session").option("--storage <provider>", "Storage provider: s3 | ipfs").option("--json", "Output as JSON").action(async (paths, opts) => {
    const spinner = spin(`Uploading ${paths.length} file${paths.length === 1 ? "" : "s"}\u2026`);
    try {
      if (opts.storage && opts.storage !== "s3" && opts.storage !== "ipfs") {
        throw new Error("--storage must be either s3 or ipfs.");
      }
      const files = paths.map((path) => ({
        data: new Blob([new Uint8Array((0, import_fs7.readFileSync)(path))]),
        name: (0, import_path5.basename)(path)
      }));
      const result = await makeClient().files.upload(files, {
        agentId: opts.agent,
        sessionId: opts.session,
        storageProvider: opts.storage
      });
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(
        `
${sym.ok} Uploaded ${result.data.length} file${result.data.length === 1 ? "" : "s"}.`
      );
      for (const file of result.data) {
        console.log(
          `  ${sym.arrow} ${c.bold(file.name ?? file.originalName ?? file.fileId)} ${c.dim(file.fileId)}`
        );
      }
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  for (const favorite of [true, false]) {
    command.command(`${favorite ? "favorite" : "unfavorite"} <itemId>`).description(`${favorite ? "Add" : "Remove"} a library item ${favorite ? "to" : "from"} favorites`).action(async (itemId) => {
      const spinner = spin("Updating library item\u2026");
      try {
        await makeClient().library.update(itemId, {
          isFavorite: favorite
        });
        spinner.stop();
        console.log(
          `${sym.ok} Item ${favorite ? "added to" : "removed from"} favorites.`
        );
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exit(1);
      }
    });
  }
  command.command("delete <itemId>").description("Delete a library item").action(async (itemId) => {
    const spinner = spin("Deleting library item\u2026");
    try {
      await makeClient().library.delete(itemId);
      spinner.stop();
      console.log(`${sym.ok} Library item deleted.`);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  return command;
}

// src/commands/projects.ts
var import_commander20 = require("commander");
var import_fs8 = require("fs");
function agentId(value) {
  const resolved = value ?? loadConfig().defaultAgentId;
  if (!resolved) {
    throw new Error(
      "Specify --agent <agentId> or set a default with `agc config set defaultAgentId <id>`."
    );
  }
  return resolved;
}
function projectFiles(path) {
  if (!path) return void 0;
  const parsed = JSON.parse((0, import_fs8.readFileSync)(path, "utf8"));
  const files = Array.isArray(parsed) ? parsed : parsed.files;
  if (!Array.isArray(files)) {
    throw new Error("The files document must be an array or an object with a files array.");
  }
  return files;
}
function projectsCommand() {
  const command = new import_commander20.Command("projects").alias("project").description("Build, publish, and export agent code projects");
  command.command("list", { isDefault: true }).alias("ls").description("List projects for an agent").option("--agent <agentId>", "Agent ID").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching projects\u2026");
    try {
      const result = await makeClient().projects.list(agentId(opts.agent));
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      section(`Projects (${result.data.length})`);
      table(
        result.data.map((project) => ({
          ID: project.projectId.slice(0, 10) + "\u2026",
          Name: project.name,
          Files: String(project.files?.length ?? ""),
          Preview: project.previewUrl ?? project.previewSlug ?? "",
          Updated: project.updatedAt ?? ""
        })),
        ["ID", "Name", "Files", "Preview", "Updated"]
      );
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("get <projectId>").description("Show a code project").option("--agent <agentId>", "Agent ID").option("--json", "Output as JSON").action(async (projectId, opts) => {
    const spinner = spin("Fetching project\u2026");
    try {
      const result = await makeClient().projects.get(
        agentId(opts.agent),
        projectId
      );
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      const project = result.data;
      section(project.name);
      detail([
        ["Project ID", c.id(project.projectId)],
        ["Agent ID", project.agentId],
        ["Description", project.description ?? ""],
        ["Files", String(project.files?.length ?? 0)],
        ["Preview", project.previewUrl ?? project.previewSlug ?? ""],
        ["Updated", project.updatedAt ?? ""]
      ]);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("create").description("Create a code project").requiredOption("--name <name>", "Project name").option("--description <text>", "Project description").option("--agent <agentId>", "Agent ID").option("--session <sessionId>", "Associated session").option("--files <json>", "JSON file containing [{ path, content }]").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Creating project\u2026");
    try {
      const result = await makeClient().projects.create(
        agentId(opts.agent),
        {
          name: opts.name,
          description: opts.description,
          sessionId: opts.session,
          files: projectFiles(opts.files)
        }
      );
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`
${sym.ok} Project created.`);
      detail([
        ["Project ID", c.id(result.data.projectId)],
        ["Name", result.data.name]
      ]);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("write <projectId> <json>").description("Write project files from a JSON document").option("--agent <agentId>", "Agent ID").option("--replace", "Replace all existing files").option("--json", "Output as JSON").action(async (projectId, json, opts) => {
    const spinner = spin("Writing project files\u2026");
    try {
      const result = await makeClient().projects.writeFiles(
        agentId(opts.agent),
        projectId,
        projectFiles(json) ?? [],
        Boolean(opts.replace)
      );
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`${sym.ok} Project files updated.`);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("publish <projectId>").description("Build and publish a project preview").option("--agent <agentId>", "Agent ID").option("--json", "Output as JSON").action(async (projectId, opts) => {
    const spinner = spin("Building and publishing project\u2026");
    try {
      const result = await makeClient().projects.publish(
        agentId(opts.agent),
        projectId
      );
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`
${sym.ok} Project published.`);
      jsonOut(result.data);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("export <projectId>").description("Export a project to the agent computer").option("--agent <agentId>", "Agent ID").option("--directory <path>", "Destination directory").option("--session <sessionId>", "Associated session").option("--json", "Output as JSON").action(async (projectId, opts) => {
    const spinner = spin("Exporting project\u2026");
    try {
      const result = await makeClient().projects.exportToComputer(
        agentId(opts.agent),
        projectId,
        { directory: opts.directory, sessionId: opts.session }
      );
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`${sym.ok} Project exported to the agent computer.`);
      jsonOut(result.data);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("github <projectId>").description("Export a project to a GitHub repository").option("--agent <agentId>", "Agent ID").option("--repository <name>", "Repository name").option("--public", "Create a public repository").option("--json", "Output as JSON").action(async (projectId, opts) => {
    const spinner = spin("Exporting project to GitHub\u2026");
    try {
      const result = await makeClient().projects.exportToGitHub(
        agentId(opts.agent),
        projectId,
        {
          repositoryName: opts.repository,
          private: !opts.public
        }
      );
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`${sym.ok} Project exported to GitHub.`);
      jsonOut(result.data);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  return command;
}

// src/commands/api-keys.ts
var import_commander21 = require("commander");
async function resolveProject(projectId) {
  const projects = (await makeClient().developer.listProjects()).data;
  const project = projectId ? projects.find((candidate) => candidate.id === projectId) : projects[0];
  if (!project) {
    throw new Error(
      projectId ? `Developer project "${projectId}" was not found.` : "No developer project exists. Create one with `agc keys projects create --name <name>`."
    );
  }
  return project;
}
function apiKeysCommand() {
  const command = new import_commander21.Command("keys").alias("api-keys").description("Create and manage project-scoped developer API keys");
  command.command("list", { isDefault: true }).alias("ls").description("List API keys for a developer project").option("--project <projectId>", "Developer project ID (defaults to newest)").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching developer keys\u2026");
    try {
      const project = await resolveProject(opts.project);
      const result = await makeClient().developer.listApiKeys(project.id);
      spinner.stop();
      if (opts.json) {
        return jsonOut({ project, keys: result.data });
      }
      section(`${project.name} \xB7 API keys (${result.data.length})`);
      table(
        result.data.map((key) => ({
          ID: key.id.slice(0, 10) + "\u2026",
          Name: key.name,
          Prefix: key.keyPrefix,
          Status: key.status,
          Scopes: String(key.scopes.length),
          Expires: key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : "never",
          Used: key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "never"
        })),
        ["ID", "Name", "Prefix", "Status", "Scopes", "Expires", "Used"]
      );
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("create").description("Create a project-scoped API key").requiredOption("--name <name>", "Key name").option("--project <projectId>", "Developer project ID (defaults to newest)").option("--scopes <scopes>", "Comma-separated scopes (defaults to all project scopes)").option("--expires <iso>", "Expiration timestamp in ISO 8601 format").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Creating developer key\u2026");
    try {
      const project = await resolveProject(opts.project);
      const scopes = opts.scopes ? String(opts.scopes).split(",").map((scope) => scope.trim()).filter(Boolean) : void 0;
      const result = await makeClient().developer.createApiKey(project.id, {
        name: opts.name,
        scopes,
        expiresAt: opts.expires
      });
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`
${sym.ok} ${c.success("Developer API key created")}`);
      detail([
        ["Project", project.name],
        ["Name", result.data.name],
        ["Scopes", result.data.scopes.join(", ")],
        ["Expires", result.data.expiresAt ?? "never"]
      ]);
      console.log(
        `
  ${c.warn("Copy this key now. It will not be shown again.")}`
      );
      console.log(`
  ${c.bold(result.data.key)}
`);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("revoke <keyId>").description("Revoke a developer API key").action(async (keyId) => {
    const spinner = spin("Revoking developer key\u2026");
    try {
      await makeClient().developer.revokeApiKey(keyId);
      spinner.stop();
      console.log(`${sym.ok} Developer API key revoked.`);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  command.command("scopes").description("List supported developer API scopes").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching API scopes\u2026");
    try {
      const result = await makeClient().developer.scopes();
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      section("Developer API scopes");
      for (const scope of result.data) {
        console.log(`  ${sym.bullet} ${scope}`);
      }
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  const projects = command.command("projects").description("Manage developer projects");
  projects.command("list", { isDefault: true }).alias("ls").description("List developer projects").option("--json", "Output as JSON").action(async (opts) => {
    const spinner = spin("Fetching developer projects\u2026");
    try {
      const result = await makeClient().developer.listProjects();
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      section(`Developer projects (${result.data.length})`);
      table(
        result.data.map((project) => ({
          ID: project.id,
          Name: project.name,
          Environment: project.environment,
          Status: project.status
        })),
        ["ID", "Name", "Environment", "Status"]
      );
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  projects.command("create").description("Create a developer project").requiredOption("--name <name>", "Project name").option(
    "--environment <environment>",
    "production | development | staging",
    "development"
  ).option("--workspace <workspaceId>", "Workspace ID (defaults to signed-in workspace)").option("--json", "Output as JSON").action(async (opts) => {
    const workspaceId = opts.workspace ?? loadConfig().workspaceId;
    if (!workspaceId) {
      throw new Error(
        "No workspace is configured. Pass --workspace or sign in again."
      );
    }
    if (!["production", "development", "staging"].includes(opts.environment)) {
      throw new Error(
        "--environment must be production, development, or staging."
      );
    }
    const spinner = spin("Creating developer project\u2026");
    try {
      const result = await makeClient().developer.createProject({
        workspaceId,
        name: opts.name,
        environment: opts.environment
      });
      spinner.stop();
      if (opts.json) return jsonOut(result.data);
      console.log(`
${sym.ok} Developer project created.`);
      detail([
        ["Project ID", c.id(result.data.id)],
        ["Name", result.data.name],
        ["Environment", result.data.environment]
      ]);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exit(1);
    }
  });
  return command;
}

// src/commands/provenance.ts
var import_commander22 = require("commander");
function printTrajectory(trajectory) {
  const sources = trajectory.events.flatMap(
    (event) => event.metadata?.lineage?.sources ?? []
  );
  const delegates = trajectory.events.flatMap(
    (event) => event.metadata?.lineage?.delegation ? [event.metadata.lineage.delegation] : []
  );
  const matches = trajectory.events.flatMap(
    (event) => event.metadata?.lineage?.library?.results ?? []
  );
  section("Provenance report");
  detail([
    ["Runs", String(trajectory.summary?.runs ?? trajectory.runs?.length ?? 0)],
    [
      "Events",
      String(trajectory.summary?.events ?? trajectory.events?.length ?? 0)
    ],
    [
      "Model / tool calls",
      `${trajectory.summary?.modelCalls ?? 0} / ${trajectory.summary?.toolCalls ?? 0}`
    ],
    ["Sources", String(sources.length)],
    ["Agent delegations", String(delegates.length)],
    ["Library matches", String(matches.length)],
    ["Dropped events", String(trajectory.summary?.droppedEvents ?? 0)]
  ]);
  if (sources.length) {
    section("Web sources");
    for (const source of sources)
      console.log(
        `  ${c.primary(source.domain)}  ${source.title ?? ""}
  ${c.dim(source.url)}`
      );
  }
  if (delegates.length) {
    section("Agent contributions");
    for (const item of delegates)
      console.log(
        `  ${item.fromAgentId ?? "workflow"} \u2192 ${c.primary(item.toAgentId)}  ${c.dim(item.role ?? "")}`
      );
  }
  if (matches.length) {
    section("Library matches");
    for (const item of matches)
      console.log(
        `  ${c.primary(`${item.percentageMatch}%`)}  ${item.name ?? item.itemId}  ${c.dim(`#${item.rank}`)}`
      );
  }
}
function provenanceCommand() {
  const cmd = new import_commander22.Command("provenance").description(
    "Inspect and export provenance and attribution trails"
  );
  cmd.command("session <sessionId>").description("Show a plain-language sources and contributors report").option("--json", "Output the complete machine-readable trajectory").action(async (sessionId, opts) => {
    const spinner = spin("Building provenance report\u2026");
    try {
      const { data } = await makeClient().provenance.session(sessionId);
      spinner.stop();
      if (opts.json) return jsonOut(data);
      printTrajectory(data);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exitCode = 1;
    }
  });
  cmd.command("workflow <executionId>").description("Show provenance for a workflow execution").option("--json", "Output the complete machine-readable trajectory").action(async (executionId, opts) => {
    const spinner = spin("Building workflow provenance report\u2026");
    try {
      const { data } = await makeClient().provenance.scope(
        "workflow",
        executionId
      );
      spinner.stop();
      if (opts.json) return jsonOut(data);
      printTrajectory(data);
    } catch (error) {
      spinner.stop();
      printError(error);
      process.exitCode = 1;
    }
  });
  cmd.command("bundle <traceId>").description("Export the standards-based EAA provenance bundle as JSON").action(
    async (traceId) => jsonOut((await makeClient().provenance.bundle(traceId)).data)
  );
  return cmd;
}

// src/bin.ts
async function interactiveMenu() {
  banner();
  const cfg = loadConfig();
  const isSetup = !!((cfg.accessToken || cfg.apiKey || cfg.sessionToken) && (cfg.userId || cfg.initiator));
  if (!isSetup) {
    console.log(c.bold("  Welcome to Agent Commons CLI!"));
    console.log(
      c.dim(
        "  Looks like this is your first time here \u2014 let's get you set up.\n"
      )
    );
    console.log(
      `  ${sym.arrow} Running ${c.bold("agc login")} to configure your credentials\u2026
`
    );
    runSubcommand(["login"]);
    return;
  }
  console.log(
    `  ${c.dim("Connected to")}  ${c.primary(cfg.apiUrl)}  ${c.dim("\xB7")}  ${c.dim("Identity")} ${c.id((cfg.userId ?? cfg.initiator).slice(0, 8) + "\u2026" + (cfg.userId ?? cfg.initiator).slice(-4))}
`
  );
  const action = await select("What would you like to do?", [
    { label: "Chat with an agent", value: "chat", hint: "agc chat" },
    { label: "Run an agent (one-shot)", value: "run", hint: "agc run" },
    {
      label: "Manage an agent cloud computer",
      value: "computer",
      hint: "agc computer status"
    },
    { label: "View sessions", value: "sessions", hint: "agc sessions list" },
    { label: "Manage agents", value: "agents", hint: "agc agents list" },
    { label: "Tasks", value: "tasks", hint: "agc task list" },
    { label: "Workflows", value: "workflows", hint: "agc workflow list" },
    { label: "MCP servers", value: "mcp", hint: "agc mcp list" },
    { label: "Skills", value: "skills", hint: "agc skills list" },
    { label: "Library & files", value: "library", hint: "agc library list" },
    { label: "Code projects", value: "projects", hint: "agc projects list" },
    { label: "Developer API keys", value: "keys", hint: "agc keys list" },
    { label: "Wallet & balance", value: "wallet", hint: "agc wallet balance" },
    { label: "Usage & cost", value: "usage", hint: "agc usage" },
    { label: "Logs", value: "logs", hint: "agc logs" },
    { label: "Config & credentials", value: "config", hint: "agc config get" },
    { label: "Exit", value: "exit" }
  ]);
  if (action === "exit") {
    process.exit(0);
  }
  const needsAgent = action === "chat" || action === "run" || action === "computer";
  const agentId2 = needsAgent ? cfg.defaultAgentId ?? await pickAgentInteractively(action) : void 0;
  if (needsAgent && !agentId2) return;
  if (action === "run") {
    const prompt = await askPrompt("Enter your prompt:");
    if (!prompt) return;
    runSubcommand(["run", "--agent", agentId2, prompt]);
    return;
  }
  const commandMap = {
    chat: ["chat", "--agent", agentId2],
    run: [],
    // handled above
    computer: ["computer", "status", "--agent", agentId2],
    sessions: ["sessions", "list"],
    agents: ["agents", "list"],
    tasks: ["task", "list"],
    workflows: ["workflow", "list"],
    mcp: ["mcp", "list"],
    skills: ["skills", "list"],
    library: ["library", "list"],
    projects: ["projects", "list"],
    keys: ["keys", "list"],
    wallet: ["wallet", "balance"],
    usage: ["usage"],
    logs: ["logs"],
    config: ["config", "get"],
    exit: []
  };
  runSubcommand(commandMap[action]);
}
async function askPrompt(question) {
  const { createInterface: createInterface3 } = await import("readline");
  return new Promise((resolve2) => {
    const rl = createInterface3({
      input: process.stdin,
      output: process.stdout
    });
    process.stdout.write(`
  ${c.bold(question)}
  ${c.primary("\u203A")} `);
    rl.once("line", (line) => {
      rl.close();
      const trimmed = line.trim();
      resolve2(trimmed || null);
    });
  });
}
function runSubcommand(args) {
  const child = (0, import_child_process3.spawn)(process.argv[0], [process.argv[1], ...args], {
    stdio: "inherit"
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
async function pickAgentInteractively(action) {
  const cfg = loadConfig();
  const spinner = spin("Fetching your agents\u2026");
  let agents = [];
  try {
    const client = makeClient();
    const res = await client.agents.list(cfg.initiator);
    agents = res?.data ?? (Array.isArray(res) ? res : []);
    spinner.stop();
  } catch {
    spinner.stop();
    console.log(
      `
  ${c.warn("\u26A0")}  Could not fetch agents. Check your sign-in and connection.
`
    );
    return null;
  }
  if (agents.length === 0) {
    console.log(`
  ${c.warn("\u26A0")}  You don't have any agents yet.
`);
    const choice = await select(
      "What would you like to do?",
      [
        {
          label: "Create a new agent now",
          value: "create",
          hint: "agc agents create"
        },
        { label: "Go back", value: "cancel" }
      ]
    );
    if (choice === "create") {
      runSubcommand(["agents", "create"]);
    }
    return null;
  }
  console.log();
  const agentId2 = await select(
    action === "computer" ? "Choose the agent whose cloud computer you want to manage:" : `Choose an agent to ${action} with:`,
    agents.map((a) => ({
      label: a.name,
      value: a.agentId,
      hint: `${a.modelProvider}/${a.modelId}`
    }))
  );
  const saveDefault = await select("Set as your default agent?", [
    { label: "Yes \u2014 remember this agent for next time", value: true },
    { label: "No \u2014 just this once", value: false }
  ]);
  if (saveDefault) {
    saveConfig({ defaultAgentId: agentId2 });
    const chosen = agents.find((a) => a.agentId === agentId2);
    console.log(
      `  ${sym.ok} ${c.dim("Default agent set to")} ${c.bold(chosen?.name ?? agentId2)}
`
    );
  }
  return agentId2;
}
var program = new import_commander23.Command();
program.name("agc").description("Agent Commons CLI \u2014 interact with the Agent Commons platform").version("0.4.0", "-v, --version").showHelpAfterError("(run `agc --help` for usage)").configureHelp({
  sortOptions: true,
  sortSubcommands: true
}).addHelpText(
  "after",
  `
Examples:
  $ agc login
  $ agc agents list
  $ agc run --agent <id> "Summarize this week"
  $ agc keys create --name "CI" --scopes agents:read,agents:run

Docs: https://docs.agentcommons.io/docs/cli
`
).action(async () => {
  await interactiveMenu();
});
program.hook("preAction", async (_thisCommand, actionCommand) => {
  if (actionCommand.name() === "login" || actionCommand.name() === "logout")
    return;
  await ensureAccessToken();
});
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(whoamiCommand());
program.addCommand(configCommand());
program.addCommand(agentsCommand());
program.addCommand(sessionsCommand());
program.addCommand(toolsCommand());
program.addCommand(connectionsCommand());
program.addCommand(libraryCommand());
program.addCommand(projectsCommand());
program.addCommand(apiKeysCommand());
program.addCommand(provenanceCommand());
program.addCommand(workflowCommand());
program.addCommand(taskCommand());
program.addCommand(runCommand());
program.addCommand(chatCommand());
program.addCommand(computerCommand());
program.addCommand(mcpCommand());
program.addCommand(skillsCommand());
program.addCommand(walletCommand());
program.addCommand(modelsCommand());
program.addCommand(memoryCommand());
program.addCommand(usageCommand());
program.addCommand(logsCommand());
program.addCommand(creditsCommand());
program.addCommand(billingCommand());
program.on("command:*", () => {
  console.error(
    `
  ${c.error("Unknown command:")} ${program.args.join(" ")}
  Run ${c.bold("agc --help")} to see available commands, or just ${c.bold("agc")} for the interactive menu.
`
  );
  process.exit(1);
});
program.parseAsync(process.argv).catch((error) => {
  console.error(
    `
  ${sym.fail} ${c.error(error instanceof Error ? error.message : String(error))}
`
  );
  process.exitCode = 1;
});
