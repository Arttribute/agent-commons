import { contextBridge, ipcRenderer } from "electron";
import type { CloudDesktopBridge, WorkspacePreferences } from "@agent-commons/desktop-contract";

const bridge: CloudDesktopBridge = {
  getInfo: () => ipcRenderer.invoke("desktop:get-info", "cloud"),
  beginSignIn: () => ipcRenderer.invoke("desktop:begin-sign-in"),
  openPrivateWorkspace: (path) => ipcRenderer.invoke("desktop:open-private", path),
  getWorkspace: () => ipcRenderer.invoke("cloud:get-workspace"),
  chooseWorkspace: () => ipcRenderer.invoke("cloud:choose-workspace"),
  getToolContext: () => ipcRenderer.invoke("cloud:get-tool-context"),
  runTool: (request) => ipcRenderer.invoke("cloud:run-tool", request),
  syncAccount: (account) => ipcRenderer.invoke("cloud:sync-account", account),
  getPreferences: () => ipcRenderer.invoke("cloud:get-preferences"),
  syncPreferences: (preferences) => ipcRenderer.invoke("cloud:sync-preferences", preferences),
  onPreferences: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, preferences: WorkspacePreferences) => listener(preferences);
    ipcRenderer.on("desktop:preferences-changed", handler);
    return () => ipcRenderer.removeListener("desktop:preferences-changed", handler);
  },
  onModeChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: "cloud" | "private-local", path?: string) => listener(mode, path);
    ipcRenderer.on("desktop:mode-changed", handler);
    return () => ipcRenderer.removeListener("desktop:mode-changed", handler);
  },
};

contextBridge.exposeInMainWorld("agentCommonsDesktop", bridge);
