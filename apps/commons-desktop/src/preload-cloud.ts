import { contextBridge, ipcRenderer } from "electron";
import type { ApprovalRequest, CloudDesktopBridge, WorkspacePreferences } from "@agent-commons/desktop-contract";

const bridge: CloudDesktopBridge = {
  getInfo: () => ipcRenderer.invoke("desktop:get-info", "cloud"),
  beginSignIn: () => ipcRenderer.invoke("desktop:begin-sign-in"),
  openPrivateWorkspace: (path) => ipcRenderer.invoke("desktop:open-private", path),
  getWorkspace: () => ipcRenderer.invoke("cloud:get-workspace"),
  chooseWorkspace: () => ipcRenderer.invoke("cloud:choose-workspace"),
  getToolContext: () => ipcRenderer.invoke("cloud:get-tool-context"),
  runTool: (request) => ipcRenderer.invoke("cloud:run-tool", request),
  getAccess: () => ipcRenderer.invoke("cloud:get-access"),
  updateAccess: (access) => ipcRenderer.invoke("cloud:update-access", access),
  importCloudLibraryItemToLocal: (itemId, name, mimeType) => ipcRenderer.invoke("cloud:import-library-to-local", itemId, name, mimeType),
  listLocalTransferItems: () => ipcRenderer.invoke("cloud:list-local-transfer-items"),
  readLocalTransferItem: (id) => ipcRenderer.invoke("cloud:read-local-transfer-item", id),
  markLocalTransferred: (id, cloudItemId) => ipcRenderer.invoke("cloud:mark-local-transferred", id, cloudItemId),
  saveAppLocally: (app) => ipcRenderer.invoke("cloud:save-app-locally", app),
  onApproval: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, approval: ApprovalRequest) => listener(approval);
    ipcRenderer.on("desktop:cloud-approval", handler);
    return () => ipcRenderer.removeListener("desktop:cloud-approval", handler);
  },
  onApprovalResolved: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, id: string) => listener(id);
    ipcRenderer.on("desktop:cloud-approval-resolved", handler);
    return () => ipcRenderer.removeListener("desktop:cloud-approval-resolved", handler);
  },
  answerApproval: (id, allow, remember) => ipcRenderer.invoke("cloud:answer-approval", id, allow, remember),
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
