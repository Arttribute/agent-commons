export const DESKTOP_PROTOCOL_VERSION = 1;

export type DesktopCapability =
  | "privateLocal.v1"
  | "workspace.select"
  | "localTools.v1"
  | "knowledge.folders.v1"
  | "tasks.local.v1"
  | "workflows.local.v1"
  | "apps.local.v1";

export type DesktopInfo = {
  desktopVersion: string;
  protocolVersion: number;
  platform: "aix" | "android" | "darwin" | "freebsd" | "haiku" | "linux" | "openbsd" | "sunos" | "win32";
  mode: "cloud" | "private-local";
  capabilities: DesktopCapability[];
};

export type PermissionMode = "ask" | "read-only";

export type LocalAgent = {
  id: string;
  cloudAgentId?: string;
  source?: "cloud" | "local";
  name: string;
  avatar?: string;
  description?: string;
  persona?: string;
  isDefault?: boolean;
  copilotAccessMode?: "full" | "scoped" | "confirm";
  copilotScopes?: string[];
  instructions: string;
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
};

export type LocalConversation = {
  id: string;
  agentId: string;
  title: string;
  workspaceRoot?: string;
  spaceIds?: string[];
  messages: LocalMessage[];
  artifacts?: LocalArtifact[];
  createdAt: string;
  updatedAt: string;
};

export type LocalArtifact = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  isFavorite?: boolean;
};

export type LocalLibraryItem = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  source: "agent" | "upload";
  agentId?: string;
  conversationId?: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeFile = {
  path: string;
  size: number;
  modifiedAt: string;
  excerpt: string;
};

export type KnowledgeSpace = {
  id: string;
  name: string;
  folders: string[];
  files: KnowledgeFile[];
  indexedAt?: string;
  autoGrantNewAgents?: boolean;
  grants?: Array<{ id: string; subjectType: "agent" | "user" | "workspace"; subjectId: string; permission: "read" | "write" | "manage"; autoRetrieve: boolean }>;
};

