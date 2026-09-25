import { contextBridge, ipcRenderer } from "electron";
import type { LocalDesktopBridge, RuntimeEvent, WorkspacePreferences } from "@agent-commons/desktop-contract";

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const bridge: LocalDesktopBridge = {
  getInfo: () => invoke("desktop:get-info", "private-local"),
  getState: () => invoke("local:get-state"),
  getModelStatus: () => invoke("local:get-model-status"),
  prepareModel: () => invoke("local:prepare-model"),
  getStorageRoot: () => invoke("local:get-storage-root"),
  openStorageRoot: () => invoke("local:open-storage-root"),
  apiRequest: (request) => invoke("local:api-request", request),
  openLibraryItem: (id) => invoke("local:open-library-item", id),
  getPreferences: () => invoke("local:get-preferences"),
  syncPreferences: (preferences) => invoke("local:sync-preferences", preferences),
  onPreferences: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, preferences: WorkspacePreferences) => listener(preferences);
    ipcRenderer.on("desktop:preferences-changed", handler);
    return () => ipcRenderer.removeListener("desktop:preferences-changed", handler);
  },
  chooseWorkspace: () => invoke("local:choose-workspace"),
  chooseKnowledgeFolders: () => invoke("local:choose-knowledge-folders"),
  chooseKnowledgeFiles: () => invoke("local:choose-knowledge-files"),
  saveAgent: (input) => invoke("local:save-agent", input),
  deleteAgent: (id) => invoke("local:delete-agent", id),
  sendMessage: (input) => invoke("local:send-message", input),
  deleteConversation: (id) => invoke("local:delete-conversation", id),
  renameConversation: (id, title) => invoke("local:rename-conversation", id, title),
  approve: (id, allow) => invoke("local:approve", id, allow),
  addKnowledgeSpace: (name, folders) => invoke("local:add-space", name, folders),
  reindexKnowledgeSpace: (id) => invoke("local:reindex-space", id),
  removeKnowledgeSpace: (id) => invoke("local:remove-space", id),
  saveSkill: (input) => invoke("local:save-skill", input),
  deleteSkill: (id) => invoke("local:delete-skill", id),
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
  openArtifact: (conversationId, artifactId) => invoke("local:open-artifact", conversationId, artifactId),
  setArtifactFavorite: (conversationId, artifactId, favorite) => invoke("local:set-artifact-favorite", conversationId, artifactId, favorite),
  removeArtifactReference: (conversationId, artifactId) => invoke("local:remove-artifact-reference", conversationId, artifactId),
  deleteApp: (id) => invoke("local:delete-app", id),
  updateSettings: (settings) => invoke("local:update-settings", settings),
  listModels: (url) => invoke("local:list-models", url),
  openCloud: (path) => invoke("desktop:open-cloud", path),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RuntimeEvent) => listener(payload);
    ipcRenderer.on("local:event", handler);
    return () => ipcRenderer.removeListener("local:event", handler);
  },
};

contextBridge.exposeInMainWorld("agentCommonsLocal", bridge);
