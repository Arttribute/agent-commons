import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { spawn } from "node:child_process";
import { computerWorkspace, terminalCommand } from "./local-computer";
import { initializeCommandPath } from "./local-command";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
  WebContentsView,
  type IpcMainInvokeEvent,
} from "electron";
import {
  DESKTOP_PROTOCOL_VERSION,
  type AgentInput,
  type AppInput,
  type ChatRequest,
  type CloudAccess,
  type DesktopAccount,
  type LocalSettings,
  type SkillInput,
  type TaskInput,
  type WorkflowInput,
  type WorkspacePreferences,
} from "@agent-commons/desktop-contract";
import { ensureLocalPreview, PrivateLocalRuntime } from "./runtime";
import { buildDirSnapshot, buildLocalToolsManifest, runLocalTool } from "../../../packages/agc-cli/src/local-tools";
import { resolveWorkspaceRoute, workspacePaths } from "../../commons-app/lib/workspace-routes";
import { cloudVisiblePreferences } from "./workspace-preferences";
import { startCommonsAppServer, type CommonsAppServer } from "./commons-app-server";
import { handleLocalKnowledgeApi } from "./local-knowledge-api";
import { handleLocalLibraryApi } from "./local-library-api";
import { handleLocalUiPluginsApi } from "./local-ui-plugins-api";
import { handleLocalSkillsApi } from "./local-skills-api";
import { handleLocalTasksApi } from "./local-tasks-api";
import { handleLocalSessionsApi } from "./local-sessions-api";
import { handleLocalAgentsApi } from "./local-agents-api";
import { handleLocalWorkflowsApi } from "./local-workflows-api";
import { handleLocalToolsApi } from "./local-tools-api";
import { DEFAULT_CLOUD_ACCESS, assertCloudToolAllowed, normalizeCloudAccess } from "./cloud-access-policy.mjs";

const CLOUD_URL = process.env.COMMONS_DESKTOP_CLOUD_URL ?? "https://www.agentcommons.io";
const CLOUD_ORIGIN = new URL(CLOUD_URL).origin;
const AUTH_ORIGIN = (process.env.COMMONS_DESKTOP_AUTH_ORIGIN ?? "https://auth.agentcommons.io").replace(/\/$/, "");
const DESKTOP_AUTH_CLIENT_ID = process.env.COMMONS_DESKTOP_AUTH_CLIENT_ID ?? "commons-desktop";
const DESKTOP_AUTH_SCOPES = [
  "openid", "profile", "email", "offline_access", "activity:read",
  "agents:create", "agents:read", "agents:write", "agents:run",
  "compute:read", "compute:write", "usage:read",
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

let desktopWindow: BrowserWindow | null = null;
let visibleView: WebContentsView | null = null;
let unifiedView: WebContentsView | null = null;
let commonsServer: CommonsAppServer | null = null;
let runtime: PrivateLocalRuntime;
let activeMode: "cloud" | "private-local" = "private-local";
let cloudTransition = false;
let cloudWorkspace: string | null = null;
let cloudAccess: CloudAccess = { ...DEFAULT_CLOUD_ACCESS };
let cloudAuthAttempt = 0;
let cloudAuthController: AbortController | null = null;
let cloudSyncController: AbortController | null = null;
const cloudToolControllers = new Set<AbortController>();
const cloudToolNames = new Set([
  "list_directory", "read_file", "write_file", "search_files", "disk_usage", "run_command",
  "start_process", "wait_for_process", "process_status", "kill_process", "list_processes",
]);

function pathContains(parent: string, child: string) {
  const offset = relative(parent, child);
  return offset === "" || (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
}

function assertCloudWorkspacePrivacy(selected: string) {
  const privateRoot = join(realpathSync(app.getPath("userData")), "private-local");
  if (pathContains(selected, privateRoot) || pathContains(privateRoot, selected)) {
    throw new Error("Choose a project folder outside the Private Local data directory so local conversations and settings stay private.");
  }
}

function cloudAccessPath() { return join(app.getPath("userData"), "cloud-access.json"); }

function loadCloudAccess() {
  if (!existsSync(cloudAccessPath())) return;
  try {
    const saved = JSON.parse(readFileSync(cloudAccessPath(), "utf8")) as { access?: CloudAccess; workspace?: string };
    cloudAccess = normalizeCloudAccess(saved.access);
    if (saved.workspace && statSync(saved.workspace).isDirectory()) {
      const selected = realpathSync(saved.workspace);
      assertCloudWorkspacePrivacy(selected);
      cloudWorkspace = selected;
    }
  } catch {
    cloudWorkspace = null;
    cloudAccess = { ...DEFAULT_CLOUD_ACCESS };
  }
}

function saveCloudAccess() {
  const path = cloudAccessPath();
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ access: cloudAccess, workspace: cloudWorkspace })}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

