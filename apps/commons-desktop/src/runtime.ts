import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename } from "node:path";
import { copyFileSync, existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { WebContents } from "electron";
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
  LocalState,
  RuntimeEvent,
  SkillInput,
  TaskInput,
  WorkflowInput,
  WorkspacePreferences,
} from "@agent-commons/desktop-contract";
import { AUTONOMOUS_EXECUTION_CONTRACT, buildAgentIdentityPrompt, buildSkillPromptIndex, buildWorkspaceModeContext, findMatchingSkills } from "@agent-commons/agent-core";
import {
  extractToolCall,
  runLocalTool,
  safePath,
  stopLocalProcesses,
  type LocalToolsConfig,
} from "../../../packages/agc-cli/src/local-tools";
import { indexFolders, searchSpaces, accessibleSpaces, knowledgeTool } from "./knowledge";
import { compactToolLoop, localChatHistory, LOCAL_CONTEXT_SIZE, toolResult } from "./local-chat-history";
import { DEFAULT_LOCAL_MODEL, LocalStore } from "./store";
import { LocalModelManager } from "./local-model";
import { LocalStorageLayout } from "./local-storage-layout";
import { handleLocalKnowledgeApi } from "./local-knowledge-api";
import { assistantIdentityAnswer, assistantIdentityRequestKind, assistantNameAnswer, looksLikeInventedToolCall, looksLikeModelIdentity, parseToolArguments } from "./local-response";
import { readOllamaChatResponse, type OllamaMessage } from "./ollama-stream";
import { mergeWorkspacePreferences } from "./workspace-preferences";
import { compileLocalWorkflow } from "./local-workflow-plan.mjs";

type PendingApproval = {
  resolve: (allow: boolean) => void;
  timeout: NodeJS.Timeout;
};

