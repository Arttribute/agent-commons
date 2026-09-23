import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import {
  DESKTOP_PROTOCOL_VERSION,
  type AgentInput,
  type AppInput,
  type ChatRequest,
  type LocalSettings,
  type TaskInput,
  type WorkflowInput,
} from "@agent-commons/desktop-contract";
import { ensureLocalPreview, PrivateLocalRuntime } from "./runtime";

const CLOUD_URL = process.env.COMMONS_DESKTOP_CLOUD_URL ?? "https://www.agentcommons.io";
const CLOUD_ORIGIN = new URL(CLOUD_URL).origin;
const AUTH_ORIGIN = (process.env.COMMONS_DESKTOP_AUTH_ORIGIN ?? "https://auth.agentcommons.io").replace(/\/$/, "");
const DESKTOP_AUTH_CLIENT_ID = process.env.COMMONS_DESKTOP_AUTH_CLIENT_ID ?? "commons-desktop";
const DESKTOP_AUTH_SCOPES = [
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
  "usage:read",
].join(" ");
const capabilities = [
  "privateLocal.v1",
  "workspace.select",
  "localTools.v1",
  "knowledge.folders.v1",
  "tasks.local.v1",
  "workflows.local.v1",
  "apps.local.v1",
] as const;

let cloudWindow: BrowserWindow | null = null;
let localWindow: BrowserWindow | null = null;
let runtime: PrivateLocalRuntime;
let activeMode: "cloud" | "private-local" = "private-local";
let cloudAuthAttempt = 0;

type DeviceCodeResponse = {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
};

type DeviceTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

async function responseJson<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({})) as Promise<T>;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startupModePath() {
  return join(app.getPath("userData"), "startup-mode.json");
}

