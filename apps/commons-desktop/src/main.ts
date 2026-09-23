import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
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
const AUTH_ORIGIN = process.env.COMMONS_DESKTOP_AUTH_ORIGIN ?? "https://auth.agentcommons.io";
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
    // First launch: ask before making any network request.
  }
  const choice = await dialog.showMessageBox({
    type: "question",
    title: "Choose your Agent Commons workspace",
    message: "How should Agent Commons Desktop start?",
    detail: "Private Local makes no Commons Cloud connection. You can switch modes later from the Workspace menu.",
    buttons: ["Private Local", "Commons Cloud"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  const mode = choice.response === 1 ? "cloud" : "private-local";
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

function allowedCloudNavigation(raw: string) {
  try {
    const url = new URL(raw);
    return url.origin === CLOUD_ORIGIN || url.origin === AUTH_ORIGIN || url.hostname === "accounts.google.com";
  } catch {
    return false;
  }
}

async function switchToLocal() {
  activeMode = "private-local";
  rememberStartupMode(activeMode);
  await createLocalWindow();
  const previous = cloudWindow;
  // Let the originating cloud IPC resolve before its renderer is closed.
  setTimeout(() => previous?.close(), 100);
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
        { label: "Private Local", accelerator: "CmdOrCtrl+2", click: () => void switchToLocal() },
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
    },
  });
  cloudWindow.once("ready-to-show", () => cloudWindow?.show());
  cloudWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  cloudWindow.webContents.on("will-navigate", (event, url) => {
    if (!allowedCloudNavigation(url)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) void shell.openExternal(url);
    }
  });
  cloudWindow.on("closed", () => { cloudWindow = null; });
  void cloudWindow.loadURL(CLOUD_URL);
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
      spellcheck: false,
    },
  });
  localWindow.once("ready-to-show", () => localWindow?.show());
  localWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  localWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  localWindow.on("closed", () => {
    runtime.setTarget(undefined);
    localWindow = null;
  });
  runtime.setTarget(localWindow.webContents);
  if (developmentUrl) await localWindow.loadURL(developmentUrl);
  else await localWindow.loadFile(join(__dirname, "..", "renderer-dist", "index.html"));
  return localWindow;
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
  ipcMain.handle("desktop:open-cloud", (event) => {
    assertLocalSender(event);
    switchToCloud();
  });

  localHandler("local:get-state", () => runtime.state());
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
    },
  });
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
