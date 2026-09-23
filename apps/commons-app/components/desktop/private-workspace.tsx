"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  Bot,
  BriefcaseBusiness,
  Cloud,
  FlaskConical,
  FolderSearch,
  MessageCircle,
  Settings,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type {
  ApprovalRequest,
  LocalAgent,
  LocalApp,
  LocalConversation,
  LocalState,
  RuntimeEvent,
} from "@agent-commons/desktop-contract";

type Tab = "chat" | "agents" | "knowledge" | "tasks" | "workflows" | "apps" | "settings";

const emptyState: LocalState = {
  version: 1,
  agents: [],
  conversations: [],
  spaces: [],
  tasks: [],
  workflows: [],
  apps: [],
  settings: { ollamaUrl: "http://127.0.0.1:11434", defaultModel: "", permissionMode: "ask" },
};

export function PrivateWorkspace() {
  const bridge = typeof window !== "undefined" ? window.agentCommonsLocal : undefined;
  const [state, setState] = useState<LocalState>(emptyState);
  const [tab, setTab] = useState<Tab>("chat");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [activity, setActivity] = useState<Array<{ label: string; detail?: string; status: string }>>([]);

  useEffect(() => {
    if (!bridge) {
      setError("Private Local mode must be opened from Agent Commons Desktop.");
      return;
    }
    void bridge.getState().then(setState).catch(showError);
    return bridge.onEvent((event: RuntimeEvent) => {
      if (event.type === "state") setState(event.state);
      if (event.type === "approval") setApproval(event.approval);
      if (event.type === "activity") {
        setActivity((current) => [event, ...current].slice(0, 12));
      }
    });
  }, [bridge]);

  function showError(cause: unknown) {
    setError(cause instanceof Error ? cause.message : String(cause));
  }

  async function action<T>(label: string, call: () => Promise<T>) {
    setBusy(label);
    setError("");
    try {
      return await call();
    } catch (cause) {
      showError(cause);
      return undefined;
    } finally {
      setBusy("");
    }
  }

  if (!bridge) {
    return <main className="private-error">{error || "Desktop bridge unavailable"}</main>;
  }

  return (
    <main className="private-shell">
      <aside className="private-sidebar">
        <div className="private-brand">
          <span className="private-mark"><FlaskConical /></span>
          <span>Agent Commons</span>
        </div>
        <div className="private-mode"><ShieldCheck /> <span>Private Local</span></div>
        <nav>
          {(["chat", "agents", "knowledge", "tasks", "workflows", "apps", "settings"] as Tab[]).map((item) => {
            const Icon = icons[item];
            return (
              <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
                <span className="nav-icon"><Icon /></span>{labels[item]}
              </button>
            );
          })}
        </nav>
        <div className="private-sidebar-foot">
          <span className="network-dot" /> Local-only workspace
          <button onClick={() => bridge.openCloud()}><Cloud /> Open cloud workspace</button>
        </div>
      </aside>

      <section className="private-main">
        <header className="private-header">
          <div>
            <h1><span>{labels[tab]}</span></h1>
            <p>{descriptions[tab]}</p>
          </div>
          {busy && <span className="busy-pill"><i /> {busy}</span>}
        </header>
        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        <div className="private-content">
          {tab === "chat" && <ChatPanel state={state} bridge={bridge} action={action} activity={activity} />}
          {tab === "agents" && <AgentsPanel state={state} bridge={bridge} action={action} />}
          {tab === "knowledge" && <KnowledgePanel state={state} bridge={bridge} action={action} />}
          {tab === "tasks" && <TasksPanel state={state} bridge={bridge} action={action} />}
          {tab === "workflows" && <WorkflowsPanel state={state} bridge={bridge} action={action} />}
          {tab === "apps" && <AppsPanel state={state} bridge={bridge} action={action} />}
          {tab === "settings" && <SettingsPanel state={state} bridge={bridge} action={action} />}
        </div>
      </section>

      {approval && (
        <div className="approval-backdrop">
          <section className="approval-card">
            <span className="approval-kicker">Local permission</span>
            <h2>Review agent action</h2>
            <p>{approval.permission.replaceAll("_", " ")}</p>
            <pre>{approval.summary}</pre>
            <div className="form-actions">
              <button className="secondary" onClick={() => { void bridge.approve(approval.id, false); setApproval(null); }}>Decline</button>
              <button onClick={() => { void bridge.approve(approval.id, true); setApproval(null); }}>Allow once</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

type Bridge = NonNullable<Window["agentCommonsLocal"]>;
type Action = <T>(label: string, call: () => Promise<T>) => Promise<T | undefined>;

function ChatPanel({ state, bridge, action, activity }: { state: LocalState; bridge: Bridge; action: Action; activity: Array<{ label: string; detail?: string; status: string }> }) {
  const [agentId, setAgentId] = useState(state.agents[0]?.id ?? "");
  const [conversationId, setConversationId] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const conversation = state.conversations.find((candidate) => candidate.id === conversationId);

  useEffect(() => {
    if (!agentId && state.agents[0]) setAgentId(state.agents[0].id);
  }, [agentId, state.agents]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || !agentId) return;
    setPrompt("");
    const result = await action("Running locally", () => bridge.sendMessage({ agentId, conversationId: conversationId || undefined, prompt: text, workspaceRoot: workspace || undefined, spaceIds: selectedSpaces }));
    if (result) setConversationId(result.conversation.id);
  }

  return (
    <div className="chat-layout">
      <aside className="conversation-rail">
        <button className="new-chat" onClick={() => setConversationId("")}>＋ New conversation</button>
        {state.conversations.map((item) => (
          <button key={item.id} className={conversationId === item.id ? "conversation active" : "conversation"} onClick={() => { setConversationId(item.id); setAgentId(item.agentId); setWorkspace(item.workspaceRoot ?? ""); }}>
            <strong>{item.title}</strong><span>{new Date(item.updatedAt).toLocaleString()}</span>
          </button>
        ))}
      </aside>
      <section className="chat-workspace">
        <div className="chat-controls">
          <select value={agentId} onChange={(event) => { setAgentId(event.target.value); setConversationId(""); }}>
            <option value="">Choose an agent</option>
            {state.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.model || state.settings.defaultModel || "no model"}</option>)}
          </select>
          <button className="secondary workspace-button" onClick={async () => { const selected = await bridge.chooseWorkspace(); if (selected) setWorkspace(selected); }}>
            {workspace ? `📁 ${shortPath(workspace)}` : "Choose workspace folder"}
          </button>
        </div>
        {!!state.spaces.length && (
          <div className="space-chips">
            {state.spaces.map((space) => (
              <button key={space.id} className={selectedSpaces.includes(space.id) ? "selected" : ""} onClick={() => setSelectedSpaces((current) => current.includes(space.id) ? current.filter((id) => id !== space.id) : [...current, space.id])}>
                ◈ {space.name}
              </button>
            ))}
          </div>
        )}
        <div className="messages">
          {!conversation?.messages.length && (
            <div className="chat-empty">
              <span className="empty-orb">✦</span>
              <h2>Work privately on this computer</h2>
              <p>Choose a local agent, model, workspace, and optional Knowledge Spaces. Nothing in this conversation is sent to Commons Cloud.</p>
            </div>
          )}
          {conversation?.messages.filter((message) => message.role !== "tool").map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <span>{message.role === "user" ? "You" : state.agents.find((agent) => agent.id === conversation.agentId)?.name ?? "Agent"}</span>
              <div>{message.content}</div>
            </article>
          ))}
        </div>
        {!!activity.length && <details className="activity"><summary>Local activity</summary>{activity.map((item, index) => <div key={`${item.label}-${index}`}><b className={item.status}>{item.status === "running" ? "◌" : item.status === "done" ? "✓" : "!"}</b><span>{item.label}</span>{item.detail && <pre>{item.detail}</pre>}</div>)}</details>}
        <form className="composer" onSubmit={submit}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={state.agents.length ? "Ask your local agent to build, edit, research, or run something…" : "Create a local agent first…"} disabled={!state.agents.length} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <button disabled={!prompt.trim() || !agentId}>Send</button>
        </form>
      </section>
    </div>
  );
}

