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
  /** Empty/absent overrides inherit workspace defaults. */
  mediaModels?: Pick<LocalSettings, "imageModel" | "voiceModel" | "transcriptionModel">;
  createdAt: string;
  updatedAt: string;
};

export type LocalMessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
};

export type LocalMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  attachments?: LocalMessageAttachment[];
};

export type LocalConversation = {
  id: string;
  agentId: string;
  title: string;
  /** Per-chat consent to offer the read-only Web search tool. */
  webSearchEnabled?: boolean;
  workspaceRoot?: string;
  spaceIds?: string[];
  knowledgeMode?: "auto" | "selected" | "off";
  mcpServerIds?: string[];
  /** Chats in the same project share its instructions, files, and knowledge. */
  projectId?: string;
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
  /** When true the file can never be copied to Commons Cloud. */
  keepOnDevice?: boolean;
  /** Cloud Library item created from this file with the user's consent. */
  cloudItemId?: string;
  cloudCopiedAt?: string;
  sourceArchiveId?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * A project groups chats with shared context: instructions, files from the
 * Library, and Knowledge Spaces. Every chat in the project receives it.
 */
export type LocalProject = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  spaceIds: string[];
  libraryItemIds: string[];
  /** Agent used for new chats started from the project page. */
  agentId?: string;
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  id?: string;
  name?: string;
  description?: string;
  instructions?: string;
  spaceIds?: string[];
  libraryItemIds?: string[];
  agentId?: string | null;
  pinned?: boolean;
};

export type KnowledgeFile = {
  path: string;
  size: number;
  modifiedAt: string;
  /** Indexed text. PDF and Office documents store their extracted text. */
  excerpt: string;
  /** How the text was produced. Absent means plain UTF-8. */
  format?: "text" | "pdf" | "office";
};

export type KnowledgeSourceInfo = {
  /** Git branch and commit the folder was indexed at, when it is a repository. */
  git?: { branch?: string; commit?: string; root: string };
};