const MAX_TRANSFER_BYTES = 20_000_000;

async function readTransfer(response: Response) {
  if (!response.ok || !response.body) throw new Error("Could not download the Cloud Library file.");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_TRANSFER_BYTES) throw new Error("Library transfers are limited to 20 MB per file.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_TRANSFER_BYTES) {
      await reader.cancel();
      throw new Error("Library transfers are limited to 20 MB per file.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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
    // New installs begin with the normal Commons sign-in.
  }
  const mode = "cloud" as const;
  rememberStartupMode(mode);
  return mode;
}

function preload(name: "preload-unified") {
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
    Menu.buildFromTemplate([
      { role: "undo", enabled: flags.canUndo },
      { role: "redo", enabled: flags.canRedo },
      { type: "separator" },
      { role: "cut", enabled: flags.canCut },
      { role: "copy", enabled: flags.canCopy },
      { role: "paste", enabled: flags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: flags.canSelectAll },
    ]).popup({ window: desktopWindow ?? undefined });
  });
}

async function showCloudAuthStatus(code: string, error?: string) {
  if (!unifiedView || unifiedView.webContents.isDestroyed()) return;
  const url = new URL("/desktop/auth", commonsServer?.origin ?? CLOUD_ORIGIN);
  if (code) url.searchParams.set("code", code);
  if (error) url.searchParams.set("error", error);
  await unifiedView.webContents.loadURL(url.toString());
}

