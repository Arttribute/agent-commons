import { randomUUID } from "node:crypto";
import { homedir, totalmem } from "node:os";
import { basename, dirname, extname, join, relative } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statfsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { WebContents } from "electron";
import { hasConfiguredLocalWebSearch } from "@agent-commons/desktop-contract";
import type {
  AgentInput,
  AppInput,
  ChatRequest,
  ChatResult,
  DesktopAccount,
  LocalAgent,
  LocalApp,
  LocalConversation,
  LocalLibraryItem,
  LocalProject,
  LocalState,
  ProjectInput,
  RuntimeEvent,
  SkillInput,
  TaskInput,
  WorkflowInput,
  WorkspacePreferences,
} from "@agent-commons/desktop-contract";
import { AUTONOMOUS_EXECUTION_CONTRACT, buildAgentIdentityPrompt, buildSkillPromptIndex, buildWorkspaceModeContext, findMatchingSkills } from "@agent-commons/agent-core";
import {
  extractDocumentText,
  extractToolCall,
  isExtractableDocument,
  runLocalTool,
  safePath,
  searchTextPassages,
  stopLocalProcesses,
  type LocalToolsConfig,
} from "../../../packages/agc-cli/src/local-tools";
import { indexFolders, searchSpaces, accessibleSpaces, knowledgeTool, gitInfo, setDocumentExtractor } from "./knowledge";
import { KnowledgeWatcher } from "./knowledge-watcher";
import { approvalTitle, plainSummary } from "./approval-summary";
import { serveStaticApp, type StaticAppServer } from "./local-static-server";
import { compactToolLoop, localChatHistory, LOCAL_CONTEXT_SIZE, toolResult } from "./local-chat-history";
import { normalizeLocalCommand } from "./local-command";
import { DEFAULT_LOCAL_MODEL, LocalStore } from "./store";
import { LocalModelManager } from "./local-model";
import { LocalImageManager } from "./local-image";
import { LocalVoiceManager, LOCAL_VOICES } from "./local-voice";
import { LocalStorageLayout } from "./local-storage-layout";
import { handleLocalKnowledgeApi } from "./local-knowledge-api";
import { assistantIdentityAnswer, assistantIdentityRequestKind, assistantNameAnswer, looksLikeInventedToolCall, looksLikeModelIdentity, parseToolArguments } from "./local-response";
import { readOllamaChatResponse, type OllamaMessage } from "./ollama-stream";
import { mergeWorkspacePreferences } from "./workspace-preferences";
import { compileLocalWorkflow } from "./local-workflow-plan.mjs";
import { localWebSearchRequest, localWebSearchResults } from "./local-web-search";

type PendingApproval = {
  resolve: (allow: boolean) => void;
  timeout: NodeJS.Timeout;
  conversationId?: string;
  permission: string;
};
type RemoteMcpTool = {
  client: { callTool(input: { name: string; arguments: Record<string, unknown> }, schema?: unknown, options?: { timeout?: number }): Promise<unknown>; close(): Promise<void> };
  server: NonNullable<LocalState["settings"]["mcpServers"]>[number];
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
};

export const LOCAL_TOOLS = [
  functionTool("cli_list_directory", "List files and folders inside the selected workspace.", {
    path: { type: "string", description: "Workspace-relative directory, default ." },
  }),
  functionTool("cli_read_file", "Read a text, PDF, or supported document from the selected workspace.", {
    path: { type: "string" },
    offset: { type: "number", description: "Character offset for continuing a long file. Start at 0." },
  }, ["path"]),
  functionTool("cli_search_file", "Find relevant passages and character offsets inside one text, PDF, or Office file in the selected workspace. Use this for large documents instead of reading every chunk in order.", {
    path: { type: "string" }, query: { type: "string", description: "Words or phrase to find in the document" },
  }, ["path", "query"]),
  functionTool("cli_write_file", "Create or replace a UTF-8 file inside the selected workspace.", {
    path: { type: "string" },
    content: { type: "string" },
  }, ["path", "content"]),
  functionTool("cli_search_files", "Find files by a glob-like name pattern.", {
    pattern: { type: "string" },
    directory: { type: "string" },
  }, ["pattern"]),
  functionTool("cli_disk_usage", "Rank the largest files and folders inside the selected workspace using a bounded read-only scan. Sizes are limited to that folder.", {
    path: { type: "string", description: "Workspace-relative directory, default ." },
  }),
  functionTool("cli_run_command", "Run a non-interactive command with an argument array.", {
    command: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    cwd: { type: "string" },
    timeout_seconds: { type: "number" },
  }, ["command"]),
  functionTool("cli_start_process", "Start a long-running command such as a dev server.", {
    command: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    cwd: { type: "string" },
  }, ["command"]),
  functionTool("cli_wait_for_process", "Wait for and inspect a background process.", {
    processId: { type: "string" },
    wait_seconds: { type: "number" },
  }, ["processId"]),
  functionTool("cli_process_status", "Inspect a background process without waiting.", {
    processId: { type: "string" },
  }, ["processId"]),
  functionTool("cli_kill_process", "Stop a background process started in this session.", {
    processId: { type: "string" },
  }, ["processId"]),
  functionTool("cli_list_processes", "List background processes started by the agent.", {}),
  functionTool("list_knowledge_spaces", "List the Knowledge Spaces available to this agent, with IDs and document counts. Use this when asked what knowledge is available.", {}),
  functionTool("list_knowledge_documents", "List documents in a Knowledge Space, including their paths. Supports pagination.", {
    spaceId: { type: "string" }, offset: { type: "number" },
  }, ["spaceId"]),
  functionTool("read_knowledge_document", "Read an indexed document from a Knowledge Space. Supports offsets for long documents.", {
    spaceId: { type: "string" }, path: { type: "string" }, offset: { type: "number" },
  }, ["spaceId", "path"]),
  functionTool("search_knowledge", "Search the user's local Knowledge Spaces. Results are numbered passages with their source file and line range for citations.", {
    query: { type: "string" }, spaceId: { type: "string", description: "Optional: limit to one space" },
  }, ["query"]),
  functionTool("web_search", "Search the public web through the user's configured Local search service. The exact query and destination require user approval before leaving this computer. Read-only.", {
    query: { type: "string" },
  }, ["query"]),
  functionTool("read_library_item", "Read the text of a file attached to this chat or included in this project, by its Library item ID. PDFs and Office documents are extracted to text. Supports offsets for long files.", {
    itemId: { type: "string" }, offset: { type: "number" },
  }, ["itemId"]),
  functionTool("search_library_item", "Find relevant passages and character offsets inside a file attached to this chat or included in this project. Use this before reading a large file page by page.", {
    itemId: { type: "string" }, query: { type: "string", description: "Words or phrase to find in the file" },
  }, ["itemId", "query"]),
  functionTool("generate_image", "Generate a 512×512 image on this computer. The image model downloads automatically on first use and the result appears in this chat's artifacts and Local Library.", {
    prompt: { type: "string", description: "Visual description of the image to create" },
  }, ["prompt"]),
  functionTool("generate_audio", "Speak text with a local voice model and save a WAV file in this chat and Local Library. Model weights download automatically on first use.", {
    text: { type: "string", description: "Text to speak, up to 1,500 characters" },
  }, ["text"]),
  functionTool("invoke_skill", "Load the complete instructions for a locally saved skill by slug.", {
    skillSlug: { type: "string" },
  }, ["skillSlug"]),
  functionTool("local_list_data", "List folders and records in the Agent Commons Local storage workspace. Paths are relative to that workspace.", {
    path: { type: "string", description: "Local storage-relative folder; default ." },
  }),
  functionTool("local_read_data", "Read a text record, Knowledge note, or skill from the Agent Commons Local storage workspace.", {
    path: { type: "string", description: "Local storage-relative file path" },
  }, ["path"]),
  functionTool("local_create_knowledge_space", "Create a Knowledge Space backed by a new folder in the Local storage workspace.", {
    name: { type: "string" },
  }, ["name"]),
  functionTool("local_create_note", "Create a Markdown note inside an existing local Knowledge Space.", {
    spaceId: { type: "string" }, path: { type: "string", description: "Space-relative .md path" }, content: { type: "string" },
  }, ["spaceId", "path", "content"]),
  functionTool("local_save_skill", "Save a reusable Markdown skill in the Local workspace. An existing slug is updated.", {
    slug: { type: "string" }, name: { type: "string" }, description: { type: "string" }, instructions: { type: "string" },
    triggers: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } },
  }, ["slug", "name", "instructions"]),
  functionTool("local_register_app", "Register an app built in the selected workspace so it appears in Commons Apps. For a folder with a built index.html, omit command and previewUrl; Commons serves it. For a dev server, give the command and its localhost preview URL.", {
    name: { type: "string" }, description: { type: "string" }, directory: { type: "string", description: "Selected workspace-relative app folder" },
    command: { type: "string" }, args: { type: "array", items: { type: "string" } }, previewUrl: { type: "string" },
  }, ["name", "directory"]),
];

function functionTool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

function now() {
  return new Date().toISOString();
}

function ensureLoopback(raw: string) {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Local model URL must use HTTP or HTTPS");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("Private Local mode only permits a model server on this computer");
  }
  return url.toString().replace(/\/$/, "");
}

