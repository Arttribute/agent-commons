"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  Brain,
  CalendarCheck,
  Check,
  ChevronRight,
  Copy,
  FileText,
  ImageIcon,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import RandomAvatar from "@/components/account/random-avatar";
import { AgentAutonomy } from "@/components/agents/agent-autonomy";
import { AgentMcpSection } from "@/components/mcp/agent-mcp-section";
import { AddToAgentBalance } from "@/components/finances/add-to-agent-balance";
import { AgentTransactions } from "@/components/finances/agent-transactions";
import { AgentMemoryView } from "@/components/memory/agent-memory-view";
import SessionInterface from "@/components/sessions/session-interface";
import { StudioEntitySwitcher } from "@/components/studio/studio-entity-switcher";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import AgentTools from "@/components/tools/agent-tools";
import { CostDashboard } from "@/components/usage/cost-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAgents } from "@/hooks/use-agents";
import { useSkills } from "@/hooks/use-skills";
import { useAgentWallet } from "@/hooks/use-wallet";
import { cn } from "@/lib/utils";
import { normalizePrincipalId } from "@/lib/principal-id";
import { useAuth } from "@/context/AuthContext";
import { useAgentContext } from "@/context/AgentContext";
import type { CommonAgent } from "@/types/agent";
import type { Skill } from "@agent-commons/sdk";

type SectionKey =
  | "setup"
  | "new-session"
  | "sessions"
  | "tasks"
  | "tools"
  | "skills"
  | "artefacts"
  | "telemetry"
  | "usage"
  | "memory"
  | "wallet";

const sections: Array<{ key: SectionKey; label: string; icon: typeof Bot }> = [
  { key: "setup", label: "Agent setup", icon: Settings2 },
  { key: "new-session", label: "New session", icon: Plus },
  { key: "sessions", label: "Sessions", icon: MessageSquare },
  { key: "tasks", label: "Tasks", icon: CalendarCheck },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "artefacts", label: "Artefacts", icon: FileText },
  { key: "telemetry", label: "Telemetry", icon: TerminalSquare },
  { key: "usage", label: "Usage", icon: BarChart3 },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "wallet", label: "Wallet", icon: Wallet },
];

const modelProviders = ["openai", "anthropic", "google", "mistral", "groq", "openrouter", "xai", "custom", "ollama"];

function AgentPageSkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[280px] border-r p-4">
        <Skeleton className="h-16 w-full" />
        <div className="mt-6 space-y-2">
          {[...Array(11)].map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="mt-6 h-72 w-full" />
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-border/70 px-5 py-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/70 px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function shortId(id?: string) {
  if (!id) return "";
  return id.length > 14 ? `${id.slice(0, 7)}...${id.slice(-5)}` : id;
}

function relative(value?: string | null) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return formatDistanceToNow(date, { addSuffix: true });
}

