"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  Brain,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  ImageIcon,
  Loader2,
  MessageSquare,
  Monitor,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
  Wallet,
  Wrench,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import RandomAvatar from "@/components/account/random-avatar";
import { AgentAutonomy } from "@/components/agents/agent-autonomy";
import { AgentMcpSection } from "@/components/mcp/agent-mcp-section";
import { AddToAgentBalance } from "@/components/finances/add-to-agent-balance";
import { AgentTransactions } from "@/components/finances/agent-transactions";
import { AgentMemoryView } from "@/components/memory/agent-memory-view";
import { AgentComputerPanel } from "@/components/computers/agent-computer-panel";
import SessionInterface from "@/components/sessions/session-interface";
import { StudioEntitySwitcher } from "@/components/studio/studio-entity-switcher";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import { ToolIcon } from "@/components/tools/catalog/tool-icon";
import { ScopePermissions } from "@/components/tools/catalog/scope-permissions";
import { CostDashboard } from "@/components/usage/cost-dashboard";
import type { ToolCatalogItem } from "@/lib/tools/catalog";
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
  | "computer"
  | "tasks"
  | "tools"
  | "skills"
  | "artefacts"
  | "observability"
  | "usage"
  | "memory"
  | "wallet";

const sections: Array<{ key: SectionKey; label: string; icon: typeof Bot }> = [
  { key: "setup", label: "Agent setup", icon: Settings2 },
  { key: "new-session", label: "New session", icon: Plus },
  { key: "sessions", label: "Sessions", icon: MessageSquare },
  { key: "computer", label: "Computer", icon: Monitor },
  { key: "tasks", label: "Tasks", icon: CalendarCheck },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "artefacts", label: "Artefacts", icon: FileText },
  { key: "observability", label: "Observability", icon: TerminalSquare },
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
    greeting: agent.greeting || "",
    conversationStarters: (agent.conversationStarters || []).join("\n"),
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
      greeting: agent.greeting || "",
      conversationStarters: (agent.conversationStarters || []).join("\n"),
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
        conversationStarters: form.conversationStarters
          .split("\n")
          .map((starter) => starter.trim())
          .filter(Boolean),
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
              <Label>Greeting</Label>
              <Textarea
                className="min-h-20"
                value={form.greeting}
                disabled={!isOwner}
                onChange={(e) => setForm((f) => ({ ...f, greeting: e.target.value }))}
                placeholder="A short optional message shown before the first user message."
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Conversation starters</Label>
              <Textarea
                className="min-h-24"
                value={form.conversationStarters}
                disabled={!isOwner}
                onChange={(e) => setForm((f) => ({ ...f, conversationStarters: e.target.value }))}
                placeholder={"One starter per line"}
              />
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
  const { streamingTitleSessionId, streamingTitleText } = useAgentContext();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions
      .filter((session) => !q || (session.title || "New session").toLowerCase().includes(q) || session.sessionId.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [sessions, search]);

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-muted/15">
        <div className="shrink-0 border-b border-border/70 p-3">
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
        <ScrollArea className="min-h-0 flex-1">
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
                {(() => {
                  const isStreaming = session.sessionId === streamingTitleSessionId;
                  const displayTitle = isStreaming ? (streamingTitleText || "...") : (session.title || "New session");
                  return (
                    <p className="truncate text-sm font-medium flex items-center gap-0.5">
                      {displayTitle}
                      {isStreaming && <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse shrink-0" />}
                    </p>
                  );
                })()}
                <p className="mt-0.5 text-xs text-muted-foreground">{relative(session.createdAt)} · {shortId(session.sessionId)}</p>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>
      <div className="min-h-0 overflow-hidden">
        {selectedSession ? (
          <SessionInterface agent={agent} session={selectedSession} agentId={agent.agentId} sessionId={selectedSession.sessionId} userId={userAddress} height="100%" isLoadingSession={loadingSession} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Select a session to view its conversation.</div>
        )}
      </div>
    </div>
  );
}