function AgentsPanel({ state, bridge, action }: { state: LocalState; bridge: Bridge; action: Action }) {
  const [editing, setEditing] = useState<LocalAgent | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [instructions, setInstructions] = useState("");
  function edit(agent?: LocalAgent) { setEditing(agent ?? null); setName(agent?.name ?? ""); setModel(agent?.model ?? state.settings.defaultModel); setInstructions(agent?.instructions ?? "You are a capable local assistant. Protect user data and verify your work."); }
  async function save(event: FormEvent) { event.preventDefault(); const next = await action("Saving agent", () => bridge.saveAgent({ id: editing?.id, name, model, instructions })); if (next) { setStateFrom(next); edit(); } }
  const [, setRefresh] = useState(0); const setStateFrom = (_next: LocalState) => setRefresh((value) => value + 1);
  return <div className="stack"><div className="section-actions"><button onClick={() => edit()}>＋ Create local agent</button></div>{(name || editing) && <form className="editor-card" onSubmit={save}><Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Local model"><input value={model} onChange={(e) => setModel(e.target.value)} placeholder={state.settings.defaultModel || "e.g. qwen2.5-coder:7b"} /></Field><Field label="Instructions"><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} /></Field><div className="form-actions"><button type="button" className="secondary" onClick={() => { setName(""); setEditing(null); }}>Cancel</button><button>Save agent</button></div></form>}<div className="card-grid">{state.agents.map((agent) => <article className="entity-card" key={agent.id}><span className="entity-icon">✦</span><h3>{agent.name}</h3><p>{agent.instructions || "No custom instructions"}</p><small>{agent.model || state.settings.defaultModel || "Model not selected"}</small><div><button className="secondary" onClick={() => edit(agent)}>Edit</button><button className="danger" onClick={() => void action("Deleting", () => bridge.deleteAgent(agent.id))}>Delete</button></div></article>)}</div>{!state.agents.length && <Empty title="No local agents" text="Create an agent whose configuration and conversations stay on this computer." />}</div>;
}

function KnowledgePanel({ state, bridge, action }: { state: LocalState; bridge: Bridge; action: Action }) {
  async function add(kind: "files" | "folders") { const sources = kind === "files" ? await bridge.chooseKnowledgeFiles() : await bridge.chooseKnowledgeFolders(); if (!sources.length) return; const name = window.prompt("Name this Knowledge Space", sources.length === 1 ? shortPath(sources[0]) : "Local knowledge")?.trim(); if (name) await action("Indexing local knowledge", () => bridge.addKnowledgeSpace(name, sources)); }
  return <div className="stack"><div className="section-actions"><button onClick={() => void add("folders")}>＋ Add folders</button><button className="secondary" onClick={() => void add("files")}>＋ Add files</button></div><div className="card-grid">{state.spaces.map((space) => <article className="entity-card" key={space.id}><span className="entity-icon">◈</span><h3>{space.name}</h3><p>{space.folders.map(shortPath).join(" · ")}</p><small>{space.files.length} indexed files · {space.indexedAt ? `Updated ${new Date(space.indexedAt).toLocaleString()}` : "Not indexed"}</small><div><button className="secondary" onClick={() => void action("Reindexing", () => bridge.reindexKnowledgeSpace(space.id))}>Reindex</button><button className="danger" onClick={() => void action("Removing", () => bridge.removeKnowledgeSpace(space.id))}>Remove</button></div></article>)}</div>{!state.spaces.length && <Empty title="Use files and folders as living knowledge" text="Selected desktop files and folders are indexed locally and refreshed on demand. Credentials and build directories are excluded." />}</div>;
}

function TasksPanel({ state, bridge, action }: { state: LocalState; bridge: Bridge; action: Action }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState(state.agents[0]?.id ?? "");
  const [dueAt, setDueAt] = useState("");
  const [workspace, setWorkspace] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    const result = await action("Saving task", () => bridge.saveTask({ title, prompt, agentId, workspaceRoot: workspace || undefined, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined }));
    if (result) { setOpen(false); setTitle(""); setPrompt(""); setWorkspace(""); }
  }
  return <div className="stack"><div className="section-actions"><button disabled={!state.agents.length} onClick={() => setOpen(true)}>＋ Create task</button></div>{open && <form className="editor-card" onSubmit={save}><Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field><Field label="Agent"><AgentSelect agents={state.agents} value={agentId} onChange={setAgentId} /></Field><Field label="Instructions"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} required /></Field><Field label="Optional workspace"><button type="button" className="secondary workspace-button" onClick={async () => { const path = await bridge.chooseWorkspace(); if (path) setWorkspace(path); }}>{workspace ? `📁 ${shortPath(workspace)}` : "Choose workspace folder"}</button></Field><Field label="Optional run time"><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field><div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button>Save task</button></div></form>}<div className="list-cards">{state.tasks.map((task) => <article key={task.id}><div><span className={`status ${task.status}`}>{task.status}</span><h3>{task.title}</h3><p>{task.prompt}</p>{task.workspaceRoot && <small>📁 {shortPath(task.workspaceRoot)}</small>}{task.dueAt && <small>Runs {new Date(task.dueAt).toLocaleString()}</small>}{task.result && <details><summary>Result</summary><pre>{task.result}</pre></details>}</div><div><button className="secondary" onClick={() => void action("Running task", () => bridge.runTask(task.id))}>Run now</button><button className="danger" onClick={() => void action("Deleting", () => bridge.deleteTask(task.id))}>Delete</button></div></article>)}</div>{!state.tasks.length && <Empty title="No local tasks" text="Run now or schedule work through a local model while Commons Desktop is open." />}</div>;
}