function SetupView({
  agent,
  isOwner,
  onSaved,
}: {
  agent: CommonAgent;
  isOwner: boolean;
  onSaved: (agent: CommonAgent) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: agent.name || "",
    avatar: agent.avatar || "",
    persona: agent.persona || "",
    instructions: agent.instructions || "",
    description: agent.description || "",
    a2aEnabled: Boolean((agent as any).a2aEnabled),
    modelProvider: (agent as any).modelProvider || "openai",
    modelId: (agent as any).modelId || "",
    modelBaseUrl: (agent as any).modelBaseUrl || "",
    temperature: String((agent as any).temperature ?? 0.7),
    maxTokens: String((agent as any).maxTokens ?? 4096),
    topP: String((agent as any).topP ?? 1),
    presencePenalty: String((agent as any).presencePenalty ?? 0),
    frequencyPenalty: String((agent as any).frequencyPenalty ?? 0),
  });

  useEffect(() => {
    setForm({
      name: agent.name || "",
      avatar: agent.avatar || "",
      persona: agent.persona || "",
      instructions: agent.instructions || "",
      description: agent.description || "",
      a2aEnabled: Boolean((agent as any).a2aEnabled),
      modelProvider: (agent as any).modelProvider || "openai",
      modelId: (agent as any).modelId || "",
      modelBaseUrl: (agent as any).modelBaseUrl || "",
      temperature: String((agent as any).temperature ?? 0.7),
      maxTokens: String((agent as any).maxTokens ?? 4096),
      topP: String((agent as any).topP ?? 1),
      presencePenalty: String((agent as any).presencePenalty ?? 0),
      frequencyPenalty: String((agent as any).frequencyPenalty ?? 0),
    });
  }, [agent]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = {
        ...form,
        temperature: Number(form.temperature),
        maxTokens: Number(form.maxTokens),
        topP: Number(form.topP),
        presencePenalty: Number(form.presencePenalty),
        frequencyPenalty: Number(form.frequencyPenalty),
      };
      const res = await fetch(`/api/agents/${agent.agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        onSaved(data.data as CommonAgent);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader title="Agent setup" subtitle="Identity, discovery, behavior, and model configuration for this agent." />
      <div className="mx-auto grid max-w-5xl gap-4 p-5">
        <Panel
          title="Profile"
          action={
            <Button size="sm" className="h-8 gap-1.5" disabled={!isOwner || saving} onClick={save}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {saved ? "Saved" : "Save"}
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-2">
              {form.avatar ? (
                <img src={form.avatar} alt="" className="h-20 w-20 rounded-full border object-cover" />
              ) : (
                <RandomAvatar size={80} username={form.name || "agent"} />
              )}
              <Badge variant={form.a2aEnabled ? "default" : "secondary"} className="rounded-md">
                {form.a2aEnabled ? "Discoverable" : "Private"}
              </Badge>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Profile image URL</Label>
                  <Input value={form.avatar} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, avatar: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Description</Label>
                <Textarea className="min-h-20" value={form.description} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Public ecosystem discovery</p>
                  <p className="text-xs text-muted-foreground">Uses the current A2A discoverability flag for this agent.</p>
                </div>
                <Switch checked={form.a2aEnabled} disabled={!isOwner} onCheckedChange={(checked) => setForm((f) => ({ ...f, a2aEnabled: checked }))} />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Behavior">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Persona</Label>
              <Textarea className="min-h-24" value={form.persona} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>System prompt</Label>
              <Textarea className="min-h-44 font-mono text-sm" value={form.instructions} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))} />
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel title="Model">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Provider</Label>
                <Select value={form.modelProvider} disabled={!isOwner} onValueChange={(value) => setForm((f) => ({ ...f, modelProvider: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{modelProviders.map((provider) => <SelectItem key={provider} value={provider}>{provider}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Model ID</Label>
                <Input value={form.modelId} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))} />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label>Base URL</Label>
                <Input value={form.modelBaseUrl} disabled={!isOwner} onChange={(e) => setForm((f) => ({ ...f, modelBaseUrl: e.target.value }))} />
              </div>
              {(["temperature", "maxTokens", "topP", "presencePenalty", "frequencyPenalty"] as const).map((field) => (
                <div key={field} className="grid gap-1.5">
                  <Label className="capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                  <Input value={form[field]} disabled={!isOwner} type="number" step="0.1" onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
            </div>
          </Panel>
          <AgentAutonomy agentId={agent.agentId} isOwner={isOwner} />
        </div>
      </div>
    </div>
  );
}

function SessionsView({
  agent,
  sessions,
  selectedSession,
  userAddress,
  loadingSession,
  onSelectSession,
  onCreateSession,
}: {
  agent: CommonAgent;
  sessions: any[];
  selectedSession: any;
  userAddress: string;
  loadingSession: boolean;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter((session) => !q || (session.title || "New session").toLowerCase().includes(q) || session.sessionId.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [sessions, search]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 border-r border-border bg-muted/15">
        <div className="border-b border-border/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Sessions</h2>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onCreateSession}>
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 pl-8" placeholder="Search sessions" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-158px)]">
          <div className="p-2">
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No sessions found.</div>
            ) : filtered.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                className={cn("mb-1 w-full rounded-md px-3 py-2 text-left hover:bg-muted", selectedSession?.sessionId === session.sessionId && "bg-accent text-accent-foreground")}
                onClick={() => onSelectSession(session.sessionId)}
              >
                <p className="truncate text-sm font-medium">{session.title || "New session"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{relative(session.createdAt)} · {shortId(session.sessionId)}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>
      <div className="min-h-0">
        {selectedSession ? (
          <SessionInterface agent={agent} session={selectedSession} agentId={agent.agentId} sessionId={selectedSession.sessionId} userId={userAddress} height="calc(100vh - 180px)" isLoadingSession={loadingSession} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a session to view its conversation.</div>
        )}
      </div>
    </div>
  );
}

function ToolsView({ agentId, agentTools, setAgentTools }: { agentId: string; agentTools: any[]; setAgentTools: (tools: any[]) => void }) {
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "not-connected">("all");

  const selectedTool = useMemo(() => {
    if (agentTools.length === 0) return null;
    return agentTools.find((tool) => (tool.id ?? tool.toolId ?? tool.name) === selectedToolId) ?? agentTools[0];
  }, [agentTools, selectedToolId]);

  const filteredTools = useMemo(() => {
    if (statusFilter === "all") return agentTools;
    return agentTools.filter((tool) => {
      const connected = !["disabled", "disconnected", "error"].includes(String(tool.status || "").toLowerCase());
      return statusFilter === "connected" ? connected : !connected;
    });
  }, [agentTools, statusFilter]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-h-0 border-r border-border bg-muted/15">
        <div className="border-b border-border/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Tools</h2>
            <AgentTools agentTools={agentTools} setAgentTools={setAgentTools} agentId={agentId} />
          </div>
          <div className="mt-3 flex gap-1">
            {[
              ["all", "All"],
              ["connected", "Connected"],
              ["not-connected", "Not connected"],
            ].map(([value, label]) => (
              <Button
                key={value}
                variant={statusFilter === value ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-md"
                onClick={() => setStatusFilter(value as typeof statusFilter)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-150px)]">
          <div className="p-2">
            {filteredTools.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No tools in this filter.</div>
            ) : filteredTools.map((tool) => {
              const id = tool.id ?? tool.toolId ?? tool.name;
              const active = selectedTool && (selectedTool.id ?? selectedTool.toolId ?? selectedTool.name) === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={cn("mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted", active && "bg-accent text-accent-foreground")}
                  onClick={() => setSelectedToolId(id)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    <Wrench className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{tool.displayName || tool.name || tool.toolId || "Tool"}</p>
                    <p className="truncate text-xs text-muted-foreground">{tool.category || tool.status || "Configured"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
      <div className="min-h-0 overflow-auto">
        <SectionHeader title={selectedTool ? (selectedTool.displayName || selectedTool.name || "Tool") : "Tools"} subtitle="Connector configuration, status, and permission posture for this agent." />
        <div className="mx-auto max-w-4xl space-y-4 p-5">
          {!selectedTool ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">Connect a tool to configure how this agent can use it.</div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Stat label="Status" value={selectedTool.status || "enabled"} />
                <Stat label="Tool ID" value={shortId(selectedTool.toolId || selectedTool.id || selectedTool.name)} />
                <Stat label="Permission" value={selectedTool.permission || "Needs approval"} />
              </div>
              <Panel title="Details">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{selectedTool.description || selectedTool.tool?.description || "No description available."}</p>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Configuration</p>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">
                      {JSON.stringify(selectedTool.config || selectedTool.configuration || selectedTool.tool || selectedTool, null, 2)}
                    </pre>
                  </div>
                </div>
              </Panel>
              <Panel title="Tool permissions">
                <div className="space-y-2">
                  {["Read-only actions", "Write/delete actions", "External side effects"].map((group, index) => (
                    <div key={group} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{group}</p>
                        <p className="text-xs text-muted-foreground">{index === 0 ? "Allowed with approval by default." : "Requires approval before execution."}</p>
                      </div>
                      <Badge variant="secondary" className="rounded-md">Needs approval</Badge>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
          <AgentMcpSection agentId={agentId} />
        </div>
      </div>
    </div>
  );
}

function SkillsView({ agentId }: { agentId: string }) {
  const { skills, loading, refresh } = useSkills({ ownerId: agentId, ownerType: "agent" });
  const [editing, setEditing] = useState<Skill | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "", instructions: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const beginEdit = (skill?: Skill) => {
    const next = skill ?? null;
    setEditing(next);
    setDraft({
      name: next?.name ?? "",
      description: next?.description ?? "",
      instructions: next?.instructions ?? "",
      tags: (next?.tags ?? []).join(", "),
    });
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.instructions.trim()) return;
    setSaving(true);
    const tags = draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
    const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    try {
      await fetch(editing ? `/api/skills/${editing.skillId}` : "/api/skills", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          slug: editing?.slug ?? `${agentId.slice(0, 8)}-${slug || "skill"}`,
          tags,
          ownerId: agentId,
          ownerType: "agent",
          isPublic: false,
          source: "user",
        }),
      });
      setEditing(null);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader title="Skills" subtitle="Reusable instructions this agent can follow." />
      <div className="mx-auto grid max-w-5xl gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Agent skills" action={<Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => beginEdit()}><Plus className="h-3.5 w-3.5" />New</Button>}>
          {loading ? <Skeleton className="h-32 w-full" /> : skills.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No skills configured for this agent yet.</div>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <button key={skill.skillId} type="button" className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/40" onClick={() => beginEdit(skill)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{skill.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
                    </div>
                    <Badge variant={skill.isActive ? "default" : "secondary"} className="rounded-md">{skill.isActive ? "active" : "inactive"}</Badge>
                  </div>
                  {skill.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{skill.tags.map((tag) => <Badge key={tag} variant="outline" className="rounded-md">{tag}</Badge>)}</div>}
                </button>
              ))}
            </div>
          )}
        </Panel>
        <Panel title={editing ? "Edit skill" : "Create skill"}>
          <div className="space-y-3">
            <div className="grid gap-1.5"><Label>Name</Label><Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Description</Label><Textarea className="min-h-20" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Instructions</Label><Textarea className="min-h-40 font-mono text-sm" value={draft.instructions} onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>Tags</Label><Input value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="research, writing" /></div>
            <Button className="w-full gap-1.5" disabled={saving || !draft.name.trim() || !draft.instructions.trim()} onClick={save}>{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save skill</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ArtefactsView({ sessions, tasks }: { sessions: any[]; tasks: any[] }) {
  const artefacts = useMemo(() => {
    const items: any[] = [];
    for (const session of sessions) {
      for (const message of session.history ?? []) {
        const metadataArtifacts = message.metadata?.artifacts ?? message.metadata?.files ?? [];
        for (const artifact of Array.isArray(metadataArtifacts) ? metadataArtifacts : []) {
          items.push({ ...artifact, source: session.title || "Session", createdAt: message.timestamp || session.createdAt });
        }
      }
    }
    for (const task of tasks) {
      const result = task.resultContent;
      const taskArtifacts = Array.isArray(result?.artifacts) ? result.artifacts : [];
      for (const artifact of taskArtifacts) items.push({ ...artifact, source: task.title, createdAt: task.createdAt });
    }
    return items;
  }, [sessions, tasks]);

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader title="Artefacts" subtitle="Files, documents, images, and structured outputs produced by this agent when available." />
      <div className="mx-auto max-w-5xl p-5">
        {artefacts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium">No artefacts found</p>
            <p className="mt-1 text-sm text-muted-foreground">Generated files will appear here once sessions or tasks attach artifact metadata.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {artefacts.map((artifact, index) => (
              <div key={`${artifact.artifactId ?? artifact.name ?? index}`} className="rounded-lg border border-border p-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <p className="mt-3 truncate text-sm font-medium">{artifact.name || artifact.artifactId || "Untitled artefact"}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{artifact.description || artifact.mimeType || artifact.type || "Generated output"}</p>
                <p className="mt-3 text-xs text-muted-foreground">{artifact.source} · {relative(artifact.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TelemetryView({ agentId }: { agentId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs/agents/${agentId}?limit=100`);
      const data = await res.json();
      setLogs(data.data ?? data.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { load(); }, [load]);

  const toolCalls = logs.reduce((sum, log) => sum + (Array.isArray(log.tools) ? log.tools.length : 0), 0);
  const errors = logs.filter((log) => ["error", "failed"].includes(String(log.status || "").toLowerCase())).length;
  const avgLatency = logs.length ? Math.round(logs.reduce((sum, log) => sum + Number(log.response_time || log.responseTime || 0), 0) / logs.length) : 0;

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader title="Telemetry" subtitle="Recent execution logs, tool activity, and health signals for this agent." />
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Events" value={logs.length} />
          <Stat label="Tool calls" value={toolCalls} />
          <Stat label="Errors" value={errors} />
          <Stat label="Avg latency" value={avgLatency ? `${avgLatency} ms` : "n/a"} />
        </div>
        <Panel title="Recent activity" action={<Button variant="ghost" size="icon" className="h-8 w-8" onClick={load}><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></Button>}>
          {logs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No telemetry events found.</div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div key={log.log_id ?? log.id ?? index} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{log.action || log.eventType || log.message || "Agent event"}</p>
                    <Badge variant={String(log.status).toLowerCase() === "error" ? "destructive" : "secondary"} className="rounded-md">{log.status || "ok"}</Badge>
                  </div>
                  {log.message && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{log.message}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">{relative(log.created_at || log.createdAt || log.timestamp)} {log.session_id ? `· ${shortId(log.session_id)}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function UsageView({ agentId }: { agentId: string }) {
  const [range, setRange] = useState<"7d" | "30d" | "lifetime">("30d");
  const dates = useMemo(() => {
    if (range === "lifetime") return {};
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (range === "7d" ? 7 : 30));
    return { from: from.toISOString(), to: to.toISOString() };
  }, [range]);

  return (
    <div className="min-h-0 overflow-auto">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">Model calls, token volume, and cost for this agent.</p>
        </div>
        <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
          {[
            ["7d", "7d"],
            ["30d", "30d"],
            ["lifetime", "Lifetime"],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant={range === value ? "secondary" : "ghost"}
              size="sm"
              className="h-8 rounded"
              onClick={() => setRange(value as typeof range)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid min-h-[calc(100vh-132px)] grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 border-r border-border p-5">
          <CostDashboard agentId={agentId} from={dates.from} to={dates.to} />
        </div>
        <aside className="space-y-4 p-5">
          <Panel title="Scope">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Agent</span>
                <span className="font-mono text-xs">{shortId(agentId)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Timeline</span>
                <Badge variant="secondary" className="rounded-md">{range}</Badge>
              </div>
            </div>
          </Panel>
          <Panel title="Cost controls">
            <div className="space-y-3">
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 w-1/5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground">Agent-level budgets are not configured in this workspace yet.</p>
            </div>
          </Panel>
          <Panel title="Breakdown">
            <div className="space-y-2">
              {["LLM calls", "Input tokens", "Output tokens"].map((item) => (
                <div key={item} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <span>{item}</span>
                  <span className="text-muted-foreground">Tracked</span>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function WalletView({ agentId }: { agentId: string }) {
  const { wallet, balance, loading, balanceLoading } = useAgentWallet(agentId);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader title="Wallet" subtitle="Funding, balances, and wallet activity for this agent." />
      <div className="mx-auto grid max-w-5xl gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Primary wallet">
          {loading ? <Skeleton className="h-32 w-full" /> : wallet ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="USDC" value={balanceLoading ? "Loading" : balance?.usdc ?? "0"} />
                <Stat label="Native" value={balanceLoading ? "Loading" : balance?.native ?? "0"} />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <Label className="text-xs text-muted-foreground">Address</Label>
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm">{wallet.address}</p>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copy}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
                </div>
              </div>
              <AddToAgentBalance agentId={agentId} />
            </div>
          ) : (
            <AddToAgentBalance agentId={agentId} />
          )}
        </Panel>
        <Panel title="Transactions">
          <AgentTransactions transactions={[]} />
          <p className="mt-3 text-xs text-muted-foreground">Transaction history is shown when wallet transaction records are available from the wallet provider.</p>
        </Panel>
      </div>
    </div>
  );
}

export default function AgentStudioPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: agentId } = use(params);
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents } = useAgents(userAddress || undefined);
  const { setMessages, clearMessages } = useAgentContext();

  const [activeSection, setActiveSection] = useState<SectionKey>("new-session");
  const [agent, setAgent] = useState<CommonAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentTools, setAgentTools] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);

  const isOwner = Boolean(userAddress && agent && ((agent as any).ownerUserId === userAddress || agent.owner === userAddress));

  const loadAgent = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const [agentRes, toolsRes] = await Promise.all([
        fetch(`/api/agents/${agentId}`),
        fetch(`/api/agents/${agentId}/tools`),
      ]);
      const agentData = await agentRes.json();
      const toolsData = await toolsRes.json();
      setAgent(agentRes.ok ? (agentData.data as CommonAgent) : null);
      setAgentTools(toolsData.data || []);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const loadSessions = useCallback(async () => {
    if (!agentId || !userAddress) return;
    const res = await fetch(`/api/sessions/list?agentId=${agentId}`);
    const data = await res.json();
    const list = (data?.data || []).sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    setSessions(list);
  }, [agentId, userAddress]);

  const loadTasks = useCallback(async () => {
    if (!agentId) return;
    const res = await fetch(`/api/tasks?agentId=${agentId}`);
    const data = await res.json();
    setTasks(data.data ?? []);
  }, [agentId]);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingSession(true);
    clearMessages();
    try {
      const res = await fetch(`/api/sessions/${sessionId}?full=true`);
      const data = await res.json();
      const session = data.data ?? null;
      setSelectedSession(session);
      setMessages(session?.history || []);
    } finally {
      setLoadingSession(false);
    }
  }, [clearMessages, setMessages]);

  const createSession = useCallback(async () => {
    if (!agentId || !userAddress) return;
    setLoadingSession(true);
    clearMessages();
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, initiator: userAddress }),
      });
      const data = await res.json();
      const session = data.data ?? null;
      if (session) {
        setSelectedSession(session);
        setSessions((prev) => [session, ...prev.filter((item) => item.sessionId !== session.sessionId)]);
        setActiveSection("new-session");
        setMessages([]);
      }
    } finally {
      setLoadingSession(false);
    }
  }, [agentId, userAddress, clearMessages, setMessages]);

  useEffect(() => { loadAgent(); }, [loadAgent]);
  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!selectedSession && sessions[0]?.sessionId && activeSection !== "new-session") {
      loadSession(sessions[0].sessionId);
    }
  }, [sessions, selectedSession, activeSection, loadSession]);

  useEffect(() => {
    if (activeSection === "new-session") createSession();
  }, [activeSection, createSession]);

  if (loading) return <AgentPageSkeleton />;
  if (!agent) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Agent not found</div>;
  }

  const renderSection = () => {
    switch (activeSection) {
      case "setup":
        return <SetupView agent={agent} isOwner={isOwner} onSaved={setAgent} />;
      case "new-session":
        return <SessionInterface agent={agent} session={selectedSession} agentId={agentId} sessionId={selectedSession?.sessionId || ""} userId={userAddress} height="calc(100vh - 180px)" isLoadingSession={loadingSession} onSessionCreated={(sessionId) => loadSession(sessionId)} />;
      case "sessions":
        return <SessionsView agent={agent} sessions={sessions} selectedSession={selectedSession} userAddress={userAddress} loadingSession={loadingSession} onSelectSession={loadSession} onCreateSession={createSession} />;
      case "tasks":
        return <TaskManagementView userAddress={userAddress} agentId={agentId} hideAgentFilter preSelectedAgentId={agentId} />;
      case "tools":
        return <ToolsView agentId={agentId} agentTools={agentTools} setAgentTools={setAgentTools} />;
      case "skills":
        return <SkillsView agentId={agentId} />;
      case "artefacts":
        return <ArtefactsView sessions={sessions} tasks={tasks} />;
      case "telemetry":
        return <TelemetryView agentId={agentId} />;
      case "usage":
        return <UsageView agentId={agentId} />;
      case "memory":
        return <div className="min-h-0 overflow-auto"><SectionHeader title="Memory" subtitle="Review, search, add, and remove memory entries for this agent." /><div className="mx-auto max-w-5xl p-5"><Panel title="Memory store"><AgentMemoryView agentId={agentId} /></Panel></div></div>;
      case "wallet":
        return <WalletView agentId={agentId} />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push("/studio/agents")} aria-label="Back to agents">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <StudioEntitySwitcher type="agent" currentId={agentId} currentName={agent.name} items={agents.map((item) => ({ id: item.agentId, name: item.name }))} />
        </div>
        <Badge variant="outline" className="hidden rounded-md sm:inline-flex">{shortId(agentId)}</Badge>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-border bg-muted/10">
          <div className="border-b border-border/70 p-4">
            <div className="flex items-center gap-3">
              {agent.avatar ? <img src={agent.avatar} alt="" className="h-11 w-11 rounded-full border object-cover" /> : <RandomAvatar size={44} username={agent.name || "agent"} />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{agent.name}</p>
                <p className="truncate text-xs text-muted-foreground">{(agent as any).modelId || "No model selected"}</p>
              </div>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-120px)]">
            <nav className="space-y-1 p-2">
              {sections.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={cn("flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground", activeSection === key && "bg-accent text-accent-foreground")}
                  onClick={() => setActiveSection(key)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {activeSection === key && <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              ))}
            </nav>
          </ScrollArea>
        </aside>
        <main className="min-h-0 min-w-0">{renderSection()}</main>
      </div>
    </div>
  );
}