export type KnowledgeSpace = {
  id: string;
  name: string;
  description?: string;
  folders: string[];
  files: KnowledgeFile[];
  indexedAt?: string;
  /** True when the folders were chosen by the user rather than created by Commons. */
  linked?: boolean;
  /** Linked folders are watched and reindexed when files change outside Commons. */
  liveSync?: boolean;
  source?: KnowledgeSourceInfo;
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
  /** Repeating tasks are rescheduled after each run. */
  repeat?: "daily" | "weekly";
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
  description?: string;
  directory: string;
  /** Empty for a built folder that Commons serves itself. */
  command: string;
  args: string[];
  previewUrl: string;
  /** Set when this app is a copy of a Cloud app kept on this computer. */
  cloudPluginId?: string;
  /** The reviewed Cloud manifest (surfaces, capabilities, data collections) of a kept copy. */
  manifest?: Record<string, unknown>;
  status: "stopped" | "running" | "failed";
  output?: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalSettings = {
  ollamaUrl: string;
  defaultModel: string;
  permissionMode: PermissionMode;
  webSearchUrl?: string;
  webSearchApiKey?: string;
  transcriptionModel?: "Xenova/whisper-tiny" | "Xenova/whisper-base" | "Xenova/whisper-small";
  imageModel?: string;
  voiceModel?: "female" | "male" | "kokoro-heart" | "kokoro-bella" | "kokoro-michael" | "kokoro-george";
  mcpServers?: Array<{ id: string; name: string; url: string; apiKey?: string; mode: "read" | "write"; enabled: boolean }>;
};

export const BRAVE_SEARCH_BASE_URL = "https://api.search.brave.com/res/v1/web";

export function hasConfiguredLocalWebSearch(settings: Pick<LocalSettings, "webSearchUrl" | "webSearchApiKey">) {
  const endpoint = settings.webSearchUrl?.replace(/\/$/, "");
  return Boolean(endpoint && (endpoint !== BRAVE_SEARCH_BASE_URL || settings.webSearchApiKey?.trim()));
}

export type LocalModelStatus = {
  state: "checking" | "downloading-runtime" | "starting" | "downloading-model" | "ready" | "error";
  label: string;
  progress?: number;
};

export type LocalModelDownload = { name: string; status: string; progress?: number; done: boolean; error?: string };

export type DesktopAccount = {
  userId: string;
  displayName: string;
  email?: string;
  profileImage?: string;
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
  projects?: LocalProject[];
  settings: LocalSettings;
  account?: DesktopAccount;
  preferences?: WorkspacePreferences;
};

export type ChatRequest = {
  agentId: string;
  conversationId?: string;
  prompt: string;
  workspaceRoot?: string | null;
  spaceIds?: string[];
  knowledgeMode?: "auto" | "selected" | "off";
  /** Local Library items attached to this message. Files never leave the computer. */
  attachmentIds?: string[];
  /** Project for a new conversation. Existing conversations keep their project. */
  projectId?: string;
  interactive?: boolean;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
  webSearchEnabled?: boolean;
  mcpServerIds?: string[];
};

export type ChatResult = {
  conversation: LocalConversation;
  response: string;
};

export type ApprovalRequest = {
  id: string;
  permission: string;
  summary: string;
  /** One line describing the action, for the collapsed in-chat approval. */
  title?: string;
  conversationId?: string;
  toolName?: string;
  /** Extra risk context shown with the details. */
  note?: string;
};

export type RuntimeEvent =
  | { type: "approval"; approval: ApprovalRequest }
  | { type: "approval-resolved"; id: string; allow: boolean }
  | { type: "activity"; label: string; detail?: string; status: "running" | "done" | "error"; conversationId?: string; toolName?: string; args?: Record<string, unknown>; result?: string }
  | { type: "model"; model: LocalModelStatus }
  | { type: "model-download"; download: LocalModelDownload }
  | { type: "image-model"; status: ImageModelStatus }
  | { type: "voice-model"; status: VoiceModelStatus }
  | { type: "chat-start"; conversationId: string }
  | { type: "chat-token"; conversationId: string; content: string }
  | { type: "chat-end"; conversationId: string }
  | { type: "state"; state: LocalState };

export type ImageModelStatus = { state: "idle" | "downloading" | "ready" | "error"; label: string; modelId?: string; progress?: number; error?: string };
export type VoiceModelStatus = { state: "idle" | "downloading" | "ready" | "error"; label: string; model?: string; error?: string };

export type AgentInput = Pick<LocalAgent, "name" | "instructions" | "model"> & {
  id?: string;
  avatar?: string;
  description?: string;
  persona?: string;
  copilotAccessMode?: "full" | "scoped" | "confirm";
  copilotScopes?: string[];
  mediaModels?: LocalAgent["mediaModels"];
};

export type SkillInput = Pick<LocalSkill, "slug" | "name" | "description" | "instructions" | "triggers" | "tags"> & {
  id?: string;
  assignedAgentIds?: string[];
};

export type TaskInput = Pick<LocalTask, "title" | "prompt" | "agentId"> & {
  id?: string;
  dueAt?: string;
  repeat?: "daily" | "weekly";
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
  description?: string;
  cloudPluginId?: string;
  manifest?: Record<string, unknown>;
};

export interface CloudDesktopBridge {
  getInfo(): Promise<DesktopInfo>;
  beginSignIn(): Promise<void>;
  openPrivateWorkspace(path?: string): Promise<void>;
  getWorkspace(): Promise<string | null>;
  chooseWorkspace(): Promise<string | null>;
  getToolContext(workspace?: string | null, sessionId?: string): Promise<string | null>;
  runTool(request: { tool: string; args: Record<string, unknown>; sessionId?: string; workspaceRoot?: string | null }): Promise<string>;
  getAccess(): Promise<CloudAccess>;
  updateAccess(access: CloudAccess): Promise<CloudAccess>;
  importCloudLibraryItemToLocal(itemId: string, name: string, mimeType: string): Promise<void>;
  listLocalTransferItems(): Promise<Array<{ id: string; name: string; mimeType: string }>>;
  readLocalTransferItem(id: string): Promise<{ name: string; mimeType: string; bytes: Uint8Array }>;
  /** Downloads a published Cloud app into Private Local so it also runs there. */
  saveAppLocally(app: { pluginId: string; name: string; description?: string; entryUrl: string; manifest?: Record<string, unknown> }): Promise<void>;
  /** Records the Cloud copy of a Local Library file after a confirmed transfer. */
  markLocalTransferred(id: string, cloudItemId: string): Promise<void>;
  /** Computer-tool approvals for Cloud agents, answered inside the chat. */
  onApproval(listener: (approval: ApprovalRequest) => void): () => void;
  onApprovalResolved(listener: (id: string) => void): () => void;
  answerApproval(id: string, allow: boolean, remember?: boolean): Promise<void>;
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
  getHardwareInfo(): Promise<{ ramGiB: number; freeDiskGiB: number; platform: string; arch: string }>;
  prepareModel(): Promise<void>;
  preparePython(): Promise<void>;
  testMcpServer(id: string): Promise<{ toolCount: number; readTools: number; writeTools: number }>;
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
  clearAccount(): Promise<void>;
  transcribeAudio(samples: Float32Array, agentId?: string): Promise<string>;
  prepareTranscriptionModel(): Promise<void>;
  getImageModelStatus(): Promise<ImageModelStatus>;
  prepareImageModel(modelId?: string): Promise<void>;
  getImageModelCatalog(): Promise<Array<{ id: string; name: string; bytes: number; ramGiB: number; description: string; recommended: boolean }>>;
  listImageModels(): Promise<Array<{ id: string; name: string; bytes: number }>>;
  openImageModelFolder(): Promise<void>;
  getVoiceModelStatus(): Promise<VoiceModelStatus>;
  prepareVoiceModel(): Promise<void>;
  importProjectFolder(): Promise<{ name: string; libraryItemIds: string[]; summary: string } | null>;
  chooseKnowledgeFiles(): Promise<string[]>;
  saveAgent(input: AgentInput): Promise<LocalState>;
  deleteAgent(id: string): Promise<LocalState>;
  sendMessage(input: ChatRequest): Promise<ChatResult>;
  steerConversation(conversationId: string, prompt: string): Promise<void>;
  deleteConversation(id: string): Promise<LocalState>;
  renameConversation(id: string, title: string): Promise<LocalState>;
  setConversationWebSearch(id: string, enabled: boolean): Promise<LocalState>;
  approve(id: string, allow: boolean, remember?: boolean): Promise<void>;
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
  getArtifactPreview(conversationId: string, artifactId: string): Promise<string | null>;
  setArtifactFavorite(conversationId: string, artifactId: string, favorite: boolean): Promise<LocalState>;
  removeArtifactReference(conversationId: string, artifactId: string): Promise<LocalState>;
  deleteApp(id: string): Promise<LocalState>;
  updateSettings(settings: Partial<LocalSettings>): Promise<LocalState>;
  listModels(url?: string): Promise<string[]>;
  downloadModel(name: string): Promise<void>;
  openCloud(path?: string): Promise<void>;
  onEvent(listener: (event: RuntimeEvent) => void): () => void;
}

declare global {
  interface Window {
    agentCommonsDesktop?: CloudDesktopBridge;
    agentCommonsLocal?: LocalDesktopBridge;
  }
}