export const LOCAL_TOOLS = [
  functionTool("cli_list_directory", "List files and folders inside the selected workspace.", {
    path: { type: "string", description: "Workspace-relative directory, default ." },
  }),
  functionTool("cli_read_file", "Read a text, PDF, or supported document from the selected workspace.", {
    path: { type: "string" },
  }, ["path"]),
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
  functionTool("search_knowledge", "Search the user's selected local Knowledge Spaces.", {
    query: { type: "string" },
  }, ["query"]),
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
  functionTool("local_register_app", "Register an app built in the selected workspace. Its preview URL must use localhost. The app then appears in Commons Apps.", {
    name: { type: "string" }, directory: { type: "string", description: "Selected workspace-relative app folder" },
    command: { type: "string" }, args: { type: "array", items: { type: "string" } }, previewUrl: { type: "string" },
  }, ["name", "directory", "command", "previewUrl"]),
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

function mimeFor(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    svg: "image/svg+xml", pdf: "application/pdf", md: "text/markdown", txt: "text/plain", html: "text/html",
    json: "application/json", csv: "text/csv", js: "text/javascript", ts: "text/plain", css: "text/css" } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
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
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly appProcesses = new Map<string, string>();
  private readonly store: LocalStore;
  private readonly layout: LocalStorageLayout;
  private readonly scheduler: NodeJS.Timeout;
  private readonly modelManager: LocalModelManager;
  private target?: WebContents;

  constructor(userDataDirectory: string) {
    this.store = new LocalStore(userDataDirectory);
    this.layout = new LocalStorageLayout(userDataDirectory);
    this.modelManager = new LocalModelManager(
      this.layout.root,
      DEFAULT_LOCAL_MODEL,
      (model) => this.emit({ type: "model", model }),
    );
    this.layout.sync(this.store.get());
    this.scheduler = setInterval(() => void this.runDueTasks(), 30_000);
    this.scheduler.unref();
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

  prepareLocalModel() {
    if (this.store.get().settings.ollamaUrl !== "http://127.0.0.1:11434") return Promise.resolve();
    return this.modelManager.prepare();
  }

  storageRoot() {
    return this.layout.root;
  }

  importLibraryFiles(files: Array<{ name: string; mimeType: string; bytes: Uint8Array }>) {
    if (!files.length) throw new Error("Choose a file to upload into the Local Library.");
    const imported: LocalLibraryItem[] = [];
    for (const file of files) {
      if (!(file.bytes instanceof Uint8Array) || file.bytes.byteLength > 20_000_000) throw new Error("Local uploads are limited to 20 MB per file.");
      const id = randomUUID();
      const name = basename(String(file.name || "file")).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "file";
      const path = this.layout.path("uploads", `${id}-${name}`);
      writeFileSync(path, file.bytes, { flag: "wx", mode: 0o600 });
      const timestamp = now();
      imported.push({ id, name, path, mimeType: file.mimeType || mimeFor(name), source: "upload", createdAt: timestamp, updatedAt: timestamp });
    }
    this.change((state) => { (state.library ??= []).unshift(...imported); });
    return imported;
  }

  updateLibraryItem(id: string, patch: { name?: string; isFavorite?: boolean }) {
    return this.change((state) => {
      const item = state.library?.find((entry) => entry.id === id);
      if (!item) throw new Error("Local Library item not found");
      if (patch.name !== undefined) item.name = patch.name.trim().slice(0, 180) || item.name;
      if (patch.isFavorite !== undefined) item.isFavorite = patch.isFavorite;
      item.updatedAt = now();
    });
  }

  deleteLibraryItem(id: string) {
    const item = this.store.get().library?.find((entry) => entry.id === id);
    if (!item) throw new Error("Local Library item not found");
    this.change((state) => {
      state.library = (state.library ?? []).filter((entry) => entry.id !== id);
      for (const conversation of state.conversations) conversation.artifacts = conversation.artifacts?.filter((artifact) => artifact.id !== id);
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
      };
    });
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

  updateSettings(settings: Partial<LocalState["settings"]>) {
    return this.change((state) => {
      if (settings.ollamaUrl !== undefined) state.settings.ollamaUrl = ensureLoopback(settings.ollamaUrl);
      if (settings.defaultModel !== undefined) state.settings.defaultModel = settings.defaultModel.trim();
      if (settings.permissionMode !== undefined) state.settings.permissionMode = settings.permissionMode;
    });
  }

  createConversation(agentId: string, title: string) {
    if (!this.store.get().agents.some((agent) => agent.id === agentId)) throw new Error("Local agent not found");
    const timestamp = now();
    const conversation: LocalConversation = {
      id: randomUUID(), agentId, title: title.trim().slice(0, 160) || "New chat",
      workspaceRoot: homedir(), messages: [], createdAt: timestamp, updatedAt: timestamp,
    };
    this.change((state) => state.conversations.unshift(conversation));
    return conversation;
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
    if (!conversation) {
      conversation = {
        id: randomUUID(),
        agentId: agent.id,
        title: input.prompt.trim().slice(0, 80),
        workspaceRoot: input.workspaceRoot || homedir(),
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.change((draft) => draft.conversations.unshift(conversation!));
    }
    const conversationId = conversation.id;
    this.change((draft) => {
      const current = draft.conversations.find((candidate) => candidate.id === conversationId)!;
      current.workspaceRoot = input.workspaceRoot ?? current.workspaceRoot ?? homedir();
      if (input.spaceIds !== undefined) current.spaceIds = input.spaceIds;
      current.messages.push({ id: randomUUID(), role: "user", content: input.prompt.trim(), createdAt: timestamp });
      current.updatedAt = timestamp;
    });

    if (input.interactive) this.emit({ type: "chat-start", conversationId });
    this.emit({ type: "activity", label: `${agent.name} is thinking`, status: "running" });
    try {
      const response = await this.runAgent(runningAgent, conversationId, input.spaceIds, input.interactive);
      const finalState = this.change((draft) => {
        const current = draft.conversations.find((candidate) => candidate.id === conversationId)!;
        current.messages.push({ id: randomUUID(), role: "assistant", content: response, createdAt: now() });
        current.updatedAt = now();
      });
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
    }
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

  async addKnowledgeSpace(name: string, folders: string[]) {
    if (!name.trim()) throw new Error("A name is required");
    const id = randomUUID();
    const sources = folders.length ? folders : [this.layout.path("knowledge", id)];
    if (!folders.length) mkdirSync(sources[0], { recursive: true, mode: 0o700 });
    const files = await indexFolders(sources);
    return this.change((state) => {
      state.spaces.push({ id, name: name.trim(), folders: sources, files, indexedAt: now(), autoGrantNewAgents: true, grants: [] });
    });
  }

  async reindexKnowledgeSpace(id: string) {
    const space = this.store.get().spaces.find((candidate) => candidate.id === id);
    if (!space) throw new Error("Knowledge Space not found");
    const files = await indexFolders(space.folders);
    return this.change((state) => {
      const current = state.spaces.find((candidate) => candidate.id === id)!;
      current.files = files;
      current.indexedAt = now();
    });
  }

  removeKnowledgeSpace(id: string) {
    return this.change((state) => {
      state.spaces = state.spaces.filter((space) => space.id !== id);
    });
  }

  updateKnowledgeSpace(id: string, patch: { autoGrantNewAgents?: boolean }) {
    return this.change((state) => {
      const space = state.spaces.find((entry) => entry.id === id);
      if (!space) throw new Error("Knowledge Space not found");
      if (patch.autoGrantNewAgents !== undefined) space.autoGrantNewAgents = patch.autoGrantNewAgents;
    });
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
      return this.change((state) => Object.assign(state.tasks.find((candidate) => candidate.id === id)!, {
        status: "completed", result: result.response, updatedAt: now(),
      }));
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
    ensureLocalPreview(input.previewUrl);
    return this.change((state) => {
      const existing = input.id ? state.apps.find((app) => app.id === input.id) : undefined;
      if (existing) Object.assign(existing, input, { updatedAt: timestamp });
      else state.apps.unshift({ ...input, id: randomUUID(), status: "stopped", createdAt: timestamp, updatedAt: timestamp });
    });
  }

  async startApp(id: string) {
    const app = this.store.get().apps.find((candidate) => candidate.id === id);
    if (!app) throw new Error("Local app not found");
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
    if (this.appProcesses.has(id)) await this.stopApp(id);
    return this.change((state) => { state.apps = state.apps.filter((app) => app.id !== id); });
  }

  getApp(id: string): LocalApp {
    const app = this.store.get().apps.find((candidate) => candidate.id === id);
    if (!app) throw new Error("Local app not found");
    ensureLocalPreview(app.previewUrl);
    return app;
  }

  resolveApproval(id: string, allow: boolean) {
    const pending = this.approvals.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.approvals.delete(id);
    pending.resolve(allow);
  }

  cancelPendingApprovals() {
    for (const [id, pending] of this.approvals) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
      this.approvals.delete(id);
    }
  }

  close() {
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
    const spaces = accessibleSpaces(state.spaces, agent.id, spaceIds);
    const knowledge = searchSpaces(spaces, lastUser);
    const skills = (state.skills ?? []).filter((skill) => skill.assignedAgentIds === undefined || skill.assignedAgentIds.includes(agent.id));
    const skillsBlock = buildSkillPromptIndex(skills, findMatchingSkills(skills, lastUser));
    const workspace = conversation.workspaceRoot;
    const localManifest = workspace
      ? `Workspace: ${workspace}. File paths and command cwd are relative to this folder. Use cli_list_directory to inspect folders as needed.
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
      skillsBlock,
      knowledge.length
        ? `Local Knowledge Space excerpts (use the Knowledge tools for full documents):\n${knowledge.slice(0, 4).map((entry) => `\n[${entry.space}] ${entry.path}\n${entry.excerpt.slice(0, 1_500)}`).join("\n")}`
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
    const tools = (workspace ? LOCAL_TOOLS : LOCAL_TOOLS.filter((entry) => ["list_knowledge_spaces", "list_knowledge_documents", "read_knowledge_document", "search_knowledge", "invoke_skill", "local_list_data", "local_read_data", "local_create_knowledge_space", "local_create_note", "local_save_skill"].includes(entry.function.name)))
      .filter((entry) => entry.function.name !== "invoke_skill" || skills.length > 0);

    let repairAttempted = false;
    let identityRepairAttempted = false;
    for (let turn = 0; turn < 64; turn += 1) {
      compactToolLoop(messages);
      const response = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: agent.model || state.settings.defaultModel, messages, tools: repairAttempted ? [] : tools, stream: true, options: { temperature: 0.3, num_ctx: LOCAL_CONTEXT_SIZE } }),
        signal: AbortSignal.timeout(10 * 60_000),
      });
      const message = await readOllamaChatResponse(response, interactive && !identityRequest ? (content) => {
        const trimmed = content.trimStart();
        if (trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("```")) {
          this.emit({ type: "chat-token", conversationId, content });
        }
      } : undefined);
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
        if (!supportedToolNames.has(fallback.tool)) {
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
        if (!supportedToolNames.has(call.function.name)) {
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
    this.emit({ type: "activity", label: label.replaceAll("_", " "), detail: JSON.stringify(args), status: "running", conversationId, toolName: name, args });
    let result: string;
    if (["list_knowledge_spaces", "list_knowledge_documents", "read_knowledge_document", "search_knowledge"].includes(name)) {
      const state = this.store.get();
      const agentId = state.conversations.find((item) => item.id === conversationId)!.agentId;
      result = await knowledgeTool(accessibleSpaces(state.spaces, agentId, spaceIds), name, args);
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
      else if (!(await this.requestApproval(`${name.replaceAll("_", " ")}: ${JSON.stringify({ ...args, content: typeof args.content === "string" ? args.content.slice(0, 1_000) : undefined, instructions: typeof args.instructions === "string" ? args.instructions.slice(0, 1_000) : undefined })}`, name))) result = "User denied the Local workspace change.";
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
            const state = this.saveApp({ name: String(args.name ?? ""), directory, command: String(args.command ?? ""), args: Array.isArray(args.args) ? args.args.map(String) : [], previewUrl: String(args.previewUrl ?? "") });
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
      confirm: (summary, permission) => this.requestApproval(summary.replace(/\x1b\[[0-9;]*m/g, ""), permission),
    };
  }

  private requestApproval(summary: string, permission: string) {
    if (!this.target || this.target.isDestroyed()) return Promise.resolve(false);
    const id = randomUUID();
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.approvals.delete(id);
        resolve(false);
      }, 5 * 60_000);
      this.approvals.set(id, { resolve, timeout });
      this.emit({ type: "approval", approval: { id, permission, summary } });
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