function ToolsView({ agentId, agentTools, setAgentTools }: { agentId: string; agentTools: any[]; setAgentTools: (tools: any[]) => void }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<ToolCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "connected" | "not-connected">("all");
  const [toggling, setToggling] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [usageComments, setUsageComments] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    setLoadingCatalog(true);
    fetch("/api/tools/catalog", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        // Show everything except agent-processors and workflow-invocation items
        const items: ToolCatalogItem[] = (d.items ?? []).filter(
          (i: ToolCatalogItem) => i.category !== "agents" && i.category !== "workflows",
        );
        setCatalog(items);
      })
      .catch(() => {})
      .finally(() => setLoadingCatalog(false));
  }, []);

  // An item is "connected to this agent" when it has a toolId and an assignment exists
  const getAssignment = (item: ToolCatalogItem) =>
    agentTools.find((t) => t.toolId === item.tool?.toolId);

  const isConnected = (item: ToolCatalogItem): boolean => {
    if (item.tool?.toolId) return Boolean(getAssignment(item));
    // OAuth/MCP: connected at platform level
    return item.status === "connected";
  };

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      if (statusFilter === "connected") return isConnected(item);
      if (statusFilter === "not-connected") return !isConnected(item);
      return true;
    });
  }, [catalog, agentTools, statusFilter]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return filteredCatalog[0] ?? null;
    return catalog.find((i) => i.id === selectedItemId) ?? filteredCatalog[0] ?? null;
  }, [catalog, filteredCatalog, selectedItemId]);

  // Sync local config state when selection changes
  useEffect(() => {
    if (!selectedItem) return;
    const assignment = getAssignment(selectedItem);
    setUsageComments(assignment?.usageComments ?? "");
    setIsEnabled(assignment?.isEnabled ?? true);
  }, [selectedItem?.id, agentTools]);

  const connect = async (item: ToolCatalogItem) => {
    if (!item.tool?.toolId) return;
    setToggling(item.id);
    try {
      const res = await fetch(`/api/agents/${agentId}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: item.tool.toolId }),
      });
      const data = await res.json();
      if (data?.data) setAgentTools([...agentTools, data.data]);
    } finally {
      setToggling(null);
    }
  };

  const disconnect = async (item: ToolCatalogItem) => {
    const assignment = getAssignment(item);
    if (!assignment) return;
    setToggling(item.id);
    try {
      await fetch(`/api/agents/tools/${assignment.id}`, { method: "DELETE" });
      setAgentTools(agentTools.filter((t) => t.id !== assignment.id));
    } finally {
      setToggling(null);
    }
  };

  const saveConfig = async () => {
    if (!selectedItem) return;
    const assignment = getAssignment(selectedItem);
    if (!assignment) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/agents/tools/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageComments, isEnabled }),
      });
      const data = await res.json();
      if (data?.data) {
        setAgentTools(agentTools.map((t) => (t.id === assignment.id ? data.data : t)));
      }
    } finally {
      setSavingConfig(false);
    }
  };

  const isAssignable = (item: ToolCatalogItem) => Boolean(item.tool?.toolId);

  const connectedCount = catalog.filter(isConnected).length;

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-muted/15">
        <div className="shrink-0 border-b border-border/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Tools</h2>
            <Badge variant="secondary" className="h-5 px-1.5 text-[11px] font-normal">
              {connectedCount} connected
            </Badge>
          </div>
          <div className="mt-3 flex gap-1">
            {(["all", "connected", "not-connected"] as const).map((value) => (
              <Button
                key={value}
                variant={statusFilter === value ? "secondary" : "ghost"}
                size="sm"
                className="h-8 rounded-md capitalize"
                onClick={() => setStatusFilter(value)}
              >
                {value === "not-connected" ? "Not connected" : value.charAt(0).toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {loadingCatalog ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="p-2">
              {filteredCatalog.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No tools in this filter.
                </div>
              ) : (
                filteredCatalog.map((item) => {
                  const active = selectedItem?.id === item.id;
                  const connected = isConnected(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "mb-0.5 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted",
                        active && "bg-accent text-accent-foreground",
                      )}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <ToolIcon item={item} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.categoryLabel}</p>
                      </div>
                      {connected && (
                        <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Connected" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </ScrollArea>
      </aside>

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div className="min-h-0 overflow-auto">
        {!selectedItem ? (
          <>
            <SectionHeader title="Tools" subtitle="Select a tool from the list to configure it for this agent." />
            <div className="flex items-center justify-center p-12">
              <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
                Connect a tool to configure how this agent can use it.
              </div>
            </div>
          </>
        ) : (
          <>
            <SectionHeader
              title={selectedItem.displayName}
              subtitle={
                selectedItem.categoryLabel +
                " · " +
                (isConnected(selectedItem)
                  ? isAssignable(selectedItem)
                    ? "Connected to this agent"
                    : "Connected"
                  : "Not connected")
              }
            />
            <div className="mx-auto max-w-4xl space-y-4 p-5">
              {/* Description */}
              <Panel title="About this tool">
                <p className="text-sm leading-6 text-muted-foreground">{selectedItem.description}</p>
                {selectedItem.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedItem.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
                {selectedItem.documentationUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => window.open(selectedItem.documentationUrl, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Documentation
                  </Button>
                )}
              </Panel>

              {/* Assignable tools (custom / system) — per-agent config */}
              {isAssignable(selectedItem) && isConnected(selectedItem) && (
                <Panel title="Agent configuration">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Enabled for this agent</p>
                        <p className="text-xs text-muted-foreground">When disabled the agent cannot invoke this tool.</p>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={setIsEnabled}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Usage instructions</Label>
                      <Textarea
                        placeholder="Describe when and how this agent should use this tool…"
                        className="resize-none text-sm"
                        rows={3}
                        value={usageComments}
                        onChange={(e) => setUsageComments(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">These instructions are passed to the agent at runtime alongside the tool definition.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
                        {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => disconnect(selectedItem)}
                        disabled={toggling === selectedItem.id}
                      >
                        {toggling === selectedItem.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </Panel>
              )}

              {/* Assignable tools — not yet connected */}
              {isAssignable(selectedItem) && !isConnected(selectedItem) && (
                <Panel title="Connect to this agent">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                      Connect this tool to make it available for the agent to invoke during sessions.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => connect(selectedItem)}
                      disabled={toggling === selectedItem.id}
                    >
                      {toggling === selectedItem.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                      Connect
                    </Button>
                  </div>
                </Panel>
              )}

              {/* OAuth tools — scoped permissions, Claude-connectors style */}
              {!isAssignable(selectedItem) && selectedItem.connectionMode === "oauth" && (
                <div className="rounded-lg border border-border bg-background p-4">
                  <ScopePermissions
                    item={selectedItem}
                    returnUrl={`/studio/agents/${agentId}`}
                  />
                </div>
              )}

              {/* MCP tools — platform-level connection */}
              {!isAssignable(selectedItem) && selectedItem.connectionMode !== "oauth" && (
                <Panel title={isConnected(selectedItem) ? "Connection status" : "Setup required"}>
                  {isConnected(selectedItem) ? (
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Connected</p>
                        <p className="text-sm text-muted-foreground">
                          This MCP connection is active and available to your agents.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => router.push("/studio/tools")}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Manage in Tools
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Not connected</p>
                        <p className="text-sm text-muted-foreground">
                          This MCP server must be configured before agents can use it.
                        </p>
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => router.push("/studio/tools")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Set up in Tools
                        </Button>
                      </div>
                    </div>
                  )}
                </Panel>
              )}

              {/* MCP servers for this agent */}
              <AgentMcpSection agentId={agentId} />
            </div>
          </>
        )}
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

type ObservabilityRange = "1h" | "12h" | "24h" | "7d" | "30d";

type ObservabilityLog = {
  id: string;
  logId: string;
  action: string;
  status: string;
  message: string;
  timestamp: string;
  createdAt: string;
  responseTimeMs: number;
  sessionId?: string | null;
  tools?: Array<{ name: string; status: string; summary?: string; duration?: number }>;
};

type ObservabilityToolCall = {
  id: string;
  logId?: string;
  source: string;
  toolId?: string;
  toolName: string;
  status: string;
  durationMs: number;
  startedAt: string;
  completedAt?: string | null;
  sessionId?: string | null;
  summary?: string | null;
  errorMessage?: string | null;
  rateLimitHit?: boolean;
  inputArgs?: Record<string, any> | null;
  outputData?: any;
};

type ObservabilityPayload = {
  summary: {
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    warnings: number;
    successRate: number;
    errorRate: number;
    toolCalls: number;
    failedToolCalls: number;
    rateLimitedToolCalls: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    avgToolDurationMs: number;
    p95ToolDurationMs: number;
    usage: {
      calls: number;
      totalTokens: number;
      totalCostUsd: number;
      avgDurationMs: number;
    };
    tasks: {
      total: number;
      completed: number;
      failed: number;
      running: number;
      pending: number;
      cancelled: number;
      avgDurationMs: number;
      p95DurationMs: number;
    };
  };
  timeline: Array<{
    bucket: string;
    events: number;
    successes: number;
    failures: number;
    warnings: number;
    toolCalls: number;
    failedToolCalls: number;
    avgResponseTimeMs: number;
    tokens: number;
    costUsd: number;
    tasksCompleted: number;
    tasksFailed: number;
  }>;
  logs: ObservabilityLog[];
  toolCalls: ObservabilityToolCall[];
  embeddedToolCalls: ObservabilityToolCall[];
  toolRollups: Array<{
    id: string;
    name: string;
    calls: number;
    successes: number;
    failures: number;
    warnings: number;
    rateLimited: number;
    successRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    lastCalledAt: string;
  }>;
  usage: {
    models: Array<{
      provider: string;
      modelId: string;
      calls: number;
      totalTokens: number;
      costUsd: number;
      avgDurationMs: number;
    }>;
  };
  tasks: {
    recent: Array<{
      taskId: string;
      title: string;
      status: string;
      progress?: number | null;
      durationMs?: number | null;
      errorMessage?: string | null;
      summary?: string | null;
      updatedAt: string;
    }>;
  };
};

const observabilityRanges: Array<{ value: ObservabilityRange; label: string }> = [
  { value: "1h", label: "1 hour" },
  { value: "12h", label: "12 hours" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

function observabilityWindow(range: ObservabilityRange) {
  const to = new Date();
  const from = new Date(to);
  const hoursByRange: Record<ObservabilityRange, number> = {
    "1h": 1,
    "12h": 12,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  from.setHours(to.getHours() - hoursByRange[range]);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatMs(value?: number | null) {
  if (!value) return "n/a";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}

function formatCost(value?: number | null) {
  if (!value) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

function compactNumber(value?: number | null) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function compactTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusIsBad(status?: string) {
  return ["error", "failed", "timeout", "unauthorized", "cancelled"].includes(String(status || "").toLowerCase());
}

function statusIsBusy(status?: string) {
  return ["pending", "running", "started"].includes(String(status || "").toLowerCase());
}

function observabilityStatusClass(status?: string) {
  if (statusIsBad(status)) return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300";
  if (String(status).toLowerCase() === "warning") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300";
  if (statusIsBusy(status)) return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function ObservabilityStat({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const iconClass = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
    warn: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
    bad: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300",
  }[tone];
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-semibold tracking-tight">{value}</p>
        </div>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", iconClass)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyObservabilityState({ text }: { text: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ObservabilityView({ agentId }: { agentId: string }) {
  const [range, setRange] = useState<ObservabilityRange>("24h");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payload, setPayload] = useState<ObservabilityPayload | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const dates = observabilityWindow(range);
      const params = new URLSearchParams({ ...dates, limit: "300" });
      const res = await fetch(`/api/agents/${agentId}/observability?${params.toString()}`);
      const data = await res.json();
      const nextPayload = (data.data ?? data) as ObservabilityPayload;
      setPayload(nextPayload);
      setSelectedLogId((current) => {
        if (current && nextPayload.logs?.some((log) => log.id === current)) return current;
        return nextPayload.logs?.[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [agentId, range]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = payload?.summary;
  const logs = payload?.logs ?? [];
  const toolCalls = payload?.toolCalls?.length ? payload.toolCalls : payload?.embeddedToolCalls ?? [];
  const selectedLog = logs.find((log) => log.id === selectedLogId) ?? logs[0] ?? null;
  const chartData = (payload?.timeline ?? []).map((point) => ({
    ...point,
    time: compactTime(point.bucket),
  }));

  const filteredLogs = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      const status = String(log.status || "info").toLowerCase();
      if (statusFilter !== "all" && statusFilter !== status) return false;
      if (!needle) return true;
      return `${log.action} ${log.message} ${log.sessionId ?? ""} ${status}`.toLowerCase().includes(needle);
    });
  }, [logs, searchTerm, statusFilter]);

  const selectedLogTools = selectedLog?.tools ?? [];
  const recentTasks = payload?.tasks?.recent ?? [];
  const failedTasks = recentTasks.filter((task) => statusIsBad(task.status)).slice(0, 4);
  const modelRollups = payload?.usage?.models ?? [];
  const toolRollups = payload?.toolRollups ?? [];

  return (
    <div className="min-h-0 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Observability</h1>
          <p className="mt-1 text-sm text-muted-foreground">Understand agent health, performance, tool behavior, and execution failures.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(value) => setRange(value as ObservabilityRange)}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {observabilityRanges.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={load}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <ObservabilityStat
            label="Event health"
            value={`${summary?.successRate ?? 0}%`}
            detail={`${summary?.successfulEvents ?? 0} passed · ${summary?.failedEvents ?? 0} failed`}
            icon={CheckCircle2}
            tone={(summary?.failedEvents ?? 0) > 0 ? "warn" : "good"}
          />
          <ObservabilityStat
            label="Failures"
            value={summary?.failedEvents ?? 0}
            detail={`${summary?.errorRate ?? 0}% error rate · ${summary?.warnings ?? 0} warnings`}
            icon={AlertTriangle}
            tone={(summary?.failedEvents ?? 0) > 0 ? "bad" : "neutral"}
          />
          <ObservabilityStat
            label="Latency"
            value={formatMs(summary?.avgResponseTimeMs)}
            detail={`P95 ${formatMs(summary?.p95ResponseTimeMs)}`}
            icon={Clock3}
          />
          <ObservabilityStat
            label="Tool calls"
            value={summary?.toolCalls ?? 0}
            detail={`${summary?.failedToolCalls ?? 0} failed · ${summary?.rateLimitedToolCalls ?? 0} rate limited`}
            icon={Wrench}
            tone={(summary?.failedToolCalls ?? 0) > 0 ? "warn" : "neutral"}
          />
          <ObservabilityStat
            label="Usage"
            value={formatCost(summary?.usage?.totalCostUsd)}
            detail={`${compactNumber(summary?.usage?.totalTokens)} tokens · ${summary?.usage?.calls ?? 0} calls`}
            icon={Gauge}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <Panel title="Activity trend">
            {chartData.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="eventsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Area type="monotone" dataKey="events" name="Events" stroke="hsl(var(--primary))" fill="url(#eventsFill)" strokeWidth={2} />
                    <Line type="monotone" dataKey="failures" name="Failures" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="warnings" name="Warnings" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyObservabilityState text="No activity in this time range." />
            )}
          </Panel>

          <Panel title="Latency and tools">
            {chartData.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
                    <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="avgResponseTimeMs" name="Avg response ms" stroke="#2563eb" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="toolCalls" name="Tool calls" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyObservabilityState text="No latency samples yet." />
            )}
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel title="Tool behavior">
            {toolRollups.length ? (
              <div className="space-y-3">
                {toolRollups.slice(0, 6).map((tool) => (
                  <div key={tool.id} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{tool.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{tool.calls} calls · avg {formatMs(tool.avgDurationMs)} · P95 {formatMs(tool.p95DurationMs)}</p>
                      </div>
                      <Badge variant="outline" className={cn("rounded-md", tool.failures ? observabilityStatusClass("warning") : observabilityStatusClass("success"))}>
                        {tool.successRate}% pass
                      </Badge>
                    </div>
                    <div className="mt-3 grid h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(4, Math.min(100, tool.successRate))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyObservabilityState text="No tool calls have been captured for this range." />
            )}
          </Panel>

          <Panel title="Task and model signals">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Completed tasks" value={summary?.tasks?.completed ?? 0} />
              <Stat label="Failed tasks" value={summary?.tasks?.failed ?? 0} />
              <Stat label="Task P95" value={formatMs(summary?.tasks?.p95DurationMs)} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Model activity</p>
                {modelRollups.length ? modelRollups.slice(0, 4).map((model) => (
                  <div key={`${model.provider}:${model.modelId}`} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{model.modelId}</span>
                      <span className="text-muted-foreground">{model.calls} calls</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{compactNumber(model.totalTokens)} tokens · {formatCost(model.costUsd)} · avg {formatMs(model.avgDurationMs)}</p>
                  </div>
                )) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No usage events in this range.</p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">Recent failures</p>
                {failedTasks.length ? failedTasks.map((task) => (
                  <div key={task.taskId} className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-sm dark:border-red-900/60 dark:bg-red-950/20">
                    <p className="truncate font-medium">{task.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.errorMessage || task.summary || "Task failed without a recorded message."}</p>
                  </div>
                )) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No task failures found.</p>
                )}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid min-h-[520px] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel
            title="Execution logs"
            action={
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[128px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
          >
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search action, message, session, or status..."
                className="h-9 pl-8"
              />
            </div>
            <ScrollArea className="h-[420px] pr-3">
              {filteredLogs.length ? (
                <div className="space-y-2">
                  {filteredLogs.map((log) => (
                    <button
                      key={log.id}
                      type="button"
                      onClick={() => setSelectedLogId(log.id)}
                      className={cn(
                        "w-full rounded-lg border border-border bg-background p-3 text-left transition hover:bg-muted/40",
                        selectedLog?.id === log.id && "border-primary/50 bg-primary/5"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{log.action || "Agent event"}</p>
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{log.message || "No message recorded"}</p>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0 rounded-md", observabilityStatusClass(log.status))}>{log.status}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{compactTime(log.createdAt)}</span>
                        <span>{formatMs(log.responseTimeMs)}</span>
                        {log.sessionId && <span>Session {shortId(log.sessionId)}</span>}
                        {!!log.tools?.length && <span>{log.tools.length} tool events</span>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyObservabilityState text={loading ? "Loading observability data..." : "No logs match the current filters."} />
              )}
            </ScrollArea>
          </Panel>

          <Panel title="Event inspector">
            {selectedLog ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline" className={cn("rounded-md", observabilityStatusClass(selectedLog.status))}>
                      {statusIsBad(selectedLog.status) ? <XCircle className="mr-1 h-3 w-3" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {selectedLog.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{relative(selectedLog.createdAt)}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">{selectedLog.action || "Agent event"}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedLog.message || "No message was recorded for this event."}</p>
                </div>

                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Response time</span>
                    <span className="font-medium">{formatMs(selectedLog.responseTimeMs)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Log ID</span>
                    <span className="font-mono text-xs">{shortId(selectedLog.logId)}</span>
                  </div>
                  {selectedLog.sessionId && (
                    <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                      <span className="text-muted-foreground">Session</span>
                      <span className="font-mono text-xs">{shortId(selectedLog.sessionId)}</span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Tools in this event</p>
                  {selectedLogTools.length ? (
                    <div className="space-y-2">
                      {selectedLogTools.map((tool, index) => (
                        <div key={`${tool.name}-${index}`} className="rounded-md border border-border p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{tool.name}</span>
                            <Badge variant="outline" className={cn("rounded-md", observabilityStatusClass(tool.status))}>{tool.status}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{tool.summary || `${formatMs(tool.duration)} recorded duration`}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No embedded tool data on this log.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Raw event</p>
                  <pre className="max-h-44 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <EmptyObservabilityState text="Select a log to inspect it." />
            )}
          </Panel>
        </div>

        <Panel title="Detailed tool calls">
          {toolCalls.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {toolCalls.slice(0, 12).map((tool) => (
                <div key={tool.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{tool.toolName}</p>
                    <Badge variant="outline" className={cn("rounded-md", observabilityStatusClass(tool.status))}>{tool.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{compactTime(tool.startedAt)} · {formatMs(tool.durationMs)}</p>
                  {tool.errorMessage && <p className="mt-2 line-clamp-2 text-xs text-red-600 dark:text-red-300">{tool.errorMessage}</p>}
                  {tool.summary && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{tool.summary}</p>}
                </div>
              ))}
            </div>
          ) : (
            <EmptyObservabilityState text="No detailed tool execution rows found yet." />
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
  const { setMessages, clearMessages, startTitleStream } = useAgentContext();

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

  useEffect(() => { loadAgent(); }, [loadAgent]);
  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!selectedSession && sessions[0]?.sessionId && activeSection !== "new-session") {
      loadSession(sessions[0].sessionId);
    }
  }, [sessions, selectedSession, activeSection, loadSession]);

  useEffect(() => {
    if (activeSection === "new-session") {
      clearMessages();
      setSelectedSession(null);
    }
  }, [activeSection, clearMessages]);

  if (loading) return <AgentPageSkeleton />;
  if (!agent) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Agent not found</div>;
  }

  const renderSection = () => {
    switch (activeSection) {
      case "setup":
        return <SetupView agent={agent} isOwner={isOwner} onSaved={setAgent} />;
      case "new-session":
        return (
          <SessionInterface
            agent={agent}
            session={selectedSession}
            agentId={agentId}
            sessionId={selectedSession?.sessionId || ""}
            userId={userAddress}
            height="calc(100vh - 180px)"
            isLoadingSession={loadingSession}
            onSessionCreated={(sessionId, title) => {
              const newSession = { sessionId, agentId, title: "", createdAt: new Date().toISOString() };
              setSessions((prev) => [newSession, ...prev.filter((s) => s.sessionId !== sessionId)]);
              if (title) startTitleStream(sessionId, title);
              setSelectedSession({ sessionId, tasks: [], childSessions: [], spaces: [] });
            }}
          />
        );
      case "sessions":
        return <SessionsView agent={agent} sessions={sessions} selectedSession={selectedSession} userAddress={userAddress} loadingSession={loadingSession} onSelectSession={loadSession} onCreateSession={() => setActiveSection("new-session")} />;
      case "computer":
        return <AgentComputerPanel agentId={agentId} showConfig className="h-full" />;
      case "tasks":
        return <TaskManagementView userAddress={userAddress} agentId={agentId} hideAgentFilter preSelectedAgentId={agentId} />;
      case "tools":
        return <ToolsView agentId={agentId} agentTools={agentTools} setAgentTools={setAgentTools} />;
      case "skills":
        return <SkillsView agentId={agentId} />;
      case "artefacts":
        return <ArtefactsView sessions={sessions} tasks={tasks} />;
      case "observability":
        return <ObservabilityView agentId={agentId} />;
      case "usage":
        return <UsageView agentId={agentId} />;
      case "memory":
        return <div className="min-h-0 overflow-auto"><SectionHeader title="Memory" subtitle="Review, search, add, and remove memory entries for this agent." /><div className="mx-auto max-w-5xl p-5"><Panel title="Memory store"><AgentMemoryView agentId={agentId} /></Panel></div></div>;
      case "wallet":
        return <WalletView agentId={agentId} />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push("/studio/agents")} aria-label="Back to agents">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <StudioEntitySwitcher type="agent" currentId={agentId} currentName={agent.name} items={agents.map((item) => ({ id: item.agentId, name: item.name }))} />
        </div>
        <Badge variant="outline" className="hidden rounded-md sm:inline-flex">{shortId(agentId)}</Badge>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-muted/10">
          <div className="shrink-0 border-b border-border/70 p-4">
            <div className="flex items-center gap-3">
              {agent.avatar ? <img src={agent.avatar} alt="" className="h-11 w-11 rounded-full border object-cover" /> : <RandomAvatar size={44} username={agent.name || "agent"} />}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{agent.name}</p>
                <p className="truncate text-xs text-muted-foreground">{(agent as any).modelId || "No model selected"}</p>
              </div>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
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
        <main className="h-full min-h-0 min-w-0 overflow-y-auto overscroll-contain">{renderSection()}</main>
      </div>
    </div>
  );
}