function WorkflowsPanel({ state, bridge, action }: { state: LocalState; bridge: Bridge; action: Action }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState("");
  const [agentId, setAgentId] = useState(state.agents[0]?.id ?? "");
  const [workspace, setWorkspace] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    const result = await action("Saving workflow", () => bridge.saveWorkflow({ name, agentId, workspaceRoot: workspace || undefined, steps: steps.split("\n").map((s) => s.trim()).filter(Boolean) }));
    if (result) { setOpen(false); setName(""); setSteps(""); setWorkspace(""); }
  }
  return <div className="stack"><div className="section-actions"><button disabled={!state.agents.length} onClick={() => setOpen(true)}>＋ Create workflow</button></div>{open && <form className="editor-card" onSubmit={save}><Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Agent"><AgentSelect agents={state.agents} value={agentId} onChange={setAgentId} /></Field><Field label="Steps — one instruction per line"><textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={7} required /></Field><Field label="Optional workspace"><button type="button" className="secondary workspace-button" onClick={async () => { const path = await bridge.chooseWorkspace(); if (path) setWorkspace(path); }}>{workspace ? `📁 ${shortPath(workspace)}` : "Choose workspace folder"}</button></Field><div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button>Save workflow</button></div></form>}<div className="list-cards">{state.workflows.map((workflow) => <article key={workflow.id}><div><h3>{workflow.name}</h3>{workflow.workspaceRoot && <small>📁 {shortPath(workflow.workspaceRoot)}</small>}<ol>{workflow.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>{workflow.lastResult && <details><summary>Last result</summary><pre>{workflow.lastResult}</pre></details>}</div><div><button className="secondary" onClick={() => void action("Running workflow", () => bridge.runWorkflow(workflow.id))}>Run</button><button className="danger" onClick={() => void action("Deleting", () => bridge.deleteWorkflow(workflow.id))}>Delete</button></div></article>)}</div>{!state.workflows.length && <Empty title="No local workflows" text="Chain local agent instructions and tools without sending workflow inputs to the cloud." />}</div>;
}