export type LocalSkill = {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructions: string;
  triggers: string[];
  tags: string[];
  assignedAgentIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type LocalTask = {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  sessionId?: string;
  priority?: number;
  agentId: string;
  workspaceRoot?: string;
  dueAt?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalWorkflow = {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  workspaceRoot?: string;
  steps: string[];
  definition?: Record<string, unknown>;
  lastResult?: string;
  lastRun?: {
    executionId: string;
    status: "running" | "completed" | "failed";
    startedAt: string;
    completedAt?: string;
    currentNode?: string;
    outputData?: string;
    errorMessage?: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type LocalApp = {
  id: string;
  name: string;
  directory: string;
  command: string;
  args: string[];
  previewUrl: string;
  status: "stopped" | "running" | "failed";
  output?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalSettings = {
  ollamaUrl: string;
  defaultModel: string;
  permissionMode: PermissionMode;
};

export type LocalModelStatus = {
  state: "checking" | "downloading-runtime" | "starting" | "downloading-model" | "ready" | "error";
  label: string;
  progress?: number;
};

export type DesktopAccount = {
  userId: string;
  displayName: string;
  email?: string;
};

export type WorkspacePreferences = {
  agentsPerPage?: { value: 5 | 10 | 20 | 50; updatedAt: number };
  pinnedAppIds?: { value: string[]; updatedAt: number };
};

export type CloudAccess = {
  readFiles: boolean;
  writeFiles: boolean;
  /** Enables commands with the computer account's full filesystem access. */
  runCommands: boolean;
};

export type LocalState = {
  version: 1;
  agents: LocalAgent[];
  conversations: LocalConversation[];
  library?: LocalLibraryItem[];
  spaces: KnowledgeSpace[];
  skills?: LocalSkill[];
  tasks: LocalTask[];
  workflows: LocalWorkflow[];
  apps: LocalApp[];
  settings: LocalSettings;
  account?: DesktopAccount;
  preferences?: WorkspacePreferences;
};

export type ChatRequest = {
  agentId: string;
  conversationId?: string;
  prompt: string;
  workspaceRoot?: string;
  spaceIds?: string[];
  interactive?: boolean;
};

export type ChatResult = {
  conversation: LocalConversation;
  response: string;
};

export type ApprovalRequest = {
  id: string;
  permission: string;
  summary: string;
};

export type RuntimeEvent =
  | { type: "approval"; approval: ApprovalRequest }
  | { type: "activity"; label: string; detail?: string; status: "running" | "done" | "error"; conversationId?: string; toolName?: string; args?: Record<string, unknown>; result?: string }
  | { type: "model"; model: LocalModelStatus }
  | { type: "chat-start"; conversationId: string }
  | { type: "chat-token"; conversationId: string; content: string }
  | { type: "chat-end"; conversationId: string }
  | { type: "state"; state: LocalState };

export type AgentInput = Pick<LocalAgent, "name" | "instructions" | "model"> & {
  id?: string;
  avatar?: string;
  description?: string;
  persona?: string;
  copilotAccessMode?: "full" | "scoped" | "confirm";
  copilotScopes?: string[];
};

export type SkillInput = Pick<LocalSkill, "slug" | "name" | "description" | "instructions" | "triggers" | "tags"> & {
  id?: string;
  assignedAgentIds?: string[];
};

export type TaskInput = Pick<LocalTask, "title" | "prompt" | "agentId"> & {
  id?: string;
  dueAt?: string;
  workspaceRoot?: string;
  description?: string;
  sessionId?: string;
  priority?: number;
};

export type WorkflowInput = Pick<LocalWorkflow, "name" | "agentId" | "steps"> & {
  id?: string;
  workspaceRoot?: string;
  description?: string;
  definition?: Record<string, unknown>;
};

export type AppInput = Pick<LocalApp, "name" | "directory" | "command" | "args" | "previewUrl"> & {
  id?: string;
};

export interface CloudDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  beginSignIn(): Promise<void>;
  openPrivateWorkspace(path?: string): Promise<void>;
  getWorkspace(): Promise<string | null>;
  chooseWorkspace(): Promise<string | null>;
  getToolContext(): Promise<string | null>;
  runTool(request: { tool: string; args: Record<string, unknown>; sessionId?: string }): Promise<string>;
  getAccess(): Promise<CloudAccess>;
  updateAccess(access: CloudAccess): Promise<CloudAccess>;
  importCloudLibraryItemToLocal(itemId: string, name: string, mimeType: string): Promise<void>;
  listLocalTransferItems(): Promise<Array<{ id: string; name: string; mimeType: string }>>;
  readLocalTransferItem(id: string): Promise<{ name: string; mimeType: string; bytes: Uint8Array }>;
  syncAccount(account: DesktopAccount): Promise<void>;
  getPreferences(): Promise<WorkspacePreferences>;
  syncPreferences(preferences: WorkspacePreferences): Promise<WorkspacePreferences>;
  onPreferences(listener: (preferences: WorkspacePreferences) => void): () => void;
  onModeChange(listener: (mode: DesktopInfo["mode"], path?: string) => void): () => void;
}

export interface LocalDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  getState(): Promise<LocalState>;
  getModelStatus(): Promise<LocalModelStatus>;
  prepareModel(): Promise<void>;
  getStorageRoot(): Promise<string>;
  openComputer(input: { agentId: string; conversationId?: string; target: "files" | "terminal" }): Promise<void>;
  openStorageRoot(): Promise<void>;
  apiRequest(request: { path: string; method: string; body?: unknown }): Promise<{ status: number; body: unknown }>;
  openLibraryItem(id: string): Promise<void>;
  getPreferences(): Promise<WorkspacePreferences>;
  syncPreferences(preferences: WorkspacePreferences): Promise<WorkspacePreferences>;
  onPreferences(listener: (preferences: WorkspacePreferences) => void): () => void;
  chooseWorkspace(): Promise<string | null>;
  chooseKnowledgeFolders(): Promise<string[]>;
  chooseKnowledgeFiles(): Promise<string[]>;
  saveAgent(input: AgentInput): Promise<LocalState>;
  deleteAgent(id: string): Promise<LocalState>;
  sendMessage(input: ChatRequest): Promise<ChatResult>;
  deleteConversation(id: string): Promise<LocalState>;
  renameConversation(id: string, title: string): Promise<LocalState>;
  approve(id: string, allow: boolean): Promise<void>;
  addKnowledgeSpace(name: string, folders: string[]): Promise<LocalState>;
  reindexKnowledgeSpace(id: string): Promise<LocalState>;
  removeKnowledgeSpace(id: string): Promise<LocalState>;
  saveSkill(input: SkillInput): Promise<LocalState>;
  deleteSkill(id: string): Promise<LocalState>;
  saveTask(input: TaskInput): Promise<LocalState>;
  runTask(id: string): Promise<LocalState>;
  deleteTask(id: string): Promise<LocalState>;
  saveWorkflow(input: WorkflowInput): Promise<LocalState>;
  runWorkflow(id: string): Promise<LocalState>;
  deleteWorkflow(id: string): Promise<LocalState>;
  saveApp(input: AppInput): Promise<LocalState>;
  startApp(id: string): Promise<LocalState>;
  stopApp(id: string): Promise<LocalState>;
  openApp(id: string): Promise<void>;
  openArtifact(conversationId: string, artifactId: string): Promise<void>;
  setArtifactFavorite(conversationId: string, artifactId: string, favorite: boolean): Promise<LocalState>;
  removeArtifactReference(conversationId: string, artifactId: string): Promise<LocalState>;
  deleteApp(id: string): Promise<LocalState>;
  updateSettings(settings: Partial<LocalSettings>): Promise<LocalState>;
  listModels(url?: string): Promise<string[]>;
  openCloud(path?: string): Promise<void>;
  onEvent(listener: (event: RuntimeEvent) => void): () => void;
}

declare global {
  interface Window {
    agentCommonsDesktop?: CloudDesktopBridge;
    agentCommonsLocal?: LocalDesktopBridge;
  }
}