function rememberStartupMode(mode: typeof activeMode) {
  const path = startupModePath();
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ mode })}\n`, { mode: 0o600 });
}

async function selectStartupMode(): Promise<typeof activeMode> {
  const override = process.env.COMMONS_DESKTOP_START_MODE;
  if (override === "cloud" || override === "private-local") return override;
  try {
    const saved = JSON.parse(readFileSync(startupModePath(), "utf8")) as { mode?: string };
    if (saved.mode === "cloud" || saved.mode === "private-local") return saved.mode;
  } catch {
    // A fresh desktop install follows the web experience. Private Local is a
    // normal mode toggle after sign-in, not a separate onboarding path.
  }
  const mode = "cloud" as const;
  rememberStartupMode(mode);
  return mode;
}

function preload(name: "preload-cloud" | "preload-local") {
  return join(__dirname, `${name}.cjs`);
}

function desktopInfo(mode: "cloud" | "private-local") {
  return {
    desktopVersion: app.getVersion(),
    protocolVersion: DESKTOP_PROTOCOL_VERSION,
    platform: process.platform,
    mode,
    capabilities: [...capabilities],
  };
}

function installEditableContextMenu(webContents: Electron.WebContents) {
  webContents.on("context-menu", (_event, params) => {
    if (!params.isEditable) return;
    const flags = params.editFlags;
    const menu = Menu.buildFromTemplate([
      { role: "undo", enabled: flags.canUndo },
      { role: "redo", enabled: flags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: flags.canCut },
      { role: "copy", enabled: flags.canCopy },
      { role: "paste", enabled: flags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: flags.canSelectAll },
    ]);
    menu.popup({ window: BrowserWindow.fromWebContents(webContents) ?? undefined });
  });
}

function allowedCloudNavigation(raw: string) {
  try {
    const url = new URL(raw);
    return url.origin === CLOUD_ORIGIN || url.origin === AUTH_ORIGIN || url.hostname === "accounts.google.com";
  } catch {
    return false;
  }
}

function handleCloudNavigation(event: Electron.Event, url: string) {
  try {
    const destination = new URL(url);
    if (
      destination.origin === CLOUD_ORIGIN &&
      (destination.pathname === "/login" ||
        destination.pathname === "/api/auth/native/start")
    ) {
      event.preventDefault();
      void beginCloudSignIn();
      return;
    }
  } catch {
    // Fall through to the normal navigation policy.
  }
  if (!allowedCloudNavigation(url)) {
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  }
}

async function showCloudAuthStatus(code: string, error?: string) {
  if (!cloudWindow || cloudWindow.isDestroyed()) return;
  const url = new URL("/desktop/auth", CLOUD_ORIGIN);
  if (code) url.searchParams.set("code", code);
  if (error) url.searchParams.set("error", error);
  await cloudWindow.loadURL(url.toString());
}

async function beginCloudSignIn() {
  const attempt = ++cloudAuthAttempt;
  if (!cloudWindow || cloudWindow.isDestroyed()) return;
  try {
    const response = await fetch(`${AUTH_ORIGIN}/api/auth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: DESKTOP_AUTH_CLIENT_ID,
        scope: DESKTOP_AUTH_SCOPES,
      }),
    });
    const device = await responseJson<DeviceCodeResponse>(response);
    if (!response.ok || !device.device_code || !device.user_code) {
      throw new Error(
        device.error_description ??
          device.error ??
          `Could not start Commons sign-in (${response.status}).`,
      );
    }

    const verificationUrl = new URL(
      device.verification_uri_complete ??
        `${device.verification_uri ?? `${AUTH_ORIGIN}/device`}?user_code=${encodeURIComponent(device.user_code)}`,
      AUTH_ORIGIN,
    );
    if (verificationUrl.origin !== new URL(AUTH_ORIGIN).origin) {
      throw new Error("Commons Identity returned an unexpected authorization URL.");
    }
    await showCloudAuthStatus(device.user_code);
    if (attempt !== cloudAuthAttempt) return;
    await shell.openExternal(verificationUrl.toString());

    const deadline = Date.now() + (device.expires_in ?? 600) * 1000;
    let intervalMs = Math.max(device.interval ?? 5, 1) * 1000;
    while (Date.now() < deadline && attempt === cloudAuthAttempt) {
      await delay(intervalMs);
      const tokenResponse = await fetch(`${AUTH_ORIGIN}/api/auth/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
          client_id: DESKTOP_AUTH_CLIENT_ID,
        }),
      });
      const token = await responseJson<DeviceTokenResponse>(tokenResponse);
      if (tokenResponse.ok && token.access_token) {
        if (!cloudWindow || cloudWindow.isDestroyed() || attempt !== cloudAuthAttempt) return;
        const complete = new URL("/desktop/auth/complete", CLOUD_ORIGIN);
        complete.hash = new URLSearchParams({ token: token.access_token }).toString();
        await cloudWindow.loadURL(complete.toString());
        return;
      }
      if (token.error === "authorization_pending") continue;
      if (token.error === "slow_down") {
        intervalMs += 1_000;
        continue;
      }
      throw new Error(
        token.error_description ?? token.error ?? "Commons sign-in was not approved.",
      );
    }
    if (attempt === cloudAuthAttempt) {
      throw new Error("The sign-in request expired before it was approved.");
    }
  } catch (error) {
    if (attempt !== cloudAuthAttempt) return;
    await showCloudAuthStatus(
      "",
      error instanceof Error ? error.message : "Commons sign-in failed.",
    );
  }
}

async function loadCloudEntry(cloudSession: Electron.Session) {
  try {
    const response = await cloudSession.fetch(`${CLOUD_ORIGIN}/api/auth/session`, {
      cache: "no-store",
    });
    const current = (await response.json()) as { user?: { id?: string } };
    if (response.ok && current.user?.id) {
      await cloudWindow?.loadURL(CLOUD_URL);
      return;
    }
  } catch {
    // The sign-in screen below reports identity or connectivity failures.
  }
  await beginCloudSignIn();
}

async function switchToLocal() {
  if (activeMode === "cloud") await syncCloudAgentsToLocal();
  activeMode = "private-local";
  rememberStartupMode(activeMode);
  await createLocalWindow();
  const previous = cloudWindow;
  // Let the originating cloud IPC resolve before its renderer is closed.
  setTimeout(() => previous?.close(), 100);
}

async function syncCloudAgentsToLocal() {
  try {
    const cloudSession = session.fromPartition("persist:commons-cloud");
    const response = await cloudSession.fetch(`${CLOUD_ORIGIN}/api/agents`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { data?: unknown } | unknown[];
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : [];
    runtime.syncCloudAgents(
      rows.flatMap((row) => {
        if (!row || typeof row !== "object") return [];
        const value = row as Record<string, unknown>;
        const agentId = String(value.agentId ?? value.agent_id ?? value.id ?? "");
        const name = String(value.name ?? "");
        if (!agentId || !name) return [];
        return [{
          agentId,
          name,
          instructions: typeof value.instructions === "string" ? value.instructions : undefined,
          description: typeof value.description === "string" ? value.description : undefined,
          persona: typeof value.persona === "string" ? value.persona : undefined,
        }];
      }),
    );
  } catch {
    // Local mode always remains usable with its encrypted starter agent. A
    // cloud sync is opportunistic and never makes local startup depend on it.
  }
}

function switchToCloud() {
  activeMode = "cloud";
  rememberStartupMode(activeMode);
  createCloudWindow();
  const previous = localWindow;
  setTimeout(() => previous?.close(), 0);
}

function installApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: "Workspace",
      submenu: [
        { label: "Commons Cloud", accelerator: "CmdOrCtrl+1", click: () => switchToCloud() },
        { label: "Keep everything local", accelerator: "CmdOrCtrl+2", click: () => void switchToLocal() },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]));
}

function createCloudWindow() {
  if (cloudWindow && !cloudWindow.isDestroyed()) {
    cloudWindow.show();
    cloudWindow.focus();
    return cloudWindow;
  }
  const partition = "persist:commons-cloud";
  const cloudSession = session.fromPartition(partition);
  cloudSession.setPermissionRequestHandler((webContents, permission, callback) => {
    try {
      const origin = new URL(webContents.getURL()).origin;
      callback(origin === CLOUD_ORIGIN && ["media", "clipboard-sanitized-write", "notifications"].includes(permission));
    } catch {
      callback(false);
    }
  });
  cloudWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: "Agent Commons",
    show: false,
    webPreferences: {
      preload: preload("preload-cloud"),
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  cloudWindow.once("ready-to-show", () => cloudWindow?.show());
  installEditableContextMenu(cloudWindow.webContents);
  cloudWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  cloudWindow.webContents.on("will-navigate", handleCloudNavigation);
  cloudWindow.webContents.on("will-redirect", handleCloudNavigation);
  cloudWindow.on("closed", () => {
    cloudAuthAttempt += 1;
    cloudWindow = null;
  });
  void loadCloudEntry(cloudSession);
  return cloudWindow;
}

async function createLocalWindow() {
  if (localWindow && !localWindow.isDestroyed()) {
    localWindow.show();
    localWindow.focus();
    return localWindow;
  }
  const partition = "persist:commons-private-local";
  const developmentUrl = process.env.COMMONS_DESKTOP_DEV_URL;
  const localSession = session.fromPartition(partition);
  localSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  localSession.webRequest.onBeforeRequest((details, callback) => {
    if (!/^(?:https?|wss?):/i.test(details.url)) return callback({ cancel: false });
    if (developmentUrl) {
      const request = new URL(details.url);
      const development = new URL(developmentUrl);
      if (request.hostname === development.hostname && request.port === development.port) {
        return callback({ cancel: false });
      }
    }
    callback({ cancel: true });
  });
  localWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: "Agent Commons — Private Local",
    show: false,
    backgroundColor: "#f5f3ee",
    webPreferences: {
      preload: preload("preload-local"),
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  localWindow.once("ready-to-show", () => localWindow?.show());
  installEditableContextMenu(localWindow.webContents);
  localWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  localWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  localWindow.on("closed", () => {
    runtime.setTarget(undefined);
    localWindow = null;
  });
  runtime.setTarget(localWindow.webContents);
  if (developmentUrl) await localWindow.loadURL(developmentUrl);
  else await localWindow.loadFile(join(__dirname, "..", "renderer-dist", "index.html"));
  if (process.env.COMMONS_DESKTOP_TEXT_INPUT_SMOKE === "1") {
    void runTextInputSmoke(localWindow);
  } else if (process.env.COMMONS_DESKTOP_SKIP_MODEL_PREP !== "1") {
    void runtime.prepare().catch(() => undefined);
  }
  return localWindow;
}

async function runTextInputSmoke(window: BrowserWindow) {
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const available = await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('textarea[aria-label="Message your agent"]'))`,
      );
      if (available) break;
      await delay(100);
    }
    window.show();
    window.focus();
    window.webContents.focus();
    await delay(500);
    await window.webContents.executeJavaScript(
      `document.querySelector('textarea[aria-label="Message your agent"]')?.focus()`,
    );
    await delay(100);
    for (const character of "Windows typing ") {
      window.webContents.sendInputEvent({ type: "char", keyCode: character });
    }
    clipboard.writeText("and paste work");
    window.webContents.paste();
    await delay(250);
    const compositionResult = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('textarea[aria-label="Message your agent"]');
      if (!(input instanceof HTMLTextAreaElement)) return { error: "composer missing" };
      const beforeComposition = input.value;
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "文" }));
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", isComposing: true }));
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "文" }));
      const shiftEnterAllowed = input.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        shiftKey: true,
      }));
      return {
        value: input.value,
        focused: document.activeElement === input,
        compositionPreserved: input.value === beforeComposition,
        shiftEnterAllowed,
      };
    })()`);
    await window.webContents.insertText("\n");
    await delay(100);
    const result = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('textarea[aria-label="Message your agent"]');
      return input instanceof HTMLTextAreaElement
        ? { value: input.value, focused: document.activeElement === input }
        : { error: "composer missing" };
    })()`);
    const expected = "Windows typing and paste work";
    const passed =
      compositionResult?.value === expected &&
      compositionResult?.focused === true &&
      compositionResult?.compositionPreserved === true &&
      compositionResult?.shiftEnterAllowed === true &&
      result?.value === `${expected}\n` &&
      result?.focused === true;
    console.log(`[desktop-text-input-smoke] ${JSON.stringify({ ...compositionResult, shiftEnterValue: result?.value, passed })}`);
    app.exit(passed ? 0 : 1);
  } catch (error) {
    console.error("[desktop-text-input-smoke]", error);
    app.exit(1);
  }
}