function AppsPanel({ state, bridge, action }: { state: LocalState; bridge: Bridge; action: Action }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [directory, setDirectory] = useState(""); const [command, setCommand] = useState("pnpm"); const [args, setArgs] = useState("dev"); const [previewUrl, setPreviewUrl] = useState("http://127.0.0.1:3000");
  async function save(e: FormEvent) { e.preventDefault(); const result = await action("Saving app", () => bridge.saveApp({ name, directory, command, args: splitArgs(args), previewUrl })); if (result) { setOpen(false); setName(""); } }
  return <div className="stack"><div className="section-actions"><button onClick={() => setOpen(true)}>＋ Register local app</button></div>{open && <form className="editor-card" onSubmit={save}><Field label="App name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field><Field label="Project directory"><div className="field-row"><input value={directory} readOnly required /><button type="button" className="secondary" onClick={async () => { const path = await bridge.chooseWorkspace(); if (path) setDirectory(path); }}>Choose</button></div></Field><div className="field-grid"><Field label="Command"><input value={command} onChange={(e) => setCommand(e.target.value)} required /></Field><Field label="Arguments"><input value={args} onChange={(e) => setArgs(e.target.value)} /></Field></div><Field label="Local preview URL"><input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} required /></Field><div className="form-actions"><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button><button>Save app</button></div></form>}<div className="card-grid">{state.apps.map((app) => <AppCard key={app.id} app={app} bridge={bridge} action={action} />)}</div>{!state.apps.length && <Empty title="No local apps" text="Agents can create app files and run build commands in your workspace. Register the local dev server here for a sandboxed preview." />}</div>;
}

function AppCard({ app, bridge, action }: { app: LocalApp; bridge: Bridge; action: Action }) { return <article className="entity-card"><span className="entity-icon">▣</span><span className={`status ${app.status}`}>{app.status}</span><h3>{app.name}</h3><p>{shortPath(app.directory)}</p><small>{app.command} {app.args.join(" ")} · {app.previewUrl}</small>{app.output && <details><summary>Process</summary><pre>{app.output}</pre></details>}<div>{app.status === "running" ? <button className="secondary" onClick={() => void action("Stopping app", () => bridge.stopApp(app.id))}>Stop</button> : <button onClick={() => void action("Starting app", () => bridge.startApp(app.id))}>Start</button>}<button className="secondary" onClick={() => void action("Opening preview", () => bridge.openApp(app.id))}>Preview</button><button className="danger" onClick={() => void action("Deleting", () => bridge.deleteApp(app.id))}>Delete</button></div></article>; }

function SettingsPanel({ state, bridge, action }: { state: LocalState; bridge: Bridge; action: Action }) {
  const [url, setUrl] = useState(state.settings.ollamaUrl); const [model, setModel] = useState(state.settings.defaultModel); const [permission, setPermission] = useState(state.settings.permissionMode); const [models, setModels] = useState<string[]>([]);
  async function discover() { const result = await action("Discovering models", () => bridge.listModels()); if (result) { setModels(result); if (!model && result[0]) setModel(result[0]); } }
  async function save(e: FormEvent) { e.preventDefault(); await action("Saving settings", () => bridge.updateSettings({ ollamaUrl: url, defaultModel: model, permissionMode: permission })); }
  return <div className="settings-layout"><form className="editor-card" onSubmit={save}><h2>Local model server</h2><p className="muted">Only loopback addresses are accepted in Private Local mode.</p><Field label="Ollama-compatible URL"><div className="field-row"><input value={url} onChange={(e) => setUrl(e.target.value)} /><button type="button" className="secondary" onClick={() => void discover()}>Discover</button></div></Field><Field label="Default model">{models.length ? <select value={model} onChange={(e) => setModel(e.target.value)}><option value="">Choose a model</option>{models.map((item) => <option key={item}>{item}</option>)}</select> : <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Install a model, then Discover" />}</Field><Field label="Local tool permissions"><select value={permission} onChange={(e) => setPermission(e.target.value as typeof permission)}><option value="ask">Ask before edits and commands</option><option value="read-only">Read only</option></select></Field><div className="form-actions"><button>Save settings</button></div></form><section className="privacy-card"><span>✓</span><div><h3>Private Local boundary</h3><p>The UI is bundled with the signed desktop app. Models are restricted to this computer, local state is protected through the OS credential store when available, and generated app previews receive no Agent Commons bridge.</p></div></section></div>;
}

function AgentSelect({ agents, value, onChange }: { agents: LocalAgent[]; value: string; onChange: (value: string) => void }) { return <select value={value} onChange={(e) => onChange(e.target.value)} required><option value="">Choose agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-panel"><span>✦</span><h2>{title}</h2><p>{text}</p></div>; }
function shortPath(path: string) { const parts = path.split(/[\\/]/).filter(Boolean); return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : path; }
function splitArgs(input: string) { return input.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? []; }

const labels: Record<Tab, string> = { chat: "Private chat", agents: "Local agents", knowledge: "Knowledge Spaces", tasks: "Tasks", workflows: "Workflows", apps: "Local apps", settings: "Private settings" };
const descriptions: Record<Tab, string> = { chat: "Conversations and tools run on this computer.", agents: "Create agents backed by models on your machine.", knowledge: "Use desktop files and folders as living local context.", tasks: "Run saved instructions through local agents.", workflows: "Chain repeatable local agent steps.", apps: "Build, run, and preview apps without publishing them.", settings: "Control local models and permissions." };
const icons: Record<Tab, LucideIcon> = { chat: MessageCircle, agents: Bot, knowledge: FolderSearch, tasks: BriefcaseBusiness, workflows: Workflow, apps: AppWindow, settings: Settings };
