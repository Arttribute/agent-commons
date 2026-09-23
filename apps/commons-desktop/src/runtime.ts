import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import type {
  AgentInput,
  AppInput,
  ChatRequest,
  ChatResult,
  LocalAgent,
  LocalApp,
  LocalState,
  RuntimeEvent,
  TaskInput,
  WorkflowInput,
} from "@agent-commons/desktop-contract";
import {
  buildDirSnapshot,
  buildLocalToolsManifest,
  extractToolCall,
  runLocalTool,
  stopLocalProcesses,
  type LocalToolsConfig,
} from "../../../packages/agc-cli/src/local-tools";
import { indexFolders, searchSpaces } from "./knowledge";
import { LocalStore } from "./store";

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    function: { name: string; arguments: Record<string, unknown> };
  }>;
};

type PendingApproval = {
  resolve: (allow: boolean) => void;
  timeout: NodeJS.Timeout;
};

const LOCAL_TOOLS = [
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
  functionTool("search_knowledge", "Search the user's selected local Knowledge Spaces.", {
    query: { type: "string" },
  }, ["query"]),
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

export class PrivateLocalRuntime {
  private readonly approvals = new Map<string, PendingApproval>();
  private readonly appProcesses = new Map<string, string>();
  private readonly store: LocalStore;
  private readonly scheduler: NodeJS.Timeout;
  private target?: WebContents;

  constructor(userDataDirectory: string) {
    this.store = new LocalStore(userDataDirectory);
    this.scheduler = setInterval(() => void this.runDueTasks(), 30_000);
    this.scheduler.unref();
  }

  setTarget(target: WebContents | undefined) {
    this.target = target;
  }

  state() {
    return this.store.get();
  }

  saveAgent(input: AgentInput) {
    const timestamp = now();
    const name = input.name.trim();
    if (!name) throw new Error("Agent name is required");
    return this.change((state) => {
      const existing = input.id ? state.agents.find((agent) => agent.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, {
          name,
          instructions: input.instructions.trim(),
          model: input.model.trim(),
          updatedAt: timestamp,
        });
      } else {
        state.agents.push({
          id: randomUUID(),
          name,
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

  async listModels() {
    const state = this.store.get();
    const response = await fetch(`${ensureLoopback(state.settings.ollamaUrl)}/api/tags`, {
      signal: AbortSignal.timeout(4_000),
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

  async sendMessage(input: ChatRequest): Promise<ChatResult> {
    const state = this.store.get();
    const agent = state.agents.find((candidate) => candidate.id === input.agentId);
    if (!agent) throw new Error("Choose a local agent first");
    const model = agent.model || state.settings.defaultModel;
    if (!model) throw new Error("Choose an installed local model in Settings or on the agent");
    if (!input.prompt.trim()) throw new Error("Message is empty");

    const timestamp = now();
    let conversation = input.conversationId
      ? state.conversations.find((candidate) => candidate.id === input.conversationId)
      : undefined;
    if (!conversation) {
      conversation = {
        id: randomUUID(),
        agentId: agent.id,
        title: input.prompt.trim().slice(0, 80),
        workspaceRoot: input.workspaceRoot,
        messages: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.change((draft) => draft.conversations.unshift(conversation!));
    }
    const conversationId = conversation.id;
    this.change((draft) => {
      const current = draft.conversations.find((candidate) => candidate.id === conversationId)!;
      current.workspaceRoot = input.workspaceRoot ?? current.workspaceRoot;
      current.messages.push({ id: randomUUID(), role: "user", content: input.prompt.trim(), createdAt: timestamp });
      current.updatedAt = timestamp;
    });

    this.emit({ type: "activity", label: `${agent.name} is thinking`, status: "running" });
    try {
      const response = await this.runAgent(agent, conversationId, input.spaceIds);
      const finalState = this.change((draft) => {
        const current = draft.conversations.find((candidate) => candidate.id === conversationId)!;
        current.messages.push({ id: randomUUID(), role: "assistant", content: response, createdAt: now() });
        current.updatedAt = now();
      });
      this.emit({ type: "activity", label: `${agent.name} finished`, status: "done" });
      return {
        conversation: finalState.conversations.find((candidate) => candidate.id === conversationId)!,
        response,
      };
    } catch (error) {
      this.emit({
        type: "activity",
        label: `${agent.name} stopped`,
        detail: error instanceof Error ? error.message : String(error),
        status: "error",
      });
      throw error;
    }
  }

  async addKnowledgeSpace(name: string, folders: string[]) {
    if (!name.trim() || !folders.length) throw new Error("A name and at least one folder are required");
    const files = await indexFolders(folders);
    return this.change((state) => {
      state.spaces.push({ id: randomUUID(), name: name.trim(), folders, files, indexedAt: now() });
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

  saveTask(input: TaskInput) {
    const timestamp = now();
    return this.change((state) => {
      const existing = input.id ? state.tasks.find((task) => task.id === input.id) : undefined;
      if (existing) Object.assign(existing, input, { updatedAt: timestamp });
      else state.tasks.unshift({ ...input, id: randomUUID(), status: "pending", createdAt: timestamp, updatedAt: timestamp });
    });
  }

  async runTask(id: string) {
    const task = this.store.get().tasks.find((candidate) => candidate.id === id);
    if (!task) throw new Error("Task not found");
    this.change((state) => Object.assign(state.tasks.find((candidate) => candidate.id === id)!, { status: "running", updatedAt: now() }));
    try {
      const result = await this.sendMessage({ agentId: task.agentId, prompt: task.prompt, workspaceRoot: task.workspaceRoot });
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
    if (!input.steps.length) throw new Error("Add at least one workflow step");
    return this.change((state) => {
      const existing = input.id ? state.workflows.find((workflow) => workflow.id === input.id) : undefined;
      if (existing) Object.assign(existing, input, { updatedAt: timestamp });
      else state.workflows.unshift({ ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp });
    });
  }

  async runWorkflow(id: string) {
    const workflow = this.store.get().workflows.find((candidate) => candidate.id === id);
    if (!workflow) throw new Error("Workflow not found");
    let context = "";
    for (const [index, step] of workflow.steps.entries()) {
      const prompt = context ? `${step}\n\nPrevious step result:\n${context}` : step;
      this.emit({ type: "activity", label: `${workflow.name}: step ${index + 1}/${workflow.steps.length}`, status: "running" });
      context = (await this.sendMessage({ agentId: workflow.agentId, prompt, workspaceRoot: workflow.workspaceRoot })).response;
    }
    return this.change((state) => Object.assign(state.workflows.find((candidate) => candidate.id === id)!, {
      lastResult: context, updatedAt: now(),
    }));
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

  close() {
    clearInterval(this.scheduler);
    for (const [id, pending] of this.approvals) {
      clearTimeout(pending.timeout);
      pending.resolve(false);
      this.approvals.delete(id);
    }
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

  private async runAgent(agent: LocalAgent, conversationId: string, spaceIds?: string[]) {
    const state = this.store.get();
    const conversation = state.conversations.find((candidate) => candidate.id === conversationId)!;
    const lastUser = [...conversation.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const knowledge = searchSpaces(state.spaces, lastUser, spaceIds);
    const workspace = conversation.workspaceRoot;
    const localManifest = workspace
      ? buildLocalToolsManifest(workspace, buildDirSnapshot(workspace, 2), [], false)
      : "No workspace folder is selected. Do not call cli_* filesystem or command tools.";
    const system = [
      `You are ${agent.name}, a private local Agent Commons agent.`,
      agent.instructions,
      "All model inference and state are local. Be concise, use tools when useful, and report real tool results only.",
      localManifest,
      knowledge.length
        ? `Local Knowledge Space excerpts:\n${knowledge.map((entry) => `\n[${entry.space}] ${entry.path}\n${entry.excerpt}`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n\n");
    const messages: OllamaMessage[] = [
      { role: "system", content: system },
      ...conversation.messages.slice(-40).map((message) => ({ role: message.role, content: message.content }) as OllamaMessage),
    ];
    const endpoint = ensureLoopback(state.settings.ollamaUrl);
    const tools = workspace ? LOCAL_TOOLS : LOCAL_TOOLS.filter((entry) => entry.function.name === "search_knowledge");

    for (let turn = 0; turn < 16; turn += 1) {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: agent.model || state.settings.defaultModel, messages, tools, stream: false }),
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Local model failed (${response.status}): ${detail.slice(0, 500)}`);
      }
      const payload = (await response.json()) as { message?: OllamaMessage; error?: string };
      if (payload.error) throw new Error(payload.error);
      const message = payload.message;
      if (!message) throw new Error("Local model returned no message");
      messages.push(message);
      const calls = message.tool_calls ?? [];
      if (!calls.length) {
        const fallback = extractToolCall(message.content ?? "");
        if (!fallback) return message.content?.trim() || "Done.";
        const result = await this.executeTool(fallback.tool, fallback.args, workspace, conversationId, spaceIds);
        messages.push({ role: "tool", content: result });
        continue;
      }
      for (const call of calls) {
        const result = await this.executeTool(call.function.name, call.function.arguments ?? {}, workspace, conversationId, spaceIds);
        messages.push({ role: "tool", content: result });
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
    this.emit({ type: "activity", label: label.replaceAll("_", " "), detail: JSON.stringify(args), status: "running" });
    let result: string;
    if (name === "search_knowledge") {
      result = JSON.stringify(searchSpaces(this.store.get().spaces, String(args.query ?? ""), spaceIds));
    } else if (!workspace) {
      result = "Error: select a workspace before using local file or command tools.";
    } else {
      result = await runLocalTool({ tool: label, args }, this.toolsConfig(workspace, conversationId));
    }
    this.emit({
      type: "activity",
      label: label.replaceAll("_", " "),
      detail: result.slice(0, 16_000),
      status: result.startsWith("Error:") || result.startsWith("User denied") ? "error" : "done",
    });
    return result;
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