function assertLocalSender(event: IpcMainInvokeEvent) {
  if (!localWindow || event.sender !== localWindow.webContents) throw new Error("Untrusted desktop caller");
}

function assertCloudSender(event: IpcMainInvokeEvent) {
  if (!cloudWindow || event.sender !== cloudWindow.webContents) throw new Error("Untrusted cloud caller");
  const origin = new URL(event.senderFrame?.url ?? event.sender.getURL()).origin;
  // Authentication origins may be allowed to render during login, but only
  // the deployed Commons origin receives desktop capabilities.
  if (origin !== CLOUD_ORIGIN) throw new Error("Untrusted cloud origin");
}

function localHandler<T extends unknown[]>(channel: string, handler: (...args: T) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    assertLocalSender(event);
    return handler(...(args as T));
  });
}

function registerIpc() {
  ipcMain.handle("desktop:get-info", (event, mode: "cloud" | "private-local") => {
    if (mode === "cloud") assertCloudSender(event);
    else assertLocalSender(event);
    return desktopInfo(mode);
  });
  ipcMain.handle("desktop:open-private", (event) => {
    assertCloudSender(event);
    return switchToLocal().then(() => undefined);
  });
  ipcMain.handle("desktop:begin-sign-in", (event) => {
    assertCloudSender(event);
    return beginCloudSignIn();
  });
  ipcMain.handle("desktop:open-cloud", (event) => {
    assertLocalSender(event);
    switchToCloud();
  });

  localHandler("local:get-state", () => runtime.state());
  localHandler("local:get-model-status", () => runtime.modelStatus());
  localHandler("local:choose-workspace", async () => {
    const result = await dialog.showOpenDialog(localWindow!, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  localHandler("local:choose-knowledge-folders", async () => {
    const result = await dialog.showOpenDialog(localWindow!, { properties: ["openDirectory", "multiSelections"] });
    return result.canceled ? [] : result.filePaths;
  });
  localHandler("local:choose-knowledge-files", async () => {
    const result = await dialog.showOpenDialog(localWindow!, { properties: ["openFile", "multiSelections"] });
    return result.canceled ? [] : result.filePaths;
  });
  localHandler<[AgentInput]>("local:save-agent", (input) => runtime.saveAgent(input));
  localHandler<[string]>("local:delete-agent", (id) => runtime.deleteAgent(id));
  localHandler<[ChatRequest]>("local:send-message", (input) => runtime.sendMessage(input));
  localHandler<[string, boolean]>("local:approve", (id, allow) => runtime.resolveApproval(id, allow));
  localHandler<[string, string[]]>("local:add-space", (name, folders) => runtime.addKnowledgeSpace(name, folders));
  localHandler<[string]>("local:reindex-space", (id) => runtime.reindexKnowledgeSpace(id));
  localHandler<[string]>("local:remove-space", (id) => runtime.removeKnowledgeSpace(id));
  localHandler<[TaskInput]>("local:save-task", (input) => runtime.saveTask(input));
  localHandler<[string]>("local:run-task", (id) => runtime.runTask(id));
  localHandler<[string]>("local:delete-task", (id) => runtime.deleteTask(id));
  localHandler<[WorkflowInput]>("local:save-workflow", (input) => runtime.saveWorkflow(input));
  localHandler<[string]>("local:run-workflow", (id) => runtime.runWorkflow(id));
  localHandler<[string]>("local:delete-workflow", (id) => runtime.deleteWorkflow(id));
  localHandler<[AppInput]>("local:save-app", (input) => runtime.saveApp(input));
  localHandler<[string]>("local:start-app", (id) => runtime.startApp(id));
  localHandler<[string]>("local:stop-app", (id) => runtime.stopApp(id));
  localHandler<[string]>("local:delete-app", (id) => runtime.deleteApp(id));
  localHandler<[Partial<LocalSettings>]>("local:update-settings", (settings) => runtime.updateSettings(settings));
  localHandler("local:list-models", () => runtime.listModels());
  localHandler<[string]>("local:open-app", (id) => openLocalApp(id));
}

async function openLocalApp(id: string) {
  const localApp = runtime.getApp(id);
  const target = ensureLocalPreview(localApp.previewUrl);
  const partition = `commons-local-app-${localApp.id}`;
  const isolatedSession = session.fromPartition(partition);
  isolatedSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const request = new URL(details.url);
      callback({ cancel: ![target.origin, "devtools://devtools"].includes(request.origin) });
    } catch {
      callback({ cancel: true });
    }
  });
  const appWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    title: localApp.name,
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  installEditableContextMenu(appWindow.webContents);
  appWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  appWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin !== target.origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  await appWindow.loadURL(target.toString());
}

app.whenReady().then(async () => {
  runtime = new PrivateLocalRuntime(app.getPath("userData"));
  registerIpc();
  installApplicationMenu();
  activeMode = await selectStartupMode();
  if (activeMode === "private-local") await switchToLocal();
  else switchToCloud();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (activeMode === "private-local") void createLocalWindow();
      else createCloudWindow();
    }
  });
});

app.on("before-quit", () => runtime?.close());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
