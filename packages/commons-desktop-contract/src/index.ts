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
  name: string;
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
};

export type LocalConversation = {
  id: string;
  agentId: string;
  title: string;
  workspaceRoot?: string;
  messages: LocalMessage[];
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
};

export type LocalTask = {
  id: string;
  title: string;
  prompt: string;
  agentId: string;
  workspaceRoot?: string;
  dueAt?: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalWorkflow = {
  id: string;
  name: string;
  agentId: string;
  workspaceRoot?: string;
  steps: string[];
  lastResult?: string;
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

export type LocalState = {
  version: 1;
  agents: LocalAgent[];
  conversations: LocalConversation[];
  spaces: KnowledgeSpace[];
  tasks: LocalTask[];
  workflows: LocalWorkflow[];
  apps: LocalApp[];
  settings: LocalSettings;
};

export type ChatRequest = {
  agentId: string;
  conversationId?: string;
  prompt: string;
  workspaceRoot?: string;
  spaceIds?: string[];
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
  | { type: "activity"; label: string; detail?: string; status: "running" | "done" | "error" }
  | { type: "state"; state: LocalState };

export type AgentInput = Pick<LocalAgent, "name" | "instructions" | "model"> & {
  id?: string;
};

export type TaskInput = Pick<LocalTask, "title" | "prompt" | "agentId"> & {
  id?: string;
  dueAt?: string;
  workspaceRoot?: string;
};

export type WorkflowInput = Pick<LocalWorkflow, "name" | "agentId" | "steps"> & {
  id?: string;
  workspaceRoot?: string;
};

export type AppInput = Pick<LocalApp, "name" | "directory" | "command" | "args" | "previewUrl"> & {
  id?: string;
};

export interface CloudDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  beginSignIn(): Promise<void>;
  openPrivateWorkspace(): Promise<void>;
}

export interface LocalDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  getState(): Promise<LocalState>;
  chooseWorkspace(): Promise<string | null>;
  chooseKnowledgeFolders(): Promise<string[]>;
  chooseKnowledgeFiles(): Promise<string[]>;
  saveAgent(input: AgentInput): Promise<LocalState>;
  deleteAgent(id: string): Promise<LocalState>;
  sendMessage(input: ChatRequest): Promise<ChatResult>;
  approve(id: string, allow: boolean): Promise<void>;
  addKnowledgeSpace(name: string, folders: string[]): Promise<LocalState>;
  reindexKnowledgeSpace(id: string): Promise<LocalState>;
  removeKnowledgeSpace(id: string): Promise<LocalState>;
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
  deleteApp(id: string): Promise<LocalState>;
  updateSettings(settings: Partial<LocalSettings>): Promise<LocalState>;
  listModels(): Promise<string[]>;
  openCloud(): Promise<void>;
  onEvent(listener: (event: RuntimeEvent) => void): () => void;
}

declare global {
  interface Window {
    agentCommonsDesktop?: CloudDesktopBridge;
    agentCommonsLocal?: LocalDesktopBridge;
  }
}