export function mimeFor(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    svg: "image/svg+xml", pdf: "application/pdf", md: "text/markdown", txt: "text/plain", html: "text/html",
    json: "application/json", csv: "text/csv", js: "text/javascript", ts: "text/plain", css: "text/css",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

const TEXT_EXTENSIONS = /\.(?:md|mdx|txt|json|jsonl|csv|tsv|html?|css|scss|js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|sql|ya?ml|toml|xml|sh)$/i;
const libraryTextCache = new Map<string, { size: number; mtimeMs: number; text: string }>();

/** Reads a Local Library file as text for the agent, extracting documents. */
export async function readLibraryText(item: LocalLibraryItem) {
  if (!existsSync(item.path)) throw new Error("The file is missing from this computer.");
  const { size, mtimeMs } = statSync(item.path);
  const cached = libraryTextCache.get(item.path);
  if (cached?.size === size && cached.mtimeMs === mtimeMs) return cached.text;
  let text: string;
  if (isExtractableDocument(item.path) || item.mimeType === "application/pdf" || /officedocument/.test(item.mimeType)) {
    text = await extractDocumentText(item.path, { maxChars: Number.MAX_SAFE_INTEGER });
  } else if (item.mimeType.startsWith("text/") || item.mimeType === "application/json" || TEXT_EXTENSIONS.test(item.name)) {
    if (size > 25 * 1024 * 1024) throw new Error("Text files larger than 25 MB cannot be read in chat.");
    text = readFileSync(item.path, "utf8");
  } else if (item.mimeType.startsWith("image/")) text = `[Image file ${item.name}. Describe it only if the local model supports images.]`;
  else text = `[${item.name} is a binary ${extname(item.name) || "file"} and has no readable text.]`;
  // Small LRU. The text stays in memory only while Desktop is open; a file
  // change invalidates its entry before the next read.
  libraryTextCache.delete(item.path);
  if (text.length <= 2_000_000) libraryTextCache.set(item.path, { size, mtimeMs, text });
  while (libraryTextCache.size > 4) libraryTextCache.delete(libraryTextCache.keys().next().value!);
  return text;
}

const supportedToolNames = new Set(LOCAL_TOOLS.map((tool) => tool.function.name));

type CloudAgentSnapshot = {
  agentId: string;
  name: string;
  avatar?: string;
  instructions?: string;
  description?: string;
  persona?: string;
  isDefault?: boolean;
};

export class PrivateLocalRuntime {
  private readonly activeConversations = new Set<string>();
  private readonly pendingSteers = new Map<string, string[]>();
  private readonly activeMcpTools = new Map<string, Map<string, RemoteMcpTool>>();
  private modelDownload?: Promise<void>;
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly appProcesses = new Map<string, string>();
  private readonly staticApps = new Map<string, StaticAppServer>();
  private readonly store: LocalStore;
  private readonly layout: LocalStorageLayout;
  private readonly scheduler: NodeJS.Timeout;
  private readonly modelManager: LocalModelManager;
  private readonly imageManager: LocalImageManager;
  private readonly voiceManager: LocalVoiceManager;
  private readonly watcher: KnowledgeWatcher;
  /** Approvals the user chose to always allow, per conversation and permission. */
  private readonly rememberedApprovals = new Map<string, Set<string>>();
  private readonly reindexing = new Map<string, Promise<LocalState>>();
  private target?: WebContents;

  constructor(userDataDirectory: string) {
    setDocumentExtractor(extractDocumentText);
    this.store = new LocalStore(userDataDirectory);
    this.layout = new LocalStorageLayout(userDataDirectory);
    this.watcher = new KnowledgeWatcher((spaceId) => {
      void this.reindexKnowledgeSpace(spaceId).catch(() => undefined);
    });
    this.modelManager = new LocalModelManager(
      this.layout.root,
      this.store.get().settings.defaultModel || DEFAULT_LOCAL_MODEL,
      (model) => this.emit({ type: "model", model }),
    );
    this.imageManager = new LocalImageManager(this.layout.root, (status) => this.emit({ type: "image-model", status }));
    this.voiceManager = new LocalVoiceManager(userDataDirectory, (status) => this.emit({ type: "voice-model", status }));
    this.layout.sync(this.store.get());
    this.scheduler = setInterval(() => void this.runDueTasks(), 30_000);
    this.scheduler.unref();
    if (this.store.get().apps.some((app) => app.status === "running")) {
      // App servers and processes do not survive a restart.
      this.change((state) => { for (const app of state.apps) if (app.status === "running") app.status = "stopped"; });
    }
    this.syncWatchers();
    // Catch edits made while Commons was closed. Unchanged files are reused.
    for (const space of this.store.get().spaces) {
      if (space.linked) void this.reindexKnowledgeSpace(space.id).catch(() => undefined);
    }
  }

  private syncWatchers() {
    this.watcher.sync(this.store.get().spaces
      .filter((space) => space.linked && space.liveSync !== false)
      .map((space) => ({ id: space.id, folders: space.folders.filter((folder) => {
        try { return statSync(folder).isDirectory(); } catch { return false; }
      }) }))
      .filter((space) => space.folders.length > 0));
  }

  setTarget(target: WebContents | undefined) {
    this.target = target;
  }

  state() {
    return this.store.get();
  }

  modelStatus() {
    return this.modelManager.currentStatus();
  }

  imageModelStatus() { return this.imageManager.currentStatus(); }
  prepareImageModel(modelId?: string) { return this.imageManager.prepareModel(modelId); }
  imageModelCatalog() { return this.imageManager.catalog(); }
  listImageModels() { return this.imageManager.listModels(); }
  imageModelDirectory() { return this.imageManager.modelDirectory(); }
  voiceModelStatus() { return this.voiceManager.currentStatus(); }
  prepareVoiceModel() { return this.voiceManager.prepare(this.store.get().settings.voiceModel); }

  artifactPreview(conversationId: string, artifactId: string) {
    const artifact = this.store.get().conversations.find((item) => item.id === conversationId)?.artifacts?.find((item) => item.id === artifactId);
    if (!artifact || !/\.(?:png|wav)$/i.test(artifact.name) || !existsSync(artifact.path)) return null;
    const size = statSync(artifact.path).size;
    if (size < 1 || size > 4 * 1024 * 1024) return null;
    const bytes = readFileSync(artifact.path);
    if (/\.png$/i.test(artifact.name)) {
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
      return `data:image/png;base64,${bytes.toString("base64")}`;
    }
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return null;
    return `data:audio/wav;base64,${bytes.toString("base64")}`;
  }

  hardwareInfo() {
    const disk = statfsSync(this.layout.root);
    return { ramGiB: Math.round(totalmem() / 1024 ** 3), freeDiskGiB: Math.floor(disk.bavail * disk.bsize / 1024 ** 3), platform: process.platform, arch: process.arch };
  }

  prepareLocalModel() {
    if (this.store.get().settings.ollamaUrl !== "http://127.0.0.1:11434") return Promise.resolve();
    return this.modelManager.prepare();
  }

  storageRoot() {
    return this.layout.root;
  }

  appsDirectory() {
    return this.layout.path("apps");
  }

  importLibraryFiles(files: Array<{ name: string; mimeType: string; bytes: Uint8Array }>) {
    if (!files.length) throw new Error("Choose a file to upload into the Local Library.");
    const imported: LocalLibraryItem[] = [];
    for (const file of files) {
      if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength > 25 * 1024 * 1024) throw new Error("Local uploads are limited to 25 MB per file.");
      const id = randomUUID();
      const name = basename(String(file.name || "file")).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "file";
      const path = this.layout.path("uploads", `${id}-${name}`);
      writeFileSync(path, file.bytes, { flag: "wx", mode: 0o600 });
      const timestamp = now();
      const mimeType = file.mimeType && file.mimeType !== "application/octet-stream" ? file.mimeType : mimeFor(name);
      imported.push({ id, name, path, mimeType, source: "upload", createdAt: timestamp, updatedAt: timestamp });
    }
    this.change((state) => { (state.library ??= []).unshift(...imported); });
    return imported;
  }

  importProjectFolder(folder: string) {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error("Choose an existing project folder.");
    const supported = /\.(?:pdf|docx|pptx|xlsx|csv|txt|json|md|mdx)$/i;
    const pending: string[] = [];
    const walk = (directory: string, depth: number) => {
      if (depth > 8) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path, depth + 1);
        else if (entry.isFile() && supported.test(entry.name) && statSync(path).size > 0 && statSync(path).size <= 25 * 1024 * 1024) pending.push(path);
        if (pending.length >= 25) return;
      }
    };
    walk(folder, 0);
    const items = pending.map((path) => this.importLibraryFiles([{ name: relative(folder, path).replace(/[\\/]/g, " - "), mimeType: mimeFor(path), bytes: readFileSync(path) }])[0]);
    return { name: basename(folder), libraryItemIds: items.map((item) => item.id), summary: `${items.length} documents` };
  }

  updateLibraryItem(id: string, patch: { name?: string; isFavorite?: boolean; keepOnDevice?: boolean }) {
    return this.change((state) => {
      const item = state.library?.find((entry) => entry.id === id);
      if (!item) throw new Error("Local Library item not found");
      if (patch.name !== undefined) item.name = patch.name.trim().slice(0, 180) || item.name;
      if (patch.isFavorite !== undefined) item.isFavorite = patch.isFavorite;
      if (patch.keepOnDevice !== undefined) item.keepOnDevice = patch.keepOnDevice;
      item.updatedAt = now();
    });
  }

  markLibraryItemInCloud(id: string, cloudItemId: string) {
    return this.change((state) => {
      const item = state.library?.find((entry) => entry.id === id);
      if (!item) throw new Error("Local Library item not found");
      if (item.keepOnDevice) throw new Error("This file is set to stay on this computer.");
      item.cloudItemId = cloudItemId.slice(0, 128);
      item.cloudCopiedAt = now();
    });
  }

  async readLibraryItem(id: string, offset = 0) {
    const item = this.store.get().library?.find((entry) => entry.id === id);
    if (!item) throw new Error("Local Library item not found");
    const text = await readLibraryText(item);
    const start = Math.max(0, Math.trunc(offset));
    return { item, content: text.slice(start, start + 6_000), nextOffset: start + 6_000 < text.length ? start + 6_000 : null, totalChars: text.length };
  }

  deleteLibraryItem(id: string) {
    const item = this.store.get().library?.find((entry) => entry.id === id);
    if (!item) throw new Error("Local Library item not found");
    this.change((state) => {
      state.library = (state.library ?? []).filter((entry) => entry.id !== id);
      for (const conversation of state.conversations) conversation.artifacts = conversation.artifacts?.filter((artifact) => artifact.id !== id);
      for (const project of state.projects ?? []) project.libraryItemIds = project.libraryItemIds.filter((itemId) => itemId !== id);
    });
    // Only delete copies owned by Commons. Project files remain in place.
    if (item.path.startsWith(this.layout.root + "/") && existsSync(item.path)) unlinkSync(item.path);
  }

  syncCloudAgents(agents: CloudAgentSnapshot[]) {
    const snapshots = agents.filter((agent) => agent.agentId && agent.name?.trim());
    if (!snapshots.length) return this.store.get();
    const timestamp = now();
    return this.change((state) => {
      for (const snapshot of snapshots) {
        const existing = state.agents.find(
          (agent) => agent.cloudAgentId === snapshot.agentId || agent.id === snapshot.agentId,
        );
        const instructions = snapshot.instructions?.trim() || snapshot.description?.trim() ||
          snapshot.persona?.trim() || "You are a capable Agent Commons assistant. Protect user data and verify your work.";
        if (existing) {
          Object.assign(existing, {
            cloudAgentId: snapshot.agentId,
            source: "cloud" as const,
            name: snapshot.name.trim(),
            ...(snapshot.avatar ? { avatar: snapshot.avatar } : {}),
            description: snapshot.description,
            persona: snapshot.persona,
            isDefault: snapshot.isDefault,
            instructions,
            model: "",
            updatedAt: timestamp,
          });
        } else {
          state.agents.push({
            id: snapshot.agentId,
            cloudAgentId: snapshot.agentId,
            source: "cloud",
            name: snapshot.name.trim(),
            avatar: snapshot.avatar,
            description: snapshot.description,
            persona: snapshot.persona,
            isDefault: snapshot.isDefault,
            instructions,
            model: "",
            createdAt: timestamp,
            updatedAt: timestamp,
          });
        }
      }
      state.agents.sort((left, right) => Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)));
      const starterIsUsed = state.conversations.some((item) => item.agentId === "commons-local") ||
        state.tasks.some((item) => item.agentId === "commons-local") ||
        state.workflows.some((item) => item.agentId === "commons-local");
      if (!starterIsUsed) state.agents = state.agents.filter((agent) => agent.id !== "commons-local");
    });
  }

  syncAccount(account: DesktopAccount) {
    if (!account || typeof account.userId !== "string" || typeof account.displayName !== "string") return;
    this.change((state) => {
      state.account = {
        userId: account.userId.slice(0, 256),
        displayName: account.displayName.slice(0, 256),
        email: typeof account.email === "string" ? account.email.slice(0, 256) : undefined,
        profileImage: typeof account.profileImage === "string" && /^https:\/\//i.test(account.profileImage)
          ? account.profileImage.slice(0, 2_048) : undefined,
      };
    });
  }

  clearAccount() {
    this.change((state) => { state.account = undefined; });
  }

  preferences() {
    return this.store.get().preferences ?? {};
  }

  syncPreferences(incoming: WorkspacePreferences, source: "cloud" | "private-local") {
    const merged = mergeWorkspacePreferences(this.preferences(), incoming, source);
    return this.change((state) => {
      state.preferences = merged;
    }).preferences ?? {};
  }

  saveAgent(input: AgentInput) {
    const timestamp = now();
    const name = input.name.trim();
    if (!name) throw new Error("Agent name is required");
    if (input.avatar && input.avatar !== "/commons-copilot.png" && (!/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(input.avatar) || input.avatar.length > 1_400_000)) {
      throw new Error("Local agent images must be PNG, JPEG, WebP, or GIF and smaller than 1 MB.");
    }
    return this.change((state) => {
      const existing = input.id ? state.agents.find((agent) => agent.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, {
          name,
          ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.persona !== undefined ? { persona: input.persona } : {}),
          ...(input.copilotAccessMode !== undefined ? { copilotAccessMode: input.copilotAccessMode } : {}),
          ...(input.copilotScopes !== undefined ? { copilotScopes: input.copilotScopes.filter((scope) => ["workflows", "agents", "tools", "skills", "tasks"].includes(scope)) } : {}),
          instructions: input.instructions.trim(),
          model: input.model.trim(),
          updatedAt: timestamp,
        });
      } else {
        state.agents.push({
          id: randomUUID(),
          name,
          avatar: input.avatar,
          description: input.description,
          persona: input.persona,
          copilotAccessMode: input.copilotAccessMode,
          copilotScopes: input.copilotScopes,
          instructions: input.instructions.trim(),
          model: input.model.trim(),
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    });
  }

  deleteAgent(id: string) {
    return this.change((state) => {
      state.agents = state.agents.filter((agent) => agent.id !== id);
      for (const project of state.projects ?? []) if (project.agentId === id) delete project.agentId;
      state.conversations = state.conversations.filter((conversation) => conversation.agentId !== id);
      state.tasks = state.tasks.filter((task) => task.agentId !== id);
      state.workflows = state.workflows.filter((workflow) => workflow.agentId !== id);
    });
  }

  saveSkill(input: SkillInput) {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("Skill slug must use lowercase letters, numbers, and hyphens");
    if (!input.name.trim() || !input.instructions.trim()) throw new Error("Skill name and instructions are required");
    const timestamp = now();
    return this.change((state) => {
      const skills = state.skills ?? (state.skills = []);
      if (skills.some((skill) => skill.slug === slug && skill.id !== input.id)) throw new Error("A local skill already uses that slug");
      const existing = input.id ? skills.find((skill) => skill.id === input.id) : undefined;
      const update = {
        slug,
        name: input.name.trim(),
        description: input.description.trim(),
        instructions: input.instructions.trim(),
        triggers: input.triggers.map((trigger) => trigger.trim()).filter(Boolean),
        tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
        ...(input.assignedAgentIds !== undefined ? { assignedAgentIds: input.assignedAgentIds.filter((id) => state.agents.some((agent) => agent.id === id)) } : {}),
        updatedAt: timestamp,
      };
      if (existing) Object.assign(existing, update);
      else skills.push({ id: randomUUID(), ...update, createdAt: timestamp });
    });
  }

  deleteSkill(id: string) {
    return this.change((state) => { state.skills = (state.skills ?? []).filter((skill) => skill.id !== id); });
  }

  setSkillAgentAvailability(skillId: string, agentId: string, enabled: boolean) {
    return this.change((state) => {
      const skill = state.skills?.find((entry) => entry.id === skillId);
      if (!skill) throw new Error("Local skill not found");
      if (!state.agents.some((agent) => agent.id === agentId)) throw new Error("Local agent not found");
      const current = skill.assignedAgentIds ?? state.agents.map((agent) => agent.id);
      skill.assignedAgentIds = enabled ? [...new Set([...current, agentId])] : current.filter((id) => id !== agentId);
      skill.updatedAt = now();
    });
  }

  async listModels(url?: string) {
    const state = this.store.get();
    const response = await fetch(`${ensureLoopback(url ?? state.settings.ollamaUrl)}/api/tags`, {
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Local model server returned ${response.status}`);
    const payload = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    return (payload.models ?? []).map((model) => model.name ?? model.model ?? "").filter(Boolean);
  }

  downloadModel(name: string): Promise<void> {
    const model = name.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(model) || model.length > 120 || model.includes("..") || model.includes("//")) {
      throw new Error("Enter a valid Ollama model name.");
    }
    if (this.modelDownload) throw new Error("A model download is already in progress.");
    const publish = (status: string, progress: number | undefined, done: boolean, error?: string) => this.emit({ type: "model-download", download: { name: model, status, progress, done, error } });
    const run = async () => {
      const endpoint = ensureLoopback(this.store.get().settings.ollamaUrl);
      publish("Connecting to model registry", 0, false);
      try {
        const response = await fetch(`${endpoint}/api/pull`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: model, stream: true }), signal: AbortSignal.timeout(60 * 60_000) });
        if (!response.ok || !response.body) throw new Error(`Model server returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let complete = false;
        const accept = (line: string) => {
          if (!line.trim()) return;
          const item = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (item.error) throw new Error(item.error);
          const progress = item.total && item.completed !== undefined ? Math.min(1, item.completed / item.total) : undefined;
          if (item.status === "success") complete = true;
          publish(item.status || "Downloading", progress, false);
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            accept(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
          }
        }
        accept(buffer + decoder.decode());
        if (!complete) throw new Error("The model download ended before Ollama confirmed it was ready.");
        publish("Ready", 1, true);
      } catch (error) {
        publish("Download failed", undefined, true, error instanceof Error ? error.message : String(error));
        throw error;
      }
    };
    this.modelDownload = run().finally(() => { this.modelDownload = undefined; });
    return this.modelDownload;
  }

  updateSettings(settings: Partial<LocalState["settings"]>) {
    return this.change((state) => {
      if (settings.ollamaUrl !== undefined) state.settings.ollamaUrl = ensureLoopback(settings.ollamaUrl);
      if (settings.defaultModel !== undefined) {
        const previous = state.settings.defaultModel;
        state.settings.defaultModel = settings.defaultModel.trim();
        for (const agent of state.agents) {
          if ((agent.id === "commons-local" || agent.id === "local-copilot") && (!agent.model || agent.model === previous)) agent.model = state.settings.defaultModel;
        }
      }
      if (settings.permissionMode !== undefined) state.settings.permissionMode = settings.permissionMode;
      if (settings.webSearchUrl !== undefined) {
        const previous = state.settings.webSearchUrl;
        const input = settings.webSearchUrl.trim();
        if (input) {
          const url = new URL(input);
          if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
            throw new Error("Use an HTTPS search endpoint, or an HTTP endpoint on this computer.");
          }
          state.settings.webSearchUrl = `${url.origin}${url.pathname.replace(/\/$/, "")}`;
        } else state.settings.webSearchUrl = undefined;
        if (previous !== state.settings.webSearchUrl && settings.webSearchApiKey === undefined) state.settings.webSearchApiKey = undefined;
      }
      if (settings.webSearchApiKey !== undefined) state.settings.webSearchApiKey = settings.webSearchApiKey.trim().slice(0, 512) || undefined;
      if (settings.transcriptionModel !== undefined) {
        if (!["Xenova/whisper-tiny", "Xenova/whisper-base", "Xenova/whisper-small"].includes(settings.transcriptionModel)) throw new Error("Choose a supported speech model.");
        state.settings.transcriptionModel = settings.transcriptionModel;
      }
      if (settings.imageModel !== undefined) {
        if (!this.imageManager.listModels().some((model) => model.id === settings.imageModel)) throw new Error("Choose an installed image model.");
        state.settings.imageModel = settings.imageModel;
      }
      if (settings.voiceModel !== undefined) {
        if (!LOCAL_VOICES.some((voice) => voice.id === settings.voiceModel)) throw new Error("Choose a supported voice model.");
        state.settings.voiceModel = settings.voiceModel;
      }
      if (settings.mcpServers !== undefined) {
        if (!Array.isArray(settings.mcpServers) || settings.mcpServers.length > 8) throw new Error("Configure up to eight Local MCP servers.");
        state.settings.mcpServers = settings.mcpServers.map((server) => {
          const url = new URL(server.url);
          if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
            throw new Error("MCP endpoints must use HTTPS or HTTP on this computer, without URL credentials or query parameters.");
          }
          if (!/^[a-zA-Z0-9_-]{1,40}$/.test(server.id) || !server.name?.trim() || server.name.length > 80) throw new Error("Each MCP server needs a short name and ID.");
          return { id: server.id, name: server.name.trim(), url: url.toString(), apiKey: server.apiKey?.trim().slice(0, 512) || undefined, mode: server.mode === "write" ? "write" as const : "read" as const, enabled: Boolean(server.enabled) };
        });
        if (new Set(state.settings.mcpServers.map((server) => server.id)).size !== state.settings.mcpServers.length) throw new Error("MCP server IDs must be unique.");
      }
    });
  }

  private async connectMcpServers(conversationId: string, selectedIds: string[] | undefined) {
    const configured = this.store.get().settings.mcpServers ?? [];
    const selected = configured.filter((server) => server.enabled && selectedIds?.includes(server.id)).slice(0, 8);
    const tools = new Map<string, RemoteMcpTool>();
    if (!selected.length) return tools;
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    for (const [index, server] of selected.entries()) {
      const approved = await this.requestApproval(`Connect to MCP server ${server.name} at ${server.url} and discover its tool names${server.apiKey ? " using the saved API key" : ""}.`, `mcp_connect:${server.id}`, { conversationId });
      if (!approved) continue;
      const client = new Client({ name: "agent-commons-local", version: "0.4.0" });
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: server.apiKey ? { headers: { Authorization: `Bearer ${server.apiKey}` } } : undefined }));
        const catalog = await client.listTools(undefined, { timeout: 10_000 });
        for (const tool of catalog.tools.slice(0, 20)) {
          const readOnly = tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true;
          if (!readOnly && (server.mode !== "write" || this.store.get().settings.permissionMode === "read-only")) continue;
          const name = `mcp_${index}_${String(tool.name).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48)}`;
          tools.set(name, { client, server, name: tool.name, description: tool.description || `${server.name} tool`, parameters: tool.inputSchema as Record<string, unknown>, readOnly });
        }
        if (![...tools.values()].some((tool) => tool.client === client)) await client.close();
      } catch (error) {
        await client.close().catch(() => undefined);
        this.emit({ type: "activity", label: `${server.name} could not connect`, detail: error instanceof Error ? error.message : String(error), status: "error", conversationId });
      }
    }
    return tools;
  }

  createConversation(agentId: string, title: string, projectId?: string) {
    const state = this.store.get();
    if (!state.agents.some((agent) => agent.id === agentId)) throw new Error("Local agent not found");
    if (projectId && !state.projects?.some((project) => project.id === projectId)) throw new Error("Local project not found");
    const timestamp = now();
    const conversation: LocalConversation = {
      id: randomUUID(), agentId, title: title.trim().slice(0, 160) || "New chat",
      workspaceRoot: homedir(), messages: [], createdAt: timestamp, updatedAt: timestamp,
      ...(projectId ? { projectId } : {}),
    };
    this.change((draft) => {
      draft.conversations.unshift(conversation);
      const project = draft.projects?.find((entry) => entry.id === projectId);
      if (project) project.updatedAt = timestamp;
    });
    return conversation;
  }

  saveProject(input: ProjectInput) {
    const timestamp = now();
    let savedId = input.id;
    const state = this.change((draft) => {
      const projects = draft.projects ?? (draft.projects = []);
      const existing = input.id ? projects.find((project) => project.id === input.id) : undefined;
      if (input.id && !existing) throw new Error("Local project not found");
      const spaceIds = input.spaceIds?.filter((id) => draft.spaces.some((space) => space.id === id));
      const libraryItemIds = input.libraryItemIds?.filter((id) => draft.library?.some((item) => item.id === id));
      const agentId = input.agentId === null ? undefined : input.agentId && draft.agents.some((agent) => agent.id === input.agentId) ? input.agentId : existing?.agentId;
      if (existing) {
        if (input.name !== undefined) existing.name = input.name.trim().slice(0, 120) || existing.name;
        if (input.description !== undefined) existing.description = input.description.trim().slice(0, 2_000);
        if (input.instructions !== undefined) existing.instructions = input.instructions.trim().slice(0, 20_000);
        if (spaceIds) existing.spaceIds = [...new Set(spaceIds)];
        if (libraryItemIds) existing.libraryItemIds = [...new Set(libraryItemIds)];
        if (input.agentId !== undefined) existing.agentId = agentId;
        if (input.pinned !== undefined) existing.pinned = input.pinned;
        existing.updatedAt = timestamp;
      } else {
        const name = input.name?.trim().slice(0, 120);
        if (!name) throw new Error("Project name is required");
        savedId = randomUUID();
        projects.unshift({
          id: savedId,
          name,
          description: input.description?.trim().slice(0, 2_000) || undefined,
          instructions: input.instructions?.trim().slice(0, 20_000) || undefined,
          spaceIds: [...new Set(spaceIds ?? [])],
          libraryItemIds: [...new Set(libraryItemIds ?? [])],
          agentId,
          pinned: input.pinned,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    });
    return state.projects!.find((project) => project.id === savedId)!;
  }

  deleteProject(id: string) {
    return this.change((state) => {
      if (!state.projects?.some((project) => project.id === id)) throw new Error("Local project not found");
      state.projects = state.projects.filter((project) => project.id !== id);
      // Chats stay available; they simply leave the project.
      for (const conversation of state.conversations) if (conversation.projectId === id) delete conversation.projectId;
    });
  }

  moveConversationToProject(conversationId: string, projectId: string | null) {
    return this.change((state) => {
      const conversation = state.conversations.find((entry) => entry.id === conversationId);
      if (!conversation) throw new Error("Local conversation not found");
      if (projectId && !state.projects?.some((project) => project.id === projectId)) throw new Error("Local project not found");
      if (projectId) conversation.projectId = projectId;
      else delete conversation.projectId;
    });
  }

  steerConversation(conversationId: string, prompt: string) {
    const text = prompt.trim();
    if (!text || text.length > 8_000) throw new Error("A prompt up to 8,000 characters is required.");
    if (!this.activeConversations.has(conversationId)) throw new Error("This Local agent is no longer working. Send a new message instead.");
    const queued = this.pendingSteers.get(conversationId) ?? [];
    if (queued.length >= 8) throw new Error("Wait for the agent to work through the prompts already sent.");
    this.change((state) => {
      const conversation = state.conversations.find((entry) => entry.id === conversationId);
      if (!conversation) throw new Error("Local conversation not found");
      conversation.messages.push({ id: randomUUID(), role: "user", content: text, createdAt: now() });
      conversation.updatedAt = now();
    });
    this.pendingSteers.set(conversationId, [...queued, text]);
  }

  async sendMessage(input: ChatRequest): Promise<ChatResult> {
    const state = this.store.get();
    const agent = state.agents.find((candidate) => candidate.id === input.agentId);
    if (!agent) throw new Error("Choose a local agent first");
    if (!input.prompt.trim()) throw new Error("Message is empty");
    const directNameRequest = assistantIdentityRequestKind(input.prompt) === "name";
    let available: string[] = directNameRequest ? [] : await this.listModels().catch(() => []);
    if (!available.length && !directNameRequest && state.settings.ollamaUrl === "http://127.0.0.1:11434") {
      await this.prepareLocalModel();
      available = await this.listModels();
    }
    if (!available.length && !directNameRequest) throw new Error("No model is available at the configured local model server. Check the Local model server address in Settings.");
    const attachments = (input.attachmentIds ?? []).slice(0, 20).map((id) => {
      const item = state.library?.find((entry) => entry.id === id);
      if (!item) throw new Error("An attached file is no longer in the Local Library. Remove it and attach it again.");
      return { id: item.id, name: item.name, mimeType: item.mimeType, sizeBytes: existsSync(item.path) ? statSync(item.path).size : undefined };
    });
    if (input.projectId && !state.projects?.some((project) => project.id === input.projectId)) throw new Error("Local project not found");
    const explicitModel = agent.model?.trim();
    const isCopilot = agent.id === "local-copilot" || agent.id === "commons-local" || agent.name === "Commons Copilot";
    if (explicitModel && !available.includes(explicitModel) && !isCopilot && !directNameRequest) {
      throw new Error(`The model ${explicitModel} is not installed on this computer. Choose an installed model in Private settings.`);
    }
    const selectedModel = explicitModel && available.includes(explicitModel)
      ? explicitModel
      : available.includes(state.settings.defaultModel) ? state.settings.defaultModel : available[0] ?? state.settings.defaultModel;
    if (state.settings.defaultModel !== selectedModel || (isCopilot && agent.model !== selectedModel)) {
      this.change((draft) => {
        draft.settings.defaultModel = selectedModel;
        const copilot = draft.agents.find((candidate) => candidate.id === agent.id);
        if (copilot && isCopilot) copilot.model = selectedModel;
      });
    }
    const runningAgent = { ...agent, model: selectedModel };

    const timestamp = now();
    let conversation = input.conversationId
      ? state.conversations.find((candidate) => candidate.id === input.conversationId)
      : undefined;
    if (input.conversationId && !conversation) throw new Error("This Local conversation could not be found. Open a saved conversation or start a new one.");
    if (conversation && conversation.agentId !== agent.id) throw new Error("This Local conversation belongs to a different agent.");
    const firstTurn = !conversation || conversation.messages.length === 0;
    if (!conversation) {
      conversation = {
        id: randomUUID(),
        agentId: agent.id,
        title: "New chat",
        workspaceRoot: input.workspaceRoot === null ? undefined : input.workspaceRoot || homedir(),
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(input.projectId ? { projectId: input.projectId } : {}),
      };
      this.change((draft) => draft.conversations.unshift(conversation!));
    }
    const conversationId = conversation.id;
    if (this.activeConversations.has(conversationId)) throw new Error("This agent is already working in this conversation. Add a prompt to the running work instead.");
    this.change((draft) => {
      const current = draft.conversations.find((candidate) => candidate.id === conversationId)!;
      if (input.workspaceRoot === null) current.workspaceRoot = undefined;
      else if (input.workspaceRoot) current.workspaceRoot = input.workspaceRoot;
      if (input.spaceIds !== undefined) current.spaceIds = input.spaceIds;
      current.webSearchEnabled = Boolean(input.webSearchEnabled);
      current.messages.push({ id: randomUUID(), role: "user", content: input.prompt.trim(), createdAt: timestamp, ...(attachments.length ? { attachments } : {}) });
      current.updatedAt = timestamp;
      const project = draft.projects?.find((entry) => entry.id === current.projectId);
      if (project) project.updatedAt = timestamp;
    });

    if (input.interactive) this.emit({ type: "chat-start", conversationId });
    this.emit({ type: "activity", label: `${agent.name} is thinking`, status: "running" });
    this.activeConversations.add(conversationId);
    try {
      const mcpTools = await this.connectMcpServers(conversationId, input.mcpServerIds);
      this.activeMcpTools.set(conversationId, mcpTools);
      const response = await this.runAgent(runningAgent, conversationId, input.spaceIds, input.interactive);
      this.activeConversations.delete(conversationId);
      const finalState = this.change((draft) => {
        const current = draft.conversations.find((candidate) => candidate.id === conversationId)!;
        current.messages.push({ id: randomUUID(), role: "assistant", content: response, createdAt: now() });
        current.updatedAt = now();
      });
      if (firstTurn) {
        void this.generateLocalTitle(input.prompt, response, selectedModel, state.settings.ollamaUrl)
          .then((title) => this.change((draft) => {
            const current = draft.conversations.find((candidate) => candidate.id === conversationId);
            if (current?.title === "New chat") current.title = title;
          }))
          .catch(() => undefined);
      }
      this.emit({ type: "activity", label: `${agent.name} finished`, status: "done" });
      if (input.interactive) this.emit({ type: "chat-end", conversationId });
      return {
        conversation: finalState.conversations.find((candidate) => candidate.id === conversationId)!,
        response,
      };
    } catch (error) {
      if (input.interactive) this.emit({ type: "chat-end", conversationId });
      this.emit({
        type: "activity",
        label: `${agent.name} stopped`,
        detail: error instanceof Error ? error.message : String(error),
        status: "error",
      });
      throw error;
    } finally {
      const mcpTools = this.activeMcpTools.get(conversationId);
      this.activeMcpTools.delete(conversationId);
      if (mcpTools) for (const client of new Set([...mcpTools.values()].map((tool) => tool.client))) void client.close().catch(() => undefined);
      this.activeConversations.delete(conversationId);
      this.pendingSteers.delete(conversationId);
    }
  }

  private async generateLocalTitle(prompt: string, answer: string, model: string, ollamaUrl: string) {
    try {
      const response = await fetch(`${ensureLoopback(ollamaUrl)}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: false, messages: [
          { role: "system", content: "Write a specific title of at most six words for this conversation. Return only the title, with no quotes or punctuation." },
          { role: "user", content: `Request: ${prompt.slice(0, 800)}\nAnswer: ${answer.slice(0, 350)}` },
        ], options: { temperature: 0.2, num_ctx: 2048, num_predict: 32 } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Title model unavailable");
      const payload = await response.json() as { message?: { content?: string } };
      const title = String(payload.message?.content ?? "").replace(/^[\s"'`#*-]+|[\s"'`#*.!]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (title) return title.split(" ").slice(0, 6).join(" ");
    } catch { /* Keep the conversation usable if title generation fails. */ }
    if (/\b(?:pdf|document|paper|report|file)\b/i.test(prompt)) return /summari[sz]|key points/i.test(prompt) ? "Document Summary" : "Document Analysis";
    if (/\b(?:bug|fix|debug|code|function|build|app)\b/i.test(prompt)) return "Development Task";
    if (/\b(?:project|plan|strategy)\b/i.test(prompt)) return "Project Planning";
    return "New Conversation";
  }

  deleteConversation(id: string) {
    return this.change((state) => {
      state.conversations = state.conversations.filter((conversation) => conversation.id !== id);
    });
  }

  renameConversation(id: string, title: string) {
    const name = title.trim().slice(0, 160);
    if (!name) throw new Error("Conversation title is required");
    return this.change((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === id);
      if (!conversation) throw new Error("Local conversation not found");
      conversation.title = name;
      conversation.updatedAt = now();
    });
  }

  setConversationWebSearch(id: string, enabled: boolean) {
    return this.change((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === id);
      if (!conversation) throw new Error("Local conversation not found");
      if (enabled && !hasConfiguredLocalWebSearch(state.settings)) throw new Error("Configure a search provider before turning on Web search.");
      conversation.webSearchEnabled = enabled;
      conversation.updatedAt = now();
    });
  }

  private webSearchAllowed(conversationId: string) {
    const state = this.store.get();
    return Boolean(hasConfiguredLocalWebSearch(state.settings) && state.conversations.find((conversation) => conversation.id === conversationId)?.webSearchEnabled);
  }

  async addKnowledgeSpace(name: string, folders: string[], options: { description?: string; autoGrantNewAgents?: boolean } = {}) {
    if (!name.trim()) throw new Error("A name is required");
    const id = randomUUID();
    const linked = folders.length > 0;
    const sources = linked ? folders : [this.layout.path("knowledge", id)];
    if (!linked) mkdirSync(sources[0], { recursive: true, mode: 0o700 });
    const files = await indexFolders(sources);
    const git = linked ? gitInfo(sources[0]) : undefined;
    const state = this.change((draft) => {
      draft.spaces.push({
        id, name: name.trim(), description: options.description || undefined, folders: sources, files, indexedAt: now(),
        linked, liveSync: linked ? true : undefined, source: git ? { git } : undefined,
        autoGrantNewAgents: options.autoGrantNewAgents ?? true, grants: [],
      });
    });
    this.syncWatchers();
    return state;
  }

  /**
   * Reindexes one space. Unchanged files are reused, concurrent requests share
   * one pass, and the state is only rewritten when something changed.
   */
  async reindexKnowledgeSpace(id: string) {
    const running = this.reindexing.get(id);
    if (running) return running;
    const task = (async () => {
      const space = this.store.get().spaces.find((candidate) => candidate.id === id);
      if (!space) throw new Error("Knowledge Space not found");
      const files = await indexFolders(space.folders, space.files);
      const git = space.linked ? gitInfo(space.folders[0]) : undefined;
      const unchanged = files.length === space.files.length &&
        files.every((file, index) => file.path === space.files[index]?.path && file.modifiedAt === space.files[index]?.modifiedAt && file.size === space.files[index]?.size) &&
        JSON.stringify(git ?? null) === JSON.stringify(space.source?.git ?? null);
      if (unchanged) return this.store.get();
      return this.change((state) => {
        const current = state.spaces.find((candidate) => candidate.id === id);
        if (!current) return;
        current.files = files;
        current.indexedAt = now();
        current.source = git ? { git } : undefined;
      });
    })();
    this.reindexing.set(id, task);
    try { return await task; } finally { this.reindexing.delete(id); }
  }

  removeKnowledgeSpace(id: string) {
    const state = this.change((draft) => {
      draft.spaces = draft.spaces.filter((space) => space.id !== id);
      for (const project of draft.projects ?? []) project.spaceIds = project.spaceIds.filter((spaceId) => spaceId !== id);
    });
    this.syncWatchers();
    return state;
  }

  updateKnowledgeSpace(id: string, patch: { autoGrantNewAgents?: boolean; name?: string; description?: string; liveSync?: boolean }) {
    const state = this.change((draft) => {
      const space = draft.spaces.find((entry) => entry.id === id);
      if (!space) throw new Error("Knowledge Space not found");
      if (patch.autoGrantNewAgents !== undefined) space.autoGrantNewAgents = patch.autoGrantNewAgents;
      if (patch.name !== undefined && patch.name.trim()) space.name = patch.name.trim().slice(0, 120);
      if (patch.description !== undefined) space.description = patch.description.trim().slice(0, 2_000) || undefined;
      if (patch.liveSync !== undefined && space.linked) space.liveSync = patch.liveSync;
    });
    this.syncWatchers();
    return state;
  }

  saveKnowledgeGrant(spaceId: string, input: { subjectType: "agent" | "user" | "workspace"; subjectId: string; permission: "read" | "write" | "manage"; autoRetrieve: boolean }) {
    return this.change((state) => {
      const space = state.spaces.find((entry) => entry.id === spaceId);
      if (!space) throw new Error("Knowledge Space not found");
      const grants = space.grants ?? (space.grants = []);
      const existing = grants.find((entry) => entry.subjectType === input.subjectType && entry.subjectId === input.subjectId);
      if (existing) Object.assign(existing, input);
      else grants.push({ id: randomUUID(), ...input });
    });
  }

  removeKnowledgeGrant(spaceId: string, grantId: string) {
    return this.change((state) => {
      const space = state.spaces.find((entry) => entry.id === spaceId);
      if (!space) throw new Error("Knowledge Space not found");
      space.grants = (space.grants ?? []).filter((entry) => entry.id !== grantId);
    });
  }

  saveTask(input: TaskInput) {
    const timestamp = now();
    return this.change((state) => {
      const existing = input.id ? state.tasks.find((task) => task.id === input.id) : undefined;
      if (existing) Object.assign(existing, input, { updatedAt: timestamp });
      else state.tasks.unshift({ ...input, id: randomUUID(), status: "pending", createdAt: timestamp, updatedAt: timestamp });
    });
  }

  cancelTask(id: string) {
    return this.change((state) => {
      const task = state.tasks.find((candidate) => candidate.id === id);
      if (!task) throw new Error("Local task not found");
      if (task.status === "running") throw new Error("This task is running and cannot be cancelled until its current step finishes.");
      task.status = "cancelled";
      task.updatedAt = now();
    });
  }

  async runTask(id: string) {
    const task = this.store.get().tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error("Task not found");
    this.change((state) => Object.assign(state.tasks.find((candidate) => candidate.id === id)!, { status: "running", updatedAt: now() }));
    try {
      const result = await this.sendMessage({ agentId: task.agentId, conversationId: task.sessionId, prompt: task.prompt, workspaceRoot: task.workspaceRoot });
      return this.change((state) => {
        const current = state.tasks.find((candidate) => candidate.id === id)!;
        Object.assign(current, { status: "completed", result: result.response, updatedAt: now() });
        if (current.repeat) {
          // Keep the same cadence from the scheduled time, skipping missed runs.
          const step = current.repeat === "daily" ? 86_400_000 : 7 * 86_400_000;
          let next = Date.parse(current.dueAt ?? now()) + step;
          while (next <= Date.now()) next += step;
          Object.assign(current, { status: "pending", dueAt: new Date(next).toISOString() });
        }
      });
    } catch (error) {
      this.change((state) => Object.assign(state.tasks.find((candidate) => candidate.id === id)!, {
        status: "failed", result: error instanceof Error ? error.message : String(error), updatedAt: now(),
      }));
      throw error;
    }
  }

  deleteTask(id: string) {
    return this.change((state) => { state.tasks = state.tasks.filter((task) => task.id !== id); });
  }

  saveWorkflow(input: WorkflowInput) {
    const timestamp = now();
    return this.change((state) => {
      const existing = input.id ? state.workflows.find((workflow) => workflow.id === input.id) : undefined;
      if (existing) Object.assign(existing, input, { updatedAt: timestamp });
      else state.workflows.unshift({ ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp });
    });
  }

  async runWorkflow(id: string, inputData?: Record<string, unknown>) {
    const workflow = this.store.get().workflows.find((candidate) => candidate.id === id);
    if (!workflow) throw new Error("Workflow not found");
    const hasGraph = Array.isArray(workflow.definition?.nodes) && workflow.definition.nodes.length > 0;
    const plan = hasGraph
      ? compileLocalWorkflow(workflow.definition, workflow.agentId)
      : workflow.steps.map((prompt, index) => ({ nodeId: `step-${index}`, agentId: workflow.agentId, prompt }));
    if (!plan.length) throw new Error("Add an agent step before running this Local workflow.");
    for (const step of plan) {
      if (!this.store.get().agents.some((agent) => agent.id === step.agentId)) {
        throw new Error(`The Local agent for workflow node ${step.nodeId} is unavailable.`);
      }
    }
    const executionId = randomUUID();
    this.change((state) => {
      const current = state.workflows.find((candidate) => candidate.id === id)!;
      current.lastRun = { executionId, status: "running", startedAt: now() };
    });
    let context = "";
    const hasInput = inputData && Object.keys(inputData).length > 0;
    try {
      for (const [index, step] of plan.entries()) {
        const prompt = context
          ? `${step.prompt}\n\nPrevious step result:\n${context}`
          : hasInput ? `${step.prompt}\n\nWorkflow input:\n${JSON.stringify(inputData)}` : step.prompt;
        this.change((state) => { state.workflows.find((candidate) => candidate.id === id)!.lastRun!.currentNode = step.nodeId; });
        this.emit({ type: "activity", label: `${workflow.name}: step ${index + 1}/${plan.length}`, status: "running" });
        context = (await this.sendMessage({ agentId: step.agentId, prompt, workspaceRoot: workflow.workspaceRoot })).response;
      }
      return this.change((state) => {
        const current = state.workflows.find((candidate) => candidate.id === id)!;
        current.lastResult = context;
        current.lastRun = { ...current.lastRun!, status: "completed", completedAt: now(), outputData: context, currentNode: undefined };
        current.updatedAt = now();
      });
    } catch (error) {
      this.change((state) => {
        const current = state.workflows.find((candidate) => candidate.id === id)!;
        current.lastRun = { ...current.lastRun!, status: "failed", completedAt: now(), errorMessage: error instanceof Error ? error.message : String(error), currentNode: undefined };
        current.updatedAt = now();
      });
      throw error;
    }
  }

  deleteWorkflow(id: string) {
    return this.change((state) => { state.workflows = state.workflows.filter((workflow) => workflow.id !== id); });
  }

  saveApp(input: AppInput) {
    const timestamp = now();
    const command = input.command?.trim() ?? "";
    // Built folders are served by Commons on a loopback port chosen at start.
    const previewUrl = command ? ensureLocalPreview(input.previewUrl).toString() : "http://127.0.0.1/";
    return this.change((state) => {
      const existing = input.id ? state.apps.find((app) => app.id === input.id) : undefined;
      if (existing) Object.assign(existing, input, { command, previewUrl, updatedAt: timestamp });
      else state.apps.unshift({ ...input, command, args: input.args ?? [], previewUrl, id: randomUUID(), status: "stopped", createdAt: timestamp, updatedAt: timestamp });
    });
  }

  /** Writes a published Cloud app's files into the Local workspace and registers it. */
  importCloudApp(input: { pluginId: string; name: string; description?: string; manifest?: Record<string, unknown>; files: Array<{ path: string; bytes: Uint8Array }> }) {
    const existing = this.store.get().apps.find((app) => app.cloudPluginId === input.pluginId);
    const directory = existing?.directory ?? this.layout.path("apps", `cloud-${input.pluginId.replace(/[^a-zA-Z0-9_-]/g, "")}`);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const file of input.files) {
      const target = safePath(directory, file.path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, file.bytes, { mode: 0o600 });
    }
    return this.saveApp({
      id: existing?.id, name: input.name, description: input.description, directory,
      command: "", args: [], previewUrl: "", cloudPluginId: input.pluginId, manifest: input.manifest,
    });
  }

  async startApp(id: string) {
    const app = this.store.get().apps.find((candidate) => candidate.id === id);
    if (!app) throw new Error("Local app not found");
    if (!app.command) {
      this.staticApps.get(id)?.close();
      const server = await serveStaticApp(app.directory);
      this.staticApps.set(id, server);
      return this.change((state) => Object.assign(state.apps.find((candidate) => candidate.id === id)!, {
        status: "running", previewUrl: `${server.origin}/`, output: undefined, updatedAt: now(),
      }));
    }
    const config = this.toolsConfig(app.directory, undefined, undefined);
    const raw = await runLocalTool({ tool: "start_process", args: { command: app.command, args: app.args, cwd: "." } }, config);
    const result = JSON.parse(raw) as { processId?: string; error?: string };
    if (!result.processId) throw new Error(result.error ?? "Could not start app");
    this.appProcesses.set(id, result.processId);
    return this.change((state) => Object.assign(state.apps.find((candidate) => candidate.id === id)!, {
      status: "running", output: raw, updatedAt: now(),
    }));
  }

  async stopApp(id: string) {
    this.staticApps.get(id)?.close();
    this.staticApps.delete(id);
    const processId = this.appProcesses.get(id);
    if (processId) {
      const app = this.store.get().apps.find((candidate) => candidate.id === id);
      if (app) await runLocalTool({ tool: "kill_process", args: { processId } }, this.toolsConfig(app.directory));
      this.appProcesses.delete(id);
    }
    return this.change((state) => Object.assign(state.apps.find((candidate) => candidate.id === id)!, {
      status: "stopped", updatedAt: now(),
    }));
  }

  async deleteApp(id: string) {
    if (this.appProcesses.has(id) || this.staticApps.has(id)) await this.stopApp(id);
    return this.change((state) => { state.apps = state.apps.filter((app) => app.id !== id); });
  }

  getApp(id: string): LocalApp {
    const app = this.store.get().apps.find((candidate) => candidate.id === id);
    if (!app) throw new Error("Local app not found");
    ensureLocalPreview(app.previewUrl);
    return app;
  }

  resolveApproval(id: string, allow: boolean, remember = false) {
    const pending = this.approvals.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.approvals.delete(id);
    if (allow && remember && pending.conversationId) {
      const remembered = this.rememberedApprovals.get(pending.conversationId) ?? new Set<string>();
      remembered.add(pending.permission);
      this.rememberedApprovals.set(pending.conversationId, remembered);
    }
    this.emit({ type: "approval-resolved", id, allow });
    pending.resolve(allow);
  }

  cancelPendingApprovals() {
    for (const [id, pending] of this.approvals) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
      this.approvals.delete(id);
      this.emit({ type: "approval-resolved", id, allow: false });
    }
  }

  close() {
    this.watcher.close();
    for (const server of this.staticApps.values()) server.close();
    clearInterval(this.scheduler);
    this.modelManager.stop();
    this.cancelPendingApprovals();
    stopLocalProcesses();
  }

  private async runDueTasks() {
    const due = this.store.get().tasks.filter((task) =>
      task.status === "pending" && task.dueAt && Date.parse(task.dueAt) <= Date.now(),
    );
    for (const task of due) {
      try {
        await this.runTask(task.id);
      } catch {
        // runTask persists the failure for the user to inspect.
      }
    }
  }

  private async runAgent(agent: LocalAgent, conversationId: string, spaceIds?: string[], interactive = false) {
    const state = this.store.get();
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId)!;
    spaceIds ??= conversation.spaceIds;
    const lastUser = [...conversation.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const identityRequest = assistantIdentityRequestKind(lastUser);
    if (identityRequest === "name") return assistantNameAnswer(agent.name);
    if (identityRequest === "about") return assistantIdentityAnswer(agent.name, agent.model || state.settings.defaultModel);
    const project = conversation.projectId ? state.projects?.find((entry) => entry.id === conversation.projectId) : undefined;
    // Project spaces are always in scope for its chats, alongside any the user picked for this turn.
    const scopedSpaceIds = project?.spaceIds.length
      ? [...new Set([...(spaceIds?.length ? spaceIds : []), ...project.spaceIds])]
      : spaceIds;
    const spaces = accessibleSpaces(state.spaces, agent.id, scopedSpaceIds);
    const knowledge = searchSpaces(spaces, lastUser);
    const lastUserMessage = [...conversation.messages].reverse().find((message) => message.role === "user");
    const attachmentBlocks = await Promise.all((lastUserMessage?.attachments ?? []).slice(0, 3).map(async (attachment) => {
      const item = state.library?.find((entry) => entry.id === attachment.id);
      if (!item) return `- ${attachment.name}: no longer available in the Local Library.`;
      try {
        const text = await readLibraryText(item);
        return `### ${item.name} (itemId: ${item.id})\n${text.slice(0, 2_000)}${text.length > 2_000 ? `\n[Showing 2,000 of ${text.length.toLocaleString()} characters. Use search_library_item to locate relevant passages, then read_library_item with a matching offset for context. Do not read a large document sequentially.]` : ""}`;
      } catch (error) {
        return `### ${item.name} (itemId: ${item.id})\n[Could not read: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }));
    const availableAttachments = [...new Map(conversation.messages.flatMap((message) => message.attachments ?? []).map((attachment) => [attachment.id, attachment])).values()]
      .slice(-20).map((attachment) => `- ${attachment.name} (itemId: ${attachment.id})`);
    const relatedChats = project ? state.conversations.filter((entry) => entry.projectId === project.id && entry.id !== conversationId && entry.messages.length)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8)
      .map((entry) => `- ${entry.title} (sessionId: ${entry.id}): ${entry.messages.find((message) => message.role === "user")?.content.slice(0, 180) ?? ""}`) : [];
    const projectFiles = (project?.libraryItemIds ?? []).flatMap((id) => {
      const item = state.library?.find((entry) => entry.id === id);
      return item ? [`- ${item.name} (itemId: ${item.id}, ${item.mimeType})`] : [];
    });
    const projectBlock = project ? [
      `## Project: ${project.name}`,
      project.description ? `Goal: ${project.description}` : "",
      project.instructions ? `Project instructions (follow them in every chat in this project):\n${project.instructions}` : "",
      relatedChats.length ? `Related project chats. These sessions share project context; use local_read_data for full details when needed:\n${relatedChats.join("\n")}` : "",
      projectFiles.length ? `Project files. Use search_library_item for large files and read_library_item for relevant passages:\n${projectFiles.join("\n")}` : "",
      project.spaceIds.length ? `Project Knowledge Spaces: ${state.spaces.filter((space) => project.spaceIds.includes(space.id)).map((space) => `${space.name} (${space.id})`).join(", ")}. Search them before answering questions about the project.` : "",
    ].filter(Boolean).join("\n") : "";
    const skills = (state.skills ?? []).filter((skill) => skill.assignedAgentIds === undefined || skill.assignedAgentIds.includes(agent.id));
    const skillsBlock = buildSkillPromptIndex(skills, findMatchingSkills(skills, lastUser));
    const workspace = conversation.workspaceRoot;
    const localManifest = workspace
      ? `Workspace: ${workspace}. File paths and command cwd are relative to this folder. If a project is inside this workspace, include its directory in every file path or set cwd on commands. Use cli_list_directory to inspect folders as needed. If a file read fails, inspect the parent folder and retry with the correct relative path; never ask the user to paste a file that is accessible through these tools.
For a large workspace document, use cli_search_file to locate requested sections such as conclusions or recommendations. The first cli_read_file response includes the final 1,500 characters for quick orientation. Do not read a long document sequentially when a targeted search can find the relevant section. Knowledge search applies to indexed Knowledge Spaces, not arbitrary workspace files.
Use cli_run_command for short commands. Use cli_start_process for installs, builds and scaffolding, then cli_wait_for_process until done or error. Never claim completion while a setup process is running. Dev servers may keep running after you verify they are ready.
Commands must be non-interactive: pass the executable as command and arguments as an array. Writes and commands require approval. Use real output to diagnose failures and continue the user's task.`
      : "No workspace folder is selected. Do not call cli_* filesystem or command tools.";
    const system = [
      "You are an AI agent on the Agent Commons platform.",
      buildAgentIdentityPrompt(agent),
      agent.name === "Commons Copilot" ? "You are the user's native Commons Copilot and can work with local agents, skills, tasks, workflows, Knowledge Spaces, apps, and files." : "",
      `Session ID: ${conversationId}`,
      buildWorkspaceModeContext("private-local"),
      `Your assistant identity in this conversation is ${agent.name}. If asked about yourself, answer as ${agent.name} and describe your local capabilities. The underlying model is ${agent.model || state.settings.defaultModel}; mention it as the model powering you, not as your assistant identity.`,
      "For ordinary conversation, answer naturally. Never output JSON describing a tool call or invent a function name. Use only the provided structured tools when an action is needed. If no tool applies, respond in plain language.",
      AUTONOMOUS_EXECUTION_CONTRACT,
      localManifest,
      `Agent Commons Local data is organized at ${this.layout.root}. Use local_list_data and local_read_data to inspect agents, conversations, knowledge, artifacts, apps, skills, tasks, workflows, and uploads. The private state index is outside this workspace and must not be edited directly.`,
      `Available Knowledge Spaces: ${JSON.stringify(spaces.map((space) => ({ spaceId: space.id, name: space.name, documents: space.files.length })))}. Use list_knowledge_spaces, list_knowledge_documents, read_knowledge_document and search_knowledge for knowledge questions. These tools refer to the same spaces shown in the Knowledge page.`,
      "For image requests, use generate_image. The result is saved in this conversation's artifacts and Local Library. Model weights download automatically the first time. Do not claim an image exists unless the tool succeeds.",
      "For spoken audio requests, use generate_audio. The result is a local WAV artifact. Do not claim audio exists unless the tool succeeds.",
      skillsBlock,
      projectBlock,
      availableAttachments.length ? `Files previously attached in this chat remain searchable with search_library_item and readable with read_library_item:\n${availableAttachments.join("\n")}` : "",
      attachmentBlocks.length ? `## Files attached to the latest message\nThe files stay on this computer. Their text is below.\n\n${attachmentBlocks.join("\n\n")}` : "",
      knowledge.length
        ? `Local Knowledge passages (use the Knowledge tools for full documents):\n${knowledge.slice(0, 3).map((entry) => `\nSource: ${entry.source} (lines ${entry.lines}) in ${entry.space}${entry.heading ? ` · ${entry.heading}` : ""}\n${entry.excerpt.slice(0, 600)}`).join("\n")}`
        : "",
      spaces.length || attachmentBlocks.length || projectFiles.length
        ? "Citations: when an answer uses Knowledge passages or files, cite them inline and finish with a Sources list giving each source's file path and line range, for example: [1] research/interviews.md (lines 12-40). Number sources from [1] in the order you first use them. Cite only sources you actually read. If the sources do not support a claim, say so."
        : "",
      `Current runtime: Private Local. Inference model: ${agent.model || state.settings.defaultModel}. Say this explicitly if the user asks about the current mode or model.`,
    ].filter(Boolean).join("\n\n");
    const messages: OllamaMessage[] = [
      { role: "system", content: system },
      ...localChatHistory(conversation.messages).map((message) => ({
        ...message,
        content: message.role === "assistant" && looksLikeModelIdentity(message.content)
          ? assistantIdentityAnswer(agent.name, agent.model || state.settings.defaultModel)
          : message.content,
      })),
    ];
    const endpoint = ensureLoopback(state.settings.ollamaUrl);
    const tools = [
      ...(workspace ? LOCAL_TOOLS : LOCAL_TOOLS.filter((entry) => ["list_knowledge_spaces", "list_knowledge_documents", "read_knowledge_document", "search_knowledge", "web_search", "read_library_item", "search_library_item", "generate_image", "generate_audio", "invoke_skill", "local_list_data", "local_read_data", "local_create_knowledge_space", "local_create_note", "local_save_skill"].includes(entry.function.name)))
        .filter((entry) => entry.function.name !== "invoke_skill" || skills.length > 0),
      ...[...(this.activeMcpTools.get(conversationId)?.entries() ?? [])].map(([name, tool]) => ({ type: "function", function: { name, description: `${tool.server.name}: ${tool.description}`, parameters: tool.parameters } })),
    ];

    let repairAttempted = false;
    let identityRepairAttempted = false;
    for (let turn = 0; turn < 64; turn += 1) {
      const beforeStep = this.pendingSteers.get(conversationId)?.splice(0) ?? [];
      if (beforeStep.length) {
        messages.push(...beforeStep.map((content): OllamaMessage => ({ role: "user", content })));
        if (interactive) this.emit({ type: "chat-token", conversationId, content: "" });
      }
      compactToolLoop(messages);
      const response = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: agent.model || state.settings.defaultModel, messages, tools: repairAttempted ? [] : tools.filter((entry) => entry.function.name !== "web_search" || this.webSearchAllowed(conversationId)), stream: true, options: { temperature: 0.3, num_ctx: LOCAL_CONTEXT_SIZE } }),
        signal: AbortSignal.timeout(10 * 60_000),
      });
      const message = await readOllamaChatResponse(response, interactive && !identityRequest ? (content) => {
        const trimmed = content.trimStart();
        if (trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("```")) {
          this.emit({ type: "chat-token", conversationId, content });
        }
      } : undefined);
      const afterStep = this.pendingSteers.get(conversationId)?.splice(0) ?? [];
      if (afterStep.length) {
        messages.push(...afterStep.map((content): OllamaMessage => ({ role: "user", content })));
        if (interactive) this.emit({ type: "chat-token", conversationId, content: "" });
        continue;
      }
      messages.push(message);
      const calls = message.tool_calls ?? [];
      if (calls.length && interactive) this.emit({ type: "chat-token", conversationId, content: "" });
      if (!calls.length) {
        const fallback = extractToolCall(message.content ?? "");
        if (!fallback) {
          if ((identityRequest && (looksLikeModelIdentity(message.content ?? "") || !(message.content ?? "").toLowerCase().includes(agent.name.toLowerCase()))) ||
              (looksLikeModelIdentity(message.content ?? "") && !/\b(?:model|llm|engine|provider)\b/i.test(lastUser))) {
            if (identityRepairAttempted) {
              return assistantIdentityAnswer(agent.name, agent.model || state.settings.defaultModel);
            }
            identityRepairAttempted = true;
            messages.push({ role: "system", content: `You described the underlying model instead of your assistant identity. Answer the user's question as ${agent.name}. You are an Agent Commons assistant running in Private Local mode. You may mention the model as what powers you, but do not introduce yourself as the model.` });
            continue;
          }
          if (looksLikeInventedToolCall(message.content ?? "")) {
            if (interactive) this.emit({ type: "chat-token", conversationId, content: "" });
            if (repairAttempted) throw new Error("The local model repeatedly returned an invented tool call. Try a stronger tool-capable model in Private settings.");
            repairAttempted = true;
            messages.push({ role: "system", content: "Your previous response was an invented function call. The user needs a natural language answer. Reply directly, without JSON or code fences." });
            continue;
          }
          if (!message.content?.trim()) throw new Error("The local model returned no answer. Tool results are saved; send a follow-up to continue or select another local model.");
          return message.content.trim();
        }
        if (interactive) this.emit({ type: "chat-token", conversationId, content: "" });
        if (!supportedToolNames.has(fallback.tool) && supportedToolNames.has(`cli_${fallback.tool}`)) fallback.tool = `cli_${fallback.tool}`;
        if (!supportedToolNames.has(fallback.tool) && !this.activeMcpTools.get(conversationId)?.has(fallback.tool)) {
          if (repairAttempted) throw new Error("The local model repeatedly called an unavailable tool. Try a stronger tool-capable model.");
          repairAttempted = true;
          messages.push({ role: "system", content: `The tool ${fallback.tool} does not exist. Reply to the user's request in plain language, or use a provided structured tool.` });
          continue;
        }
        messages[messages.length - 1] = { role: "assistant", content: "", tool_calls: [{ function: { name: fallback.tool, arguments: fallback.args } }] };
        const result = await this.executeTool(fallback.tool, fallback.args, workspace, conversationId, spaceIds);
        messages.push(toolResult(fallback.tool, result));
        continue;
      }
      repairAttempted = false;
      for (const call of calls) {
        if (!supportedToolNames.has(call.function.name) && !this.activeMcpTools.get(conversationId)?.has(call.function.name)) {
          messages.push(toolResult(call.function.name, `Error: ${call.function.name} is not an available tool.`));
          continue;
        }
        const args = parseToolArguments(call.function.arguments);
        const result = args
          ? await this.executeTool(call.function.name, args, workspace, conversationId, spaceIds)
          : "Error: tool arguments must be a JSON object.";
        messages.push(toolResult(call.function.name, result));
      }
    }
    throw new Error("Local agent reached its tool-call limit. Send a follow-up to continue.");
  }

  private async executeTool(
    name: string,
    args: Record<string, unknown>,
    workspace: string | undefined,
    conversationId: string,
    spaceIds?: string[],
  ) {
    const label = name.replace(/^cli_/, "");
    let commandError: string | undefined;
    if (name === "cli_run_command" || name === "cli_start_process") {
      try { args = normalizeLocalCommand(args); }
      catch (error) { commandError = `Error: ${error instanceof Error ? error.message : String(error)}`; }
    }
    this.emit({ type: "activity", label: label.replaceAll("_", " "), detail: JSON.stringify(args), status: "running", conversationId, toolName: name, args });
    let result: string;
    if (commandError) result = commandError;
    else if (this.activeMcpTools.get(conversationId)?.has(name)) {
      const tool = this.activeMcpTools.get(conversationId)!.get(name)!;
      const outbound = JSON.stringify(args);
      if (outbound.length > 8_000) result = "Error: MCP tool input exceeds the 8,000-character disclosure limit.";
      else if (!tool.readOnly && this.store.get().settings.permissionMode === "read-only") result = "Error: Local workspace is read only.";
      else if (!(await this.requestApproval(`Send to ${tool.server.name} (${tool.server.url}) using ${tool.name}${tool.readOnly ? " [read]" : " [write]"}: ${outbound}${tool.server.apiKey ? "\nThe saved API key is included in the request." : ""}`, `mcp_call:${tool.server.id}:${tool.name}`, { conversationId, toolName: name }))) result = "User denied the MCP tool request.";
      else {
        try { result = JSON.stringify(await tool.client.callTool({ name: tool.name, arguments: args }, undefined, { timeout: 30_000 })); }
        catch (error) { result = `Error: ${error instanceof Error ? error.message : String(error)}`; }
      }
    } else if (name === "generate_audio") {
      if (this.store.get().settings.permissionMode === "read-only") result = "Error: Local workspace is read only. Enable changes in General settings to generate audio.";
      else {
        try {
          const audio = await this.voiceManager.generate(String(args.text ?? ""), this.store.get().settings.voiceModel);
          const id = randomUUID();
          const fileName = `Spoken audio ${now().replace(/[:.]/g, "-")}.wav`;
          const path = this.layout.path("artifacts", `${id}.wav`);
          writeFileSync(path, audio, { flag: "wx", mode: 0o600 });
          this.change((draft) => {
            const conversation = draft.conversations.find((item) => item.id === conversationId);
            if (!conversation) return;
            (conversation.artifacts ??= []).push({ id, name: fileName, path, createdAt: now() });
            (draft.library ??= []).unshift({ id, name: fileName, path, mimeType: "audio/wav", source: "agent", agentId: conversation.agentId, conversationId, createdAt: now(), updatedAt: now() });
          });
          result = JSON.stringify({ artifactId: id, name: fileName, saved: true });
        } catch (error) { result = `Error: ${error instanceof Error ? error.message : String(error)}`; }
      }
    } else if (name === "generate_image") {
      if (this.store.get().settings.permissionMode === "read-only") result = "Error: Local workspace is read only. Enable changes in General settings to generate an image.";
      else {
        try {
          const image = await this.imageManager.generate(String(args.prompt ?? ""), this.store.get().settings.imageModel);
          const id = randomUUID();
          const fileName = `Generated image ${now().replace(/[:.]/g, "-")}.png`;
          this.change((draft) => {
            const conversation = draft.conversations.find((item) => item.id === conversationId);
            if (!conversation) return;
            (conversation.artifacts ??= []).push({ id, name: fileName, path: image.path, createdAt: now() });
            (draft.library ??= []).unshift({ id, name: fileName, path: image.path, mimeType: "image/png", source: "agent", agentId: conversation.agentId, conversationId, createdAt: now(), updatedAt: now() });
          });
          result = JSON.stringify({ artifactId: id, name: fileName, model: image.modelId, saved: true });
        } catch (error) { result = `Error: ${error instanceof Error ? error.message : String(error)}`; }
      }
    } else if (name === "web_search") {
      const endpoint = this.store.get().settings.webSearchUrl;
      const query = String(args.query ?? "").trim().slice(0, 500);
      if (!this.webSearchAllowed(conversationId) || !endpoint) result = "Error: Web search is off. The user must enable it in the composer and configure a Local search endpoint.";
      else if (!query) result = "Error: A search query is required.";
      else if (!(await this.requestApproval(`Send web search query to ${endpoint}: ${query}`, "web_search", { conversationId, toolName: name }))) result = "User denied the web search query.";
      else if (!this.webSearchAllowed(conversationId)) result = "Web search was turned off before the query was sent.";
      else {
        try {
          const request = localWebSearchRequest(this.store.get().settings, query);
          const response = await fetch(request.url, { redirect: "error", signal: AbortSignal.timeout(10_000), headers: request.headers });
          if (!response.ok) throw new Error(`Search endpoint returned ${response.status}`);
          result = JSON.stringify(localWebSearchResults(await response.json(), request.brave));
        } catch (error) { result = `Error: ${error instanceof Error ? error.message : String(error)}`; }
      }
    } else if (["list_knowledge_spaces", "list_knowledge_documents", "read_knowledge_document", "search_knowledge"].includes(name)) {
      const state = this.store.get();
      const conversation = state.conversations.find((item) => item.id === conversationId)!;
      const projectSpaces = state.projects?.find((project) => project.id === conversation.projectId)?.spaceIds ?? [];
      const scoped = projectSpaces.length ? [...new Set([...(spaceIds ?? []), ...projectSpaces])] : spaceIds;
      result = await knowledgeTool(accessibleSpaces(state.spaces, conversation.agentId, scoped), name, args);
    } else if (name === "read_library_item" || name === "search_library_item") {
      const state = this.store.get();
      const conversation = state.conversations.find((item) => item.id === conversationId);
      const itemId = String(args.itemId ?? "");
      const project = state.projects?.find((entry) => entry.id === conversation?.projectId);
      const permitted = Boolean(conversation?.messages.some((message) => message.attachments?.some((attachment) => attachment.id === itemId))) ||
        Boolean(project?.libraryItemIds.includes(itemId)) ||
        Boolean(conversation?.artifacts?.some((artifact) => artifact.id === itemId));
      if (!permitted) result = "Error: that file is not attached to this chat or included in its project.";
      else {
        try {
          if (name === "search_library_item") {
            const item = state.library?.find((entry) => entry.id === itemId);
            if (!item) throw new Error("The file is no longer in the Local Library.");
            const text = await readLibraryText(item);
            result = JSON.stringify({ itemId, ...searchTextPassages(text, item.name, String(args.query ?? ""), "Use read_library_item with this itemId and a matching offset for more context.") });
          } else {
            const read = await this.readLibraryItem(itemId, Number(args.offset) || 0);
            result = JSON.stringify({ itemId, name: read.item.name, content: read.content, nextOffset: read.nextOffset, totalChars: read.totalChars });
          }
        } catch (error) { result = `Error: ${error instanceof Error ? error.message : String(error)}`; }
      }
    } else if (name === "invoke_skill") {
      const slug = String(args.skillSlug ?? "");
      const skill = (this.store.get().skills ?? []).find((candidate) => candidate.slug === slug);
      result = skill ? `# ${skill.name}\n\n${skill.instructions}` : `Error: local skill ${slug} was not found.`;
    } else if (name === "local_list_data" || name === "local_read_data") {
      result = await runLocalTool({
        tool: name === "local_list_data" ? "list_directory" : "read_file",
        args: { path: args.path ?? "." },
      }, this.toolsConfig(this.layout.root, conversationId));
    } else if (["local_create_knowledge_space", "local_create_note", "local_save_skill", "local_register_app"].includes(name)) {
      if (this.store.get().settings.permissionMode === "read-only") result = "Error: Local workspace is read only.";
      else if (!(await this.requestApproval(`${name.replaceAll("_", " ")}: ${JSON.stringify({ ...args, content: typeof args.content === "string" ? args.content.slice(0, 1_000) : undefined, instructions: typeof args.instructions === "string" ? args.instructions.slice(0, 1_000) : undefined })}`, name, { conversationId, toolName: name }))) result = "User denied the Local workspace change.";
      else {
        try {
          if (name === "local_create_knowledge_space") {
            const state = await this.addKnowledgeSpace(String(args.name ?? ""), []);
            const space = state.spaces.at(-1)!;
            result = JSON.stringify({ spaceId: space.id, name: space.name, folder: space.folders[0] });
          } else if (name === "local_create_note") {
            const spaceId = String(args.spaceId ?? "");
            const response = await handleLocalKnowledgeApi(this, new URL(`/api/knowledge/${encodeURIComponent(spaceId)}/documents`, "http://localhost"), "POST", { path: args.path, content: args.content });
            result = response.status === 200 ? JSON.stringify(response.body) : `Error: ${JSON.stringify(response.body)}`;
          } else if (name === "local_save_skill") {
            const slug = String(args.slug ?? "");
            const existing = this.store.get().skills?.find((skill) => skill.slug === slug);
            const state = this.saveSkill({ id: existing?.id, slug, name: String(args.name ?? ""), description: String(args.description ?? ""), instructions: String(args.instructions ?? ""),
              triggers: Array.isArray(args.triggers) ? args.triggers.map(String) : [], tags: Array.isArray(args.tags) ? args.tags.map(String) : [] });
            const skill = state.skills?.find((entry) => entry.slug === slug);
            result = JSON.stringify({ skillId: skill?.id, slug: skill?.slug, path: this.layout.path("skills", `${slug}.md`) });
          } else {
            if (!workspace) throw new Error("Select a workspace before registering an app.");
            const directory = safePath(workspace, String(args.directory ?? "."));
            if (!statSync(directory).isDirectory()) throw new Error("App directory does not exist.");
            const state = this.saveApp({ name: String(args.name ?? ""), description: typeof args.description === "string" ? args.description : undefined, directory, command: String(args.command ?? ""), args: Array.isArray(args.args) ? args.args.map(String) : [], previewUrl: String(args.previewUrl ?? "") });
            const app = state.apps[0];
            result = JSON.stringify({ appId: app.id, name: app.name, directory: app.directory, status: app.status });
          }
        } catch (error) { result = `Error: ${error instanceof Error ? error.message : String(error)}`; }
      }
    } else if (!workspace) {
      result = "Error: select a workspace before using local file or command tools.";
    } else {
      result = await runLocalTool({ tool: label, args }, this.toolsConfig(workspace, conversationId));
    }
    if (name === "cli_write_file" && workspace && result.startsWith("Written ") && typeof args.path === "string") {
      const path = safePath(workspace, args.path);
      const readback = await runLocalTool({ tool: "read_file", args: { path: args.path } }, this.toolsConfig(workspace, conversationId));
      result += `\n${readback.startsWith("Error:") ? "File readback failed" : "Verified file readback"}:\n${readback.slice(0, 16_000)}`;
      const previous = this.store.get().conversations.find((entry) => entry.id === conversationId)?.artifacts?.find((artifact) => artifact.path === path);
      const id = previous?.id ?? randomUUID();
      const size = statSync(path).size;
      const snapshot = this.layout.path("artifacts", `${id}-${basename(path)}`);
      if (size <= 20_000_000) copyFileSync(path, snapshot);
      else if (existsSync(snapshot)) unlinkSync(snapshot);
      const item: LocalLibraryItem = {
        id, name: basename(path), path: size <= 20_000_000 ? snapshot : path,
        mimeType: mimeFor(path), source: "agent",
        agentId: this.store.get().conversations.find((entry) => entry.id === conversationId)?.agentId,
        conversationId, createdAt: now(), updatedAt: now(),
      };
      this.change((draft) => {
        const conversation = draft.conversations.find((candidate) => candidate.id === conversationId);
        if (!conversation) return;
        const artifacts = conversation.artifacts ?? (conversation.artifacts = []);
        const current = artifacts.find((artifact) => artifact.path === path);
        if (!current) {
          artifacts.push({ id, name: basename(path), path, createdAt: now() });
          (draft.library ??= []).unshift(item);
        } else {
          const libraryItem = draft.library?.find((entry) => entry.id === current.id);
          if (libraryItem) Object.assign(libraryItem, { path: item.path, mimeType: item.mimeType, updatedAt: now() });
        }
      });
    }
    this.emit({
      type: "activity",
      label: label.replaceAll("_", " "),
      detail: result.slice(0, 16_000),
      status: result.startsWith("Error:") || result.startsWith("User denied") ? "error" : "done",
      toolName: name,
      args,
      result: result.slice(0, 32_000),
      conversationId,
    });
    this.change((draft) => {
      const conversation = draft.conversations.find((candidate) => candidate.id === conversationId);
      if (conversation) conversation.messages.push({
        id: randomUUID(),
        role: "tool",
        content: result.slice(0, 32_000),
        toolName: name,
        toolArgs: {
          ...args,
          ...(typeof args.content === "string" ? { content: args.content.slice(0, 32_000) } : {}),
        },
        createdAt: now(),
      });
    });
    return result;
  }

  getArtifactPath(conversationId: string, artifactId: string) {
    const conversation = this.store.get().conversations.find((candidate) => candidate.id === conversationId);
    const artifact = conversation?.artifacts?.find((candidate) => candidate.id === artifactId);
    if (!conversation?.workspaceRoot || !artifact) throw new Error("Local artifact not found");
    const path = safePath(conversation.workspaceRoot, artifact.path);
    if (!existsSync(path)) throw new Error("Local artifact no longer exists");
    return path;
  }

  setArtifactFavorite(conversationId: string, artifactId: string, favorite: boolean) {
    return this.change((state) => {
      const artifact = state.conversations.find((candidate) => candidate.id === conversationId)?.artifacts?.find((candidate) => candidate.id === artifactId);
      if (!artifact) throw new Error("Local artifact not found");
      artifact.isFavorite = favorite;
      const item = state.library?.find((candidate) => candidate.id === artifactId);
      if (item) item.isFavorite = favorite;
    });
  }

  removeArtifactReference(conversationId: string, artifactId: string) {
    return this.change((state) => {
      const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
      if (!conversation?.artifacts?.some((candidate) => candidate.id === artifactId)) throw new Error("Local artifact not found");
      conversation.artifacts = conversation.artifacts.filter((candidate) => candidate.id !== artifactId);
    });
  }

  private toolsConfig(rootDir: string, sessionId = "desktop", signal?: AbortSignal): LocalToolsConfig {
    const state = this.store.get();
    return {
      rootDir,
      sessionId,
      signal,
      permissions: new Map(
        state.settings.permissionMode === "read-only"
          ? ["write_file", "run_command", "start_process"].map((key) => [key, "deny" as const])
          : [],
      ),
      appendLog: (record) => this.appendAudit(record),
      confirm: (summary, permission) => this.requestApproval(summary, permission, { conversationId: sessionId === "desktop" ? undefined : sessionId }),
    };
  }

  private requestApproval(summary: string, permission: string, context: { conversationId?: string; toolName?: string } = {}) {
    if (!this.target || this.target.isDestroyed()) return Promise.resolve(false);
    if (context.conversationId && this.rememberedApprovals.get(context.conversationId)?.has(permission)) return Promise.resolve(true);
    const id = randomUUID();
    const plain = plainSummary(summary);
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.approvals.delete(id);
        this.emit({ type: "approval-resolved", id, allow: false });
        resolve(false);
      }, 10 * 60_000);
      this.approvals.set(id, { resolve, timeout, conversationId: context.conversationId, permission });
      this.emit({ type: "approval", approval: {
        id, permission, summary: plain, title: approvalTitle(plain, permission),
        conversationId: context.conversationId, toolName: context.toolName,
        note: permission === "run_command" || permission === "start_process"
          ? "Runs on this computer with your account's permissions and may use the network."
          : undefined,
      } });
    });
  }

  private appendAudit(record: Record<string, unknown>) {
    // Tool activity is surfaced through private renderer events. Avoid the
    // CLI's separate plaintext session log inside Desktop's encrypted store.
    void record;
  }

  private change(mutator: (state: LocalState) => void) {
    const state = this.store.update(mutator);
    this.layout.sync(state);
    this.emit({ type: "state", state });
    return state;
  }

  private emit(event: RuntimeEvent) {
    if (this.target && !this.target.isDestroyed()) this.target.send("local:event", event);
  }
}

export function ensureLocalPreview(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Preview must use HTTP or HTTPS");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("Private apps can only preview a server on this computer");
  }
  return url;
}
