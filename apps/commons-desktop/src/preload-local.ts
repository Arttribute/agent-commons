import { contextBridge, ipcRenderer } from "electron";
import type { LocalDesktopBridge, RuntimeEvent } from "@agent-commons/desktop-contract";

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const bridge: LocalDesktopBridge = {
  getInfo: () => invoke("desktop:get-info", "private-local"),
  getState: () => invoke("local:get-state"),
  chooseWorkspace: () => invoke("local:choose-workspace"),
  chooseKnowledgeFolders: () => invoke("local:choose-knowledge-folders"),
  chooseKnowledgeFiles: () => invoke("local:choose-knowledge-files"),
  saveAgent: (input) => invoke("local:save-agent", input),
  deleteAgent: (id) => invoke("local:delete-agent", id),
  sendMessage: (input) => invoke("local:send-message", input),
  approve: (id, allow) => invoke("local:approve", id, allow),
  addKnowledgeSpace: (name, folders) => invoke("local:add-space", name, folders),
  reindexKnowledgeSpace: (id) => invoke("local:reindex-space", id),
  removeKnowledgeSpace: (id) => invoke("local:remove-space", id),
  saveTask: (input) => invoke("local:save-task", input),
  runTask: (id) => invoke("local:run-task", id),
  deleteTask: (id) => invoke("local:delete-task", id),
  saveWorkflow: (input) => invoke("local:save-workflow", input),
  runWorkflow: (id) => invoke("local:run-workflow", id),
  deleteWorkflow: (id) => invoke("local:delete-workflow", id),
  saveApp: (input) => invoke("local:save-app", input),
  startApp: (id) => invoke("local:start-app", id),
  stopApp: (id) => invoke("local:stop-app", id),
  openApp: (id) => invoke("local:open-app", id),
  deleteApp: (id) => invoke("local:delete-app", id),
  updateSettings: (settings) => invoke("local:update-settings", settings),
  listModels: () => invoke("local:list-models"),
  openCloud: () => invoke("desktop:open-cloud"),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RuntimeEvent) => listener(payload);
    ipcRenderer.on("local:event", handler);
    return () => ipcRenderer.removeListener("local:event", handler);
  },
};

contextBridge.exposeInMainWorld("agentCommonsLocal", bridge);