async function beginCloudSignIn() {
  const attempt = ++cloudAuthAttempt;
  if (!unifiedView || unifiedView.webContents.isDestroyed()) return;
  cloudAuthController?.abort();
  const controller = new AbortController();
  cloudAuthController = controller;
  try {
    const response = await fetch(`${AUTH_ORIGIN}/api/auth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ client_id: DESKTOP_AUTH_CLIENT_ID, scope: DESKTOP_AUTH_SCOPES }),
    });
    const device = await responseJson<DeviceCodeResponse>(response);
    if (!response.ok || !device.device_code || !device.user_code) {
      throw new Error(device.error_description ?? device.error ?? `Could not start Commons sign-in (${response.status}).`);
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
        signal: controller.signal,
        body: JSON.stringify({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          device_code: device.device_code,
          client_id: DESKTOP_AUTH_CLIENT_ID,
        }),
      });
      const token = await responseJson<DeviceTokenResponse>(tokenResponse);
      if (tokenResponse.ok && token.access_token) {
        if (!unifiedView || unifiedView.webContents.isDestroyed() || attempt !== cloudAuthAttempt) return;
        const complete = new URL("/desktop/auth/complete", commonsServer?.origin ?? CLOUD_ORIGIN);
        complete.hash = new URLSearchParams({ token: token.access_token }).toString();
        await unifiedView.webContents.loadURL(complete.toString());
        return;
      }
      if (token.error === "authorization_pending") continue;
      if (token.error === "slow_down") { intervalMs += 1_000; continue; }
      throw new Error(token.error_description ?? token.error ?? "Commons sign-in was not approved.");
    }
    if (attempt === cloudAuthAttempt) throw new Error("The sign-in request expired before it was approved.");
  } catch (error) {
    if (attempt !== cloudAuthAttempt) return;
    await showCloudAuthStatus("", error instanceof Error ? error.message : "Commons sign-in failed.");
  } finally {
    if (cloudAuthController === controller) cloudAuthController = null;
  }
}

async function loadCloudEntry(cloudSession: Electron.Session, path?: string) {
  const appOrigin = commonsServer?.origin ?? CLOUD_ORIGIN;
  try {
    const response = await cloudSession.fetch(`${appOrigin}/api/auth/session`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const current = (await response.json()) as { user?: { id?: string } };
    if (response.ok && current.user?.id) {
      await unifiedView?.webContents.loadURL(path ? new URL(path, appOrigin).toString() : appOrigin);
      void syncCloudAgentsToLocal();
      return;
    }
  } catch {
    // The sign-in screen reports identity and connection failures.
  }
  await showCloudAuthStatus("");
  void beginCloudSignIn();
}

function sectionPath(path?: string) {
  if (!path?.startsWith("/") || path.startsWith("//")) return undefined;
  const route = resolveWorkspaceRoute(path);
  return workspacePaths[route.section];
}

async function switchToLocal(path?: string) {
  const previousMode = activeMode;
  cloudAuthAttempt += 1;
  cloudAuthController?.abort();
  cloudSyncController?.abort();
  for (const controller of cloudToolControllers) controller.abort();
  activeMode = "private-local";
  try {
    await session.fromPartition("persist:commons-unified").cookies.set({
      url: commonsServer!.origin,
      name: "commons-desktop-mode",
      value: "private-local",
      sameSite: "strict",
    });
    rememberStartupMode(activeMode);
    unifiedView!.webContents.send("desktop:mode-changed", activeMode, sectionPath(path));
    if (process.env.COMMONS_DESKTOP_SMOKE_DEBUG !== "1") void runtime.prepareLocalModel().catch(() => undefined);
  } catch (error) {
    activeMode = previousMode;
    throw error;
  }
}

async function syncCloudAgentsToLocal() {
  cloudSyncController?.abort();
  const controller = new AbortController();
  cloudSyncController = controller;
  try {
    const cloudSession = session.fromPartition("persist:commons-unified");
    const response = await cloudSession.fetch(`${commonsServer?.origin ?? CLOUD_ORIGIN}/api/agents`, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { data?: unknown } | unknown[];
    const rows = Array.isArray(payload) ? payload :
      Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : [];
    const snapshots = rows.flatMap((row) => {
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
        isDefault: value.isDefault === true,
        avatarUrl: typeof value.avatar === "string" ? value.avatar : undefined,
      }];
    });
    const agents = await Promise.all(snapshots.map(async (snapshot) => ({
      ...snapshot,
      avatar: await cacheCloudAgentAvatar(cloudSession, snapshot.avatarUrl, controller.signal),
    })));
    if (!controller.signal.aborted) runtime.syncCloudAgents(agents);
  } catch {
    // Local mode remains usable from its on-disk state when offline.
  } finally {
    if (cloudSyncController === controller) cloudSyncController = null;
  }
}

const MAX_AGENT_AVATAR_BYTES = 1_000_000;
const AGENT_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

async function cacheCloudAgentAvatar(cloudSession: Electron.Session, source: string | undefined, signal: AbortSignal) {
  if (!source) return "";
  if (source.startsWith("data:")) {
    const match = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([a-z0-9+/=]+)$/i.exec(source);
    return match && AGENT_AVATAR_TYPES.has(match[1].toLowerCase()) && match[2].length < MAX_AGENT_AVATAR_BYTES * 1.4
      ? source : undefined;
  }
  try {
    const trustedOrigin = commonsServer?.origin ?? CLOUD_ORIGIN;
    const url = new URL(source, trustedOrigin);
    if (url.protocol !== "https:" && url.origin !== trustedOrigin) return undefined;
    const response = await cloudSession.fetch(url.toString(), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]),
      cache: "no-store",
    });
    if (!response.ok || !response.body) return undefined;
    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!AGENT_AVATAR_TYPES.has(mime)) return undefined;
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > MAX_AGENT_AVATAR_BYTES) return undefined;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AGENT_AVATAR_BYTES) {
        await reader.cancel();
        return undefined;
      }
      chunks.push(value);
    }
    return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
  } catch {
    return undefined;
  }
}

async function switchToCloud(path?: string) {
  if (cloudTransition) return;
  cloudTransition = true;
  try {
    runtime.cancelPendingApprovals();
    activeMode = "cloud";
    await session.fromPartition("persist:commons-unified").cookies.set({
      url: commonsServer!.origin,
      name: "commons-desktop-mode",
      value: "cloud",
      sameSite: "strict",
    });
    rememberStartupMode(activeMode);
    unifiedView!.webContents.send("desktop:mode-changed", activeMode, sectionPath(path));
  } finally {
    cloudTransition = false;
  }
}

function installApplicationMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]));
}

function ensureDesktopWindow() {
  if (desktopWindow && !desktopWindow.isDestroyed()) return desktopWindow;
  desktopWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    title: "Agent Commons",
    show: false,
    backgroundColor: "#fcfcfb",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  desktopWindow.on("resize", sizeViews);
  desktopWindow.on("closed", () => {
    runtime.setTarget(undefined);
    unifiedView?.webContents.close();
    unifiedView = null;
    visibleView = null;
    desktopWindow = null;
  });
  return desktopWindow;
}

function sizeViews() {
  if (!desktopWindow || desktopWindow.isDestroyed()) return;
  const { width, height } = desktopWindow.getContentBounds();
  unifiedView?.setBounds({ x: 0, y: 0, width, height });
}

async function createUnifiedView(path?: string) {
  if (unifiedView && !unifiedView.webContents.isDestroyed()) return unifiedView;
  const resources = app.isPackaged ? process.resourcesPath : join(__dirname, "..");
  commonsServer ??= await startCommonsAppServer(resources, app.getPath("userData"));
  ensureDesktopWindow();
  const partition = "persist:commons-unified";
  const unifiedSession = session.fromPartition(partition);
  await unifiedSession.cookies.set({
    url: commonsServer.origin,
    name: "commons-desktop-mode",
    value: activeMode,
    sameSite: "strict",
  });
  unifiedSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(activeMode === "cloud" && ["media", "clipboard-sanitized-write", "notifications"].includes(permission));
  });
  unifiedSession.webRequest.onBeforeRequest((details, callback) => {
    if (activeMode !== "private-local" || !/^(?:https?|wss?):/i.test(details.url)) {
      callback({ cancel: false });
      return;
    }
    try {
      const requested = new URL(details.url);
      if (requested.protocol === "ws:") requested.protocol = "http:";
      if (requested.protocol === "wss:") requested.protocol = "https:";
      const allowed = requested.origin === commonsServer?.origin || runtime.state().apps.some((localApp) => {
        try { return localApp.status === "running" && new URL(localApp.previewUrl).origin === requested.origin; }
        catch { return false; }
      });
      callback({ cancel: !allowed });
    } catch {
      callback({ cancel: true });
    }
  });
  unifiedView = new WebContentsView({
    webPreferences: {
      preload: preload("preload-unified"),
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  runtime.setTarget(unifiedView.webContents);
  installEditableContextMenu(unifiedView.webContents);
  unifiedView.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  unifiedView.webContents.on("will-navigate", (event, raw) => {
    try {
      if (new URL(raw).origin === commonsServer?.origin) return;
    } catch {
      // Invalid navigation is not a Commons route.
    }
    event.preventDefault();
    if (/^https?:/i.test(raw)) void shell.openExternal(raw);
  });
  await unifiedView.webContents.loadURL(new URL(
    activeMode === "cloud" ? "/desktop/auth" : sectionPath(path) ?? "/studio/agents",
    commonsServer.origin,
  ).toString());
  if (activeMode === "cloud") void loadCloudEntry(unifiedSession, path);
  return unifiedView;
}

function showView(view: WebContentsView) {
  const window = ensureDesktopWindow();
  if (visibleView !== view) {
    if (visibleView) window.contentView.removeChildView(visibleView);
    window.contentView.addChildView(view);
    visibleView = view;
    sizeViews();
  }
  window.show();
  window.focus();
}

function assertLocalOrigin(event: IpcMainInvokeEvent) {
  if (!unifiedView || event.sender !== unifiedView.webContents) throw new Error("Untrusted desktop caller");
  if (new URL(event.senderFrame?.url ?? event.sender.getURL()).origin !== commonsServer?.origin) {
    throw new Error("Untrusted desktop origin");
  }
}

function assertLocalSender(event: IpcMainInvokeEvent) {
  assertLocalOrigin(event);
  if (activeMode !== "private-local") throw new Error("Local capabilities are unavailable in Cloud mode");
}

function assertCloudOrigin(event: IpcMainInvokeEvent) {
  if (!unifiedView || event.sender !== unifiedView.webContents) throw new Error("Untrusted cloud caller");
  const origin = new URL(event.senderFrame?.url ?? event.sender.getURL()).origin;
  if (origin !== commonsServer?.origin) throw new Error("Untrusted cloud origin");
}

function assertCloudSender(event: IpcMainInvokeEvent) {
  assertCloudOrigin(event);
  if (activeMode !== "cloud" && !cloudTransition) throw new Error("Cloud capabilities are unavailable in Local mode");
}

function localHandler<T extends unknown[]>(channel: string, handler: (...args: T) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    assertLocalSender(event);
    return handler(...(args as T));
  });
}

function registerIpc() {
  const cloudPreferences = () => cloudVisiblePreferences(runtime.preferences());
  localHandler("local:api-request", async (request: { path: string; method: string; body?: unknown }) => {
    if (!request || typeof request.path !== "string" || !request.path.startsWith("/api/") || request.path.length > 2_048) {
      throw new Error("Invalid Local API route");
    }
    const url = new URL(request.path, "http://localhost");
    const method = String(request.method ?? "GET").toUpperCase();
    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    if (url.pathname === "/api/knowledge" || url.pathname.startsWith("/api/knowledge/")) {
      return handleLocalKnowledgeApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/library" || url.pathname.startsWith("/api/library/") || url.pathname === "/api/files/upload") {
      return handleLocalLibraryApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/ui-plugins" || url.pathname.startsWith("/api/ui-plugins/")) {
      return handleLocalUiPluginsApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/skills" || url.pathname.startsWith("/api/skills/")) {
      return handleLocalSkillsApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/tasks" || url.pathname.startsWith("/api/tasks/")) {
      return handleLocalTasksApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/")) {
      return handleLocalSessionsApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/agents" || url.pathname.startsWith("/api/agents/")) {
      return handleLocalAgentsApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/workflows" || url.pathname.startsWith("/api/workflows/")) {
      return handleLocalWorkflowsApi(runtime, url, method, body);
    }
    if (url.pathname === "/api/tools/catalog") {
      return handleLocalToolsApi(runtime, url, method);
    }
    return { status: 404, body: { message: "This Local workspace operation is not available yet." } };
  });
  localHandler("local:open-library-item", async (id: string) => {
    const item = runtime.state().library?.find((entry) => entry.id === id);
    if (!item) throw new Error("Local artifact not found");
    const error = await shell.openPath(item.path);
    if (error) throw new Error(error);
  });
  localHandler("local:get-storage-root", () => runtime.storageRoot());
  localHandler("local:open-storage-root", async () => {
    const error = await shell.openPath(runtime.storageRoot());
    if (error) throw new Error(error);
  });
  const syncPreferences = (incoming: WorkspacePreferences, source: "cloud" | "private-local") => {
    const preferences = runtime.syncPreferences(incoming, source);
    if (unifiedView && !unifiedView.webContents.isDestroyed()) {
      unifiedView.webContents.send("desktop:preferences-changed", activeMode === "cloud" ? cloudPreferences() : preferences);
    }
    return source === "cloud" ? cloudPreferences() : preferences;
  };
  ipcMain.handle("desktop:get-info", (event, mode: "cloud" | "private-local") => {
    if (mode === "cloud") assertCloudOrigin(event);
    else assertLocalOrigin(event);
    return desktopInfo(activeMode);
  });
  ipcMain.handle("desktop:open-private", (event, path?: string) => {
    assertCloudSender(event);
    return switchToLocal(path).then(() => undefined);
  });
  ipcMain.handle("desktop:begin-sign-in", (event) => {
    assertCloudSender(event);
    return beginCloudSignIn();
  });
  ipcMain.handle("desktop:open-cloud", (event, path?: string) => {
    assertLocalSender(event);
    return switchToCloud(path);
  });
  ipcMain.handle("cloud:get-workspace", (event) => {
    assertCloudSender(event);
    return cloudWorkspace;
  });
  ipcMain.handle("cloud:choose-workspace", async (event) => {
    assertCloudSender(event);
    const result = await dialog.showOpenDialog(desktopWindow!, { properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || !result.filePaths[0]) return cloudWorkspace;
    const selected = realpathSync(result.filePaths[0]);
    if (!statSync(selected).isDirectory()) throw new Error("Choose a directory");
    assertCloudWorkspacePrivacy(selected);
    cloudWorkspace = selected;
    saveCloudAccess();
    return cloudWorkspace;
  });
  ipcMain.handle("cloud:get-access", (event) => {
    assertCloudSender(event);
    return cloudAccess;
  });
  ipcMain.handle("cloud:update-access", async (event, access: CloudAccess) => {
    assertCloudSender(event);
    const next = normalizeCloudAccess(access);
    const enabled = (Object.keys(next) as Array<keyof CloudAccess>).filter((key) => next[key] && !cloudAccess[key]);
    if (enabled.length) {
      const choice = await dialog.showMessageBox(desktopWindow!, {
        type: "warning", title: "Allow Cloud access to this computer?",
        message: enabled.includes("runCommands") ? "Enable full computer commands in Cloud mode?" : "Enable more Cloud file access?",
        detail: enabled.includes("runCommands")
          ? "Approved commands can reach any file and the network using your computer account, including Private Local data. Each command still asks for approval."
          : "The selected folder's permitted file contents can be sent to Commons Cloud by agents. Private Local data remains outside the selected folder.",
        buttons: ["Cancel", "Enable access"], defaultId: 0, cancelId: 0, noLink: true,
      });
      if (choice.response !== 1 || activeMode !== "cloud") return cloudAccess;
    }
    cloudAccess = next;
    for (const controller of cloudToolControllers) controller.abort();
    saveCloudAccess();
    return cloudAccess;
  });
  ipcMain.handle("cloud:import-library-to-local", async (event, itemId: string, name: string, mimeType: string) => {
    assertCloudSender(event);
    if (typeof itemId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(itemId)) throw new Error("Invalid Cloud Library item.");
    if (typeof name !== "string" || name.length > 255 || typeof mimeType !== "string" || mimeType.length > 120) throw new Error("Invalid Library file metadata.");
    const cloudSession = session.fromPartition("persist:commons-unified");
    const response = await cloudSession.fetch(`${commonsServer!.origin}/api/library/${encodeURIComponent(itemId)}/download`, {
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Could not get a Cloud Library download link.");
    const payload = await response.json() as { url?: string };
    if (!payload.url) throw new Error("The Cloud Library item has no downloadable file.");
    const source = new URL(payload.url);
    if (source.protocol !== "https:") throw new Error("The Cloud Library download must use HTTPS.");
    const bytes = await readTransfer(await cloudSession.fetch(source.toString(), { redirect: "error", signal: AbortSignal.timeout(60_000) }));
    if (activeMode !== "cloud") throw new Error("The mode changed before the transfer completed.");
    runtime.importLibraryFiles([{ name, mimeType, bytes }]);
  });
  ipcMain.handle("cloud:list-local-transfer-items", async (event) => {
    assertCloudSender(event);
    const choice = await dialog.showMessageBox(desktopWindow!, {
      type: "question", title: "Show Local files in Cloud mode?",
      message: "Show Local Library file names so you can choose one to copy to Cloud?",
      detail: "Only file names appear in the Cloud view. File contents require a separate confirmation before upload.",
      buttons: ["Cancel", "Show files"], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice.response !== 1 || activeMode !== "cloud") return [];
    const root = realpathSync(runtime.storageRoot());
    return (runtime.state().library ?? []).flatMap((item) => {
      try {
        const path = realpathSync(item.path);
        if (!pathContains(root, path) || statSync(path).size > MAX_TRANSFER_BYTES) return [];
        return [{ id: item.id, name: item.name, mimeType: item.mimeType }];
      } catch { return []; }
    });
  });
  ipcMain.handle("cloud:read-local-transfer-item", async (event, id: string) => {
    assertCloudSender(event);
    const item = runtime.state().library?.find((entry) => entry.id === id);
    if (!item) throw new Error("Local Library item not found.");
    const root = realpathSync(runtime.storageRoot());
    const path = realpathSync(item.path);
    if (!pathContains(root, path) || statSync(path).size > MAX_TRANSFER_BYTES) throw new Error("Only Local Library files up to 20 MB can be transferred.");
    const choice = await dialog.showMessageBox(desktopWindow!, {
      type: "warning", title: "Send Local file to Commons Cloud?",
      message: `Upload ${item.name} to your Commons Cloud Library?`,
      detail: "This copies the selected Private Local file into your Cloud account. Other Local files stay on this computer.",
      buttons: ["Cancel", "Send to Cloud"], defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice.response !== 1 || activeMode !== "cloud") throw new Error("Transfer cancelled.");
    return { name: item.name, mimeType: item.mimeType, bytes: readFileSync(path) };
  });
  ipcMain.handle("cloud:get-tool-context", (event) => {
    assertCloudSender(event);
    if (!cloudWorkspace || (!cloudAccess.readFiles && !cloudAccess.writeFiles && !cloudAccess.runCommands)) return null;
    assertCloudWorkspacePrivacy(cloudWorkspace);
    const access = `Cloud desktop permissions: file reading ${cloudAccess.readFiles ? "on" : "off"}; file editing ${cloudAccess.writeFiles ? "on" : "off"}; full computer commands ${cloudAccess.runCommands ? "on, with approval for each command" : "off"}. Only use permitted tools. File tools stay inside the selected workspace. Command tools, when enabled, can access other files on this computer.`;
    return cloudAccess.runCommands
      ? `${buildLocalToolsManifest(cloudWorkspace, cloudAccess.readFiles ? buildDirSnapshot(cloudWorkspace, 2) : "(file reading disabled)")}\n${access}`
      : `## Desktop workspace tools\nWorkspace: ${cloudWorkspace}\n${access}\nAvailable: ${[cloudAccess.readFiles && "cli_list_directory, cli_read_file, cli_search_files, cli_disk_usage", cloudAccess.writeFiles && "cli_write_file"].filter(Boolean).join(", ")}.\n${cloudAccess.readFiles ? buildDirSnapshot(cloudWorkspace, 2) : ""}`;
  });
  ipcMain.handle("cloud:run-tool", async (event, request: { tool: string; args: Record<string, unknown>; sessionId?: string }) => {
    assertCloudSender(event);
    if (activeMode !== "cloud") throw new Error("Cloud tools are unavailable while switching modes");
    if (!cloudWorkspace) throw new Error("Choose a local workspace first");
    assertCloudWorkspacePrivacy(cloudWorkspace);
    const tool = request?.tool?.replace(/^cli_/, "");
    if (!tool || !cloudToolNames.has(tool)) throw new Error("Unsupported local tool");
    assertCloudToolAllowed(tool, cloudAccess);
    if (!request.args || typeof request.args !== "object" || Array.isArray(request.args)) throw new Error("Invalid tool arguments");
    const controller = new AbortController();
    cloudToolControllers.add(controller);
    try {
      return await runLocalTool({ tool, args: request.args }, {
        rootDir: cloudWorkspace,
        sessionId: request.sessionId ?? "cloud-desktop",
        permissions: new Map(),
        signal: controller.signal,
        appendLog: () => undefined,
        confirm: async (summary, permission) => {
          if (!desktopWindow || desktopWindow.isDestroyed() || controller.signal.aborted || activeMode !== "cloud") return false;
          const isCommand = permission === "run_command" || permission === "start_process";
          const result = await dialog.showMessageBox(desktopWindow, {
            type: "warning", title: "Allow local agent action?",
            message: `Allow ${permission.replaceAll("_", " ")} in ${cloudWorkspace}?`,
            detail: [
              summary.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 12_000),
              isCommand ? "Full computer command access is enabled. This command can read outside the selected project, including Private Local files, and its output may be sent to Commons Cloud." : "",
            ].filter(Boolean).join("\n\n"),
            buttons: ["Decline", "Allow once"], defaultId: 0, cancelId: 0, noLink: true,
          });
          return result.response === 1 && !controller.signal.aborted && activeMode === "cloud";
        },
      });
    } finally {
      cloudToolControllers.delete(controller);
    }
  });
  ipcMain.handle("cloud:sync-account", (event, account: DesktopAccount) => {
    assertCloudSender(event);
    runtime.syncAccount(account);
  });
  ipcMain.handle("cloud:get-preferences", (event) => { assertCloudSender(event); return cloudPreferences(); });
  ipcMain.handle("cloud:sync-preferences", (event, incoming: WorkspacePreferences) => { assertCloudSender(event); return syncPreferences(incoming, "cloud"); });

  localHandler("local:get-state", () => runtime.state());
  localHandler<[{ agentId: string; conversationId?: string; target: "files" | "terminal" }]>("local:open-computer", async (input) => {
    const path = computerWorkspace(runtime.state(), input.agentId, input.conversationId);
    if (input.target === "files") {
      const error = await shell.openPath(path);
      if (error) throw new Error(error);
    } else if (input.target === "terminal") {
      const { command, args } = terminalCommand(process.platform, path);
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { cwd: path, detached: true, stdio: "ignore", shell: false });
        child.once("error", () => reject(new Error("Could not open the system terminal. Open the workspace folder and launch your terminal there.")));
        if (process.platform === "darwin") child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Could not open Terminal.")));
        else child.once("spawn", () => { child.unref(); resolve(); });
      });
    } else throw new Error("Unsupported Local computer window");
  });
  localHandler("local:get-model-status", () => runtime.modelStatus());
  localHandler("local:prepare-model", () => runtime.prepareLocalModel());
  localHandler("local:get-preferences", () => runtime.preferences());
  localHandler<[WorkspacePreferences]>("local:sync-preferences", (incoming) => syncPreferences(incoming, "private-local"));
  localHandler("local:choose-workspace", async () => {
    const result = await dialog.showOpenDialog(desktopWindow!, { properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  localHandler("local:choose-knowledge-folders", async () => {
    const result = await dialog.showOpenDialog(desktopWindow!, { properties: ["openDirectory", "multiSelections"] });
    return result.canceled ? [] : result.filePaths;
  });
  localHandler("local:choose-knowledge-files", async () => {
    const result = await dialog.showOpenDialog(desktopWindow!, { properties: ["openFile", "multiSelections"] });
    return result.canceled ? [] : result.filePaths;
  });
  localHandler<[AgentInput]>("local:save-agent", (input) => runtime.saveAgent(input));
  localHandler<[string]>("local:delete-agent", (id) => runtime.deleteAgent(id));
  localHandler<[ChatRequest]>("local:send-message", (input) => runtime.sendMessage(input));
  localHandler<[string]>("local:delete-conversation", (id) => runtime.deleteConversation(id));
  localHandler<[string, string]>("local:rename-conversation", (id, title) => runtime.renameConversation(id, title));
  localHandler<[string, boolean]>("local:approve", (id, allow) => runtime.resolveApproval(id, allow));
  localHandler<[string, string[]]>("local:add-space", (name, folders) => runtime.addKnowledgeSpace(name, folders));
  localHandler<[string]>("local:reindex-space", (id) => runtime.reindexKnowledgeSpace(id));
  localHandler<[string]>("local:remove-space", (id) => runtime.removeKnowledgeSpace(id));
  localHandler<[SkillInput]>("local:save-skill", (input) => runtime.saveSkill(input));
  localHandler<[string]>("local:delete-skill", (id) => runtime.deleteSkill(id));
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
  localHandler<[string | undefined]>("local:list-models", (url) => runtime.listModels(url));
  localHandler<[string]>("local:open-app", (id) => openLocalApp(id));
  localHandler<[string, string]>("local:open-artifact", async (conversationId, artifactId) => {
    const error = await shell.openPath(runtime.getArtifactPath(conversationId, artifactId));
    if (error) throw new Error(error);
  });
  localHandler<[string, string, boolean]>("local:set-artifact-favorite", (conversationId, artifactId, favorite) => runtime.setArtifactFavorite(conversationId, artifactId, favorite));
  localHandler<[string, string]>("local:remove-artifact-reference", (conversationId, artifactId) => runtime.removeArtifactReference(conversationId, artifactId));
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
  await initializeCommandPath();
  runtime = new PrivateLocalRuntime(app.getPath("userData"));
  loadCloudAccess();
  registerIpc();
  installApplicationMenu();
  activeMode = await selectStartupMode();
  showView(await createUnifiedView());
  if (activeMode === "private-local" && process.env.COMMONS_DESKTOP_SMOKE_DEBUG !== "1") {
    void runtime.prepareLocalModel().catch(() => undefined);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createUnifiedView().then(showView);
    }
  });
}).catch((error) => {
  console.error("Agent Commons desktop startup failed:", error);
  dialog.showErrorBox("Agent Commons could not start", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("before-quit", () => { runtime?.close(); commonsServer?.stop(); });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
