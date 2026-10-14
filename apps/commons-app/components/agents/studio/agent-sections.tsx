"use client";

// Agent configuration views shared by the agents chat app: setup, tools,
// skills, activity, usage, wallet and sessions.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings2,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { SkillIcon } from "@/components/skills/skill-icon";
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
import { AgentAutonomy } from "@/components/agents/agent-autonomy";
import { AgentMcpSection } from "@/components/mcp/agent-mcp-section";
import { AddToAgentBalance } from "@/components/finances/add-to-agent-balance";
import { AgentTransactions } from "@/components/finances/agent-transactions";
import { AgentTransferAllowance } from "@/components/finances/agent-transfer-allowance";
import {
  RUNTIME_NATIVE_TOOLING,
  ManagedRuntimeSetup,
  RuntimeNativeToolingDetail,
  RuntimeSkillsNote,
  managedRuntimeKey,
  useAgentRuntime,
} from "@/components/agents/runtime-native-tooling";
import AgentAvatarUploader from "@/components/agents/agent-avatar-uploader";
import { ToolIcon } from "@/components/tools/catalog/tool-icon";
import { ScopePermissions } from "@/components/tools/catalog/scope-permissions";
import { CostDashboard } from "@/components/usage/cost-dashboard";
import type { ToolCatalogItem } from "@/lib/tools/catalog";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAgentSkills } from "@/hooks/use-skills";
import { useAgentWallet, useWalletActivity } from "@/hooks/use-wallet";
import { walletNetwork } from "@/lib/wallet-networks";
import { cn } from "@/lib/utils";
import { normalizeConversationStarters } from "@/lib/conversation-starters";
import type { CommonAgent } from "@/types/agent";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { localAgentToCommon } from "@/lib/local-agent-adapter";

export type SectionKey =
  | "setup"
  | "runtime"
  | "new-session"
  | "sessions"
  | "computer"
  | "tasks"
  | "tools"
  | "skills"
  | "artifacts"
  | "observability"
  | "usage"
  | "memory"
  | "wallet";


const modelProviders = [
  "openai",
  "anthropic",
  "google",
  "mistral",
  "groq",
  "openrouter",
  "xai",
  "custom",
  "ollama",
];

const EmbeddedSectionContext = createContext(false);

export function EmbeddedSection({ children }: { children: React.ReactNode }) {
  return <EmbeddedSectionContext.Provider value>{children}</EmbeddedSectionContext.Provider>;
}

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const embedded = useContext(EmbeddedSectionContext);
  if (embedded) return null;
  return (
    <div className="border-b border-border/70 px-5 py-4">
      <h1 className="text-lg font-medium tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

/** A setup card, or just its fields when the screen header already names it. */
function FormPanel({ bare, title, action, children }: { bare?: boolean; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  if (bare) return <section aria-label={title}>{children}</section>;
  return <Panel title={title} action={action}>{children}</Panel>;
}

export function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
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

export function SetupView({
  agent,
  isOwner,
  onSaved,
  onOpenSection,
  part = "all",
}: {
  agent: CommonAgent;
  isOwner: boolean;
  onSaved: (agent: CommonAgent) => void;
  onOpenSection?: (section: SectionKey) => void;
  /** Show one focused part (profile, instructions, or model) with its own save bar. */
  part?: "all" | "profile" | "behavior" | "model";
}) {
  const show = (name: "profile" | "behavior" | "model") => part === "all" || part === name;
  const { mode } = useWorkspaceMode();
  const [installedLocalModels, setInstalledLocalModels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const runtimeType = agent.runtimeType ?? "native";
  const isManagedRuntime =
    runtimeType === "openclaw" || runtimeType === "hermes";
  const [form, setForm] = useState({
    name: agent.name || "",
    avatar: agent.avatar || "",
    persona: agent.persona || "",
    instructions: agent.instructions || "",
    description: agent.description || "",
    greeting: agent.greeting || "",
    conversationStarters: normalizeConversationStarters(
      agent.conversationStarters,
    ),
    a2aEnabled: Boolean((agent as any).a2aEnabled),
    modelProvider: (agent as any).modelProvider || "openai",
    modelId: (agent as any).modelId || "",
    modelBaseUrl: (agent as any).modelBaseUrl || "",
    modelApiKey: "",
    temperature: String((agent as any).temperature ?? 0.7),
    maxTokens: String((agent as any).maxTokens ?? 4096),
    topP: String((agent as any).topP ?? 1),
    presencePenalty: String((agent as any).presencePenalty ?? 0),
    frequencyPenalty: String((agent as any).frequencyPenalty ?? 0),
  });

  useEffect(() => {
    if (mode !== "private-local") return;
    void window.agentCommonsLocal?.listModels().then(setInstalledLocalModels).catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    setForm({
      name: agent.name || "",
      avatar: agent.avatar || "",
      persona: agent.persona || "",
      instructions: agent.instructions || "",
      description: agent.description || "",
      greeting: agent.greeting || "",
      conversationStarters: normalizeConversationStarters(
        agent.conversationStarters,
      ),
      a2aEnabled: Boolean((agent as any).a2aEnabled),
      modelProvider: (agent as any).modelProvider || "openai",
      modelId: (agent as any).modelId || "",
      modelBaseUrl: (agent as any).modelBaseUrl || "",
      modelApiKey: "",
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
    setSaveError(null);
    try {
      if (mode === "private-local") {
        const bridge = window.agentCommonsLocal;
        if (!bridge) throw new Error("The local Desktop provider is unavailable.");
        const state = await bridge.saveAgent({
          id: agent.agentId,
          name: form.name,
          avatar: form.avatar,
          description: form.description,
          persona: form.persona,
          instructions: form.instructions,
          model: form.modelId,
        });
        const updated = state.agents.find((candidate) => candidate.id === agent.agentId);
        if (!updated) throw new Error("Local agent not found after saving.");
        onSaved(localAgentToCommon(updated, state));
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        return;
      }
      const modelChanged =
        form.modelProvider !== ((agent as any).modelProvider || "openai") ||
        form.modelId !== ((agent as any).modelId || "") ||
        Boolean(form.modelApiKey.trim());
      const { modelApiKey, ...formValues } = form;
      const payload = {
        ...formValues,
        ...(modelApiKey.trim() ? { modelApiKey: modelApiKey.trim() } : {}),
        conversationStarters: form.conversationStarters
          .map((starter) => ({
            label: starter.label.trim() || starter.prompt.trim(),
            prompt: starter.prompt.trim() || starter.label.trim(),
          }))
          .filter((starter) => starter.label)
          .slice(0, 4),
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
        setForm((current) => ({ ...current, modelApiKey: "" }));
        if (isManagedRuntime && modelChanged) {
          const restart = await fetch(
            `/api/agents/${agent.agentId}/runtime/restart`,
            { method: "POST" },
          );
          if (!restart.ok) {
            const restartPayload = await restart.json().catch(() => ({}));
            throw new Error(
              restartPayload?.message ||
                restartPayload?.error ||
                "Model saved, but the managed runtime could not restart",
            );
          }
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      } else {
        throw new Error(data?.message || data?.error || "Could not save agent");
      }
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : "Could not save agent",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader
        title="Agent setup"
        subtitle="Identity, discovery, behavior, and model configuration for this agent."
      />
      <div className={cn("mx-auto grid gap-4", part === "all" ? "max-w-5xl p-5" : "max-w-2xl p-4 sm:p-6")}>
        {saveError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {saveError}
          </div>
        )}
        {show("profile") && <FormPanel
          bare={part !== "all"}
          title="Profile"
          action={part !== "all" ? undefined :
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={!isOwner || saving}
              onClick={save}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saved ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saved ? "Saved" : "Save"}
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-3 pt-1">
              <AgentAvatarUploader
                agentId={agent.agentId}
                name={form.name}
                avatarUrl={form.avatar}
                size={96}
                disabled={!isOwner}
                onUploaded={(url, updated) => {
                  setForm((f) => ({ ...f, avatar: url }));
                  if (updated) onSaved(updated as CommonAgent);
                }}
              />
              <Badge
                variant={form.a2aEnabled ? "default" : "secondary"}
                className="rounded-md"
              >
                {form.a2aEnabled ? "Discoverable" : "Private"}
              </Badge>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  disabled={!isOwner}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Description</Label>
                <Textarea
                  className="min-h-20"
                  value={form.description}
                  disabled={!isOwner}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    Discoverable by other agents
                    <InfoHint label="About discovery">Publishes this agent&apos;s A2A card so agents outside your account can find and call it.</InfoHint>
                  </p>
                </div>
                <Switch
                  checked={form.a2aEnabled}
                  disabled={!isOwner || Boolean(agent.isSystemManaged)}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, a2aEnabled: checked }))
                  }
                />
              </div>
            </div>
          </div>
        </FormPanel>}

        {show("behavior") && <FormPanel bare={part !== "all"} title="Behavior">
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Persona</Label>
              <Textarea
                className="min-h-24"
                value={form.persona}
                disabled={!isOwner}
                onChange={(e) =>
                  setForm((f) => ({ ...f, persona: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5">
                Greeting
                <InfoHint label="About the greeting">The first line people see when they start a chat. Keep it short.</InfoHint>
              </Label>
              <Input
                value={form.greeting}
                disabled={!isOwner}
                maxLength={100}
                onChange={(e) =>
                  setForm((f) => ({ ...f, greeting: e.target.value }))
                }
                placeholder="What shall we work on today?"
              />

            </div>
            <div className="grid gap-1.5">
              <Label className="flex items-center gap-1.5">
                Conversation starters
                <InfoHint label="About conversation starters">Two to four work best. Each shows its label in a new chat; choosing one fills the composer with the full prompt.</InfoHint>
              </Label>
              <div className="grid gap-2">
                {form.conversationStarters.map((starter, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-lg border border-border p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={starter.label}
                        disabled={!isOwner}
                        maxLength={40}
                        placeholder="Button label — e.g. Draft a report"
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            conversationStarters: f.conversationStarters.map(
                              (item, i) =>
                                i === index
                                  ? { ...item, label: e.target.value }
                                  : item,
                            ),
                          }))
                        }
                      />
                      {isOwner && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label="Remove starter"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              conversationStarters:
                                f.conversationStarters.filter(
                                  (_, i) => i !== index,
                                ),
                            }))
                          }
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <Textarea
                      className="min-h-16 text-sm"
                      value={starter.prompt}
                      disabled={!isOwner}
                      placeholder="Full prompt inserted when clicked — clear, self-contained, in the user's voice."
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          conversationStarters: f.conversationStarters.map(
                            (item, i) =>
                              i === index
                                ? { ...item, prompt: e.target.value }
                                : item,
                          ),
                        }))
                      }
                    />
                  </div>
                ))}
                {isOwner && form.conversationStarters.length < 4 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1.5"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        conversationStarters: [
                          ...f.conversationStarters,
                          { label: "", prompt: "" },
                        ],
                      }))
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add starter
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>
                System prompt
                {agent.isSystemManaged && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Protected by Agent Commons
                  </span>
                )}
              </Label>
              <Textarea
                className="min-h-44 font-mono text-sm"
                value={form.instructions}
                disabled={!isOwner || Boolean(agent.isSystemManaged)}
                onChange={(e) =>
                  setForm((f) => ({ ...f, instructions: e.target.value }))
                }
              />
            </div>
          </div>
        </FormPanel>}

        {show("model") && <div className={cn("grid gap-4", part === "all" && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
          {isManagedRuntime && (
            <Panel
              title={`${runtimeType === "openclaw" ? "OpenClaw" : "Hermes"} settings`}
              action={
                onOpenSection ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => onOpenSection("runtime")}
                  >
                    Lifecycle
                  </Button>
                ) : undefined
              }
            >
              <ManagedRuntimeSetup agentId={agent.agentId} isOwner={isOwner} />
            </Panel>
          )}
          <FormPanel
            bare={part !== "all" && !isManagedRuntime}
            title={
              isManagedRuntime
                ? `${runtimeType === "openclaw" ? "OpenClaw" : "Hermes"} model`
                : "Native model"
            }
          >
            {mode === "private-local" ? <div className="space-y-2">
              <Label>Installed model for this agent</Label>
              <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.modelId} disabled={!isOwner} onChange={(event) => setForm((current) => ({ ...current, modelId: event.target.value }))}>
                {form.modelId && !installedLocalModels.includes(form.modelId) && <option value={form.modelId}>{form.modelId} · unavailable</option>}
                {installedLocalModels.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Download more models in General settings. Changes to this agent apply to its next run.</p>
            </div> : <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Provider</Label>
                <Select
                  value={form.modelProvider}
                  disabled={!isOwner}
                  onValueChange={(value) =>
                    setForm((f) => ({ ...f, modelProvider: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelProviders
                      .filter(
                        (provider) =>
                          !isManagedRuntime ||
                          (provider !== "custom" && provider !== "ollama"),
                      )
                      .map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {provider}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Model ID</Label>
                <Input
                  value={form.modelId}
                  disabled={!isOwner}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modelId: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label className="flex items-center gap-1.5">
                  Provider API key
                  <InfoHint label="About provider keys">Optional. Without a key the agent uses Agent Commons credentials when they exist for this provider.</InfoHint>
                </Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.modelApiKey}
                  disabled={!isOwner}
                  placeholder="Optional. Leave blank to keep the current key"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, modelApiKey: e.target.value }))
                  }
                />

              </div>
              {!isManagedRuntime && (
                <button
                  type="button"
                  onClick={() => setShowAdvanced((open) => !open)}
                  className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground md:col-span-2"
                  aria-expanded={showAdvanced}
                >
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showAdvanced && "rotate-90")} />
                  Advanced settings
                </button>
              )}
              {!isManagedRuntime && showAdvanced && (
                <div className="grid gap-1.5 md:col-span-2">
                  <Label>Base URL</Label>
                  <Input
                    value={form.modelBaseUrl}
                    disabled={!isOwner}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, modelBaseUrl: e.target.value }))
                    }
                  />
                </div>
              )}
              {!isManagedRuntime && showAdvanced && (
                <>
                  {(
                    [
                      "temperature",
                      "maxTokens",
                      "topP",
                      "presencePenalty",
                      "frequencyPenalty",
                    ] as const
                  ).map((field) => (
                    <div key={field} className="grid gap-1.5">
                      <Label className="capitalize">
                        {field.replace(/([A-Z])/g, " $1")}
                      </Label>
                      <Input
                        value={form[field]}
                        disabled={!isOwner}
                        type="number"
                        step="0.1"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [field]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </>
              )}
            </div>}
          </FormPanel>
          {!isManagedRuntime && part === "all" && (
            <AgentAutonomy agentId={agent.agentId} isOwner={isOwner} />
          )}
        </div>}
      </div>
      {part !== "all" && isOwner && (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-white/95 px-5 py-3 backdrop-blur">
          {saved && <span className="text-xs text-muted-foreground">Saved</span>}
          <Button size="sm" className="h-9 gap-1.5" disabled={saving} onClick={save}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

const RUNTIME_NATIVE_ID = "__runtime_native__";

export function ToolsView({
  agentId,
  agentTools,
  setAgentTools,
  runtimeType,
  isOwner,
}: {
  agentId: string;
  agentTools: any[];
  setAgentTools: (tools: any[]) => void;
  runtimeType?: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<ToolCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const isManagedRuntime =
    runtimeType === "openclaw" || runtimeType === "hermes";
  const { runtime } = useAgentRuntime(agentId, isManagedRuntime);
  const runtimeKey = managedRuntimeKey(runtime);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "connected" | "not-connected"
  >("all");
  const [toggling, setToggling] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [usageComments, setUsageComments] = useState("");

  useEffect(() => {
    setLoadingCatalog(true);
    fetch("/api/tools/catalog", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        // Show everything except agent-processors, workflow-invocation items,
        // and internal platform (system) tools — those only surface in the
        // workflow editor.
        const items: ToolCatalogItem[] = (d.items ?? []).filter(
          (i: ToolCatalogItem) =>
            i.category !== "agents" &&
            i.category !== "workflows" &&
            i.category !== "system",
        );
        setCatalog(items);
      })
      .catch(() => {})
      .finally(() => setLoadingCatalog(false));
  }, []);

  // Executable tools behind a catalog item: multi-tool bundles (Google apps)
  // expose `tools`, single custom/system tools expose `tool`.
  const itemTools = (item: ToolCatalogItem) =>
    item.tools?.length ? item.tools : item.tool ? [item.tool] : [];

  // An item is "connected to this agent" when assignments exist for its tools
  const getAssignments = (item: ToolCatalogItem) => {
    const toolIds = new Set(itemTools(item).map((t) => t.toolId));
    return agentTools.filter((t) => toolIds.has(t.toolId));
  };

  const getAssignment = (item: ToolCatalogItem) => getAssignments(item)[0];

  const isConnected = (item: ToolCatalogItem): boolean => {
    if (itemTools(item).length > 0) return getAssignments(item).length > 0;
    // OAuth/MCP without executable tools: connected at platform level
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
    return (
      catalog.find((i) => i.id === selectedItemId) ?? filteredCatalog[0] ?? null
    );
  }, [catalog, filteredCatalog, selectedItemId]);

  // Sync local config state when selection changes
  useEffect(() => {
    if (!selectedItem) return;
    const assignment = getAssignment(selectedItem);
    setUsageComments(assignment?.usageComments ?? "");
  }, [selectedItem?.id, agentTools]);

  // Enabled = at least one assignment that isn't switched off
  const isItemEnabled = (item: ToolCatalogItem) =>
    getAssignments(item).some((a) => a.isEnabled !== false);

  const isToolEnabled = (toolId: string) => {
    const assignment = agentTools.find((t) => t.toolId === toolId);
    return Boolean(assignment && assignment.isEnabled !== false);
  };

  /** Create-or-re-enable assignments for the given tools (API upserts). */
  const upsertAssignments = async (toolIds: string[]) => {
    const results: any[] = [];
    for (const toolId of toolIds) {
      const res = await fetch(`/api/agents/${agentId}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId }),
      });
      const data = await res.json();
      if (res.ok && data?.data) results.push(data.data);
    }
    if (results.length) {
      const byToolId = new Map(results.map((a) => [a.toolId, a]));
      setAgentTools([
        ...agentTools.filter((t) => !byToolId.has(t.toolId)),
        ...results,
      ]);
    }
    return results;
  };

  const patchAssignments = async (
    assignments: any[],
    patch: Record<string, any>,
  ) => {
    const updated = await Promise.all(
      assignments.map(async (assignment) => {
        const res = await fetch(`/api/agents/tools/${assignment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        return data?.data ?? assignment;
      }),
    );
    const byId = new Map(updated.map((a: any) => [a.id, a]));
    setAgentTools(agentTools.map((t) => byId.get(t.id) ?? t));
  };

  /** Master toggle: on enables every capability, off disables them all. */
  const setItemEnabled = async (item: ToolCatalogItem, enabled: boolean) => {
    setToggling(item.id);
    try {
      if (enabled) {
        await upsertAssignments(itemTools(item).map((t) => t.toolId));
      } else {
        await patchAssignments(getAssignments(item), { isEnabled: false });
      }
    } finally {
      setToggling(null);
    }
  };

  /** Per-capability toggle for one tool inside a bundle (e.g. Gmail send). */
  const setToolEnabled = async (toolId: string, enabled: boolean) => {
    setToggling(toolId);
    try {
      if (enabled) {
        await upsertAssignments([toolId]);
      } else {
        const assignment = agentTools.find((t) => t.toolId === toolId);
        if (assignment)
          await patchAssignments([assignment], { isEnabled: false });
      }
    } finally {
      setToggling(null);
    }
  };

  const saveInstructions = async () => {
    if (!selectedItem) return;
    const assignments = getAssignments(selectedItem);
    if (assignments.length === 0) return;
    setSavingConfig(true);
    try {
      await patchAssignments(assignments, { usageComments });
    } finally {
      setSavingConfig(false);
    }
  };

  /** "Gmail: send message" → "Send message" */
  const capabilityLabel = (tool: any) => {
    const name = tool.displayName || tool.name || "";
    const idx = name.indexOf(":");
    const label = (idx >= 0 ? name.slice(idx + 1) : name).trim();
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const isAssignable = (item: ToolCatalogItem) => itemTools(item).length > 0;

  const connectedCount = catalog.filter(isConnected).length;

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
      {/* ── Left panel ─────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-border bg-muted/15">
        <div className="shrink-0 border-b border-border/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Tools</h2>
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[11px] font-normal"
            >
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
                {value === "not-connected"
                  ? "Not connected"
                  : value.charAt(0).toUpperCase() + value.slice(1)}
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
              {runtimeKey && runtime && (
                <button
                  type="button"
                  className={cn(
                    "mb-1 flex w-full items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 text-left transition-colors hover:bg-muted",
                    selectedItemId === RUNTIME_NATIVE_ID &&
                      "bg-accent text-accent-foreground",
                  )}
                  onClick={() => setSelectedItemId(RUNTIME_NATIVE_ID)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                    <Server className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {RUNTIME_NATIVE_TOOLING[runtimeKey].label} built-in
                      tooling
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Comes with this runtime
                    </p>
                  </div>
                  <div
                    className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                    title="Included"
                  />
                </button>
              )}
              {filteredCatalog.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No tools in this filter.
                </div>
              ) : (
                filteredCatalog.map((item) => {
                  const active =
                    selectedItemId !== RUNTIME_NATIVE_ID &&
                    selectedItem?.id === item.id;
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
                        <p className="truncate text-sm font-medium">
                          {item.displayName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.categoryLabel}
                        </p>
                      </div>
                      {connected && (
                        <div
                          className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                          title="Connected"
                        />
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
        {selectedItemId === RUNTIME_NATIVE_ID && runtimeKey && runtime ? (
          <>
            <SectionHeader
              title={`${RUNTIME_NATIVE_TOOLING[runtimeKey].label} built-in tooling`}
              subtitle="Included with this runtime · configured here, run on the agent's managed computer"
            />
            <div className="mx-auto max-w-4xl p-5">
              <Panel title="Runtime tooling">
                <RuntimeNativeToolingDetail
                  agentId={agentId}
                  runtime={runtime}
                  isOwner={isOwner}
                />
              </Panel>
            </div>
          </>
        ) : !selectedItem ? (
          <>
            <SectionHeader
              title="Tools"
              subtitle="Select a tool from the list to configure it for this agent."
            />
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
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedItem.description}
                </p>
                {selectedItem.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selectedItem.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                {selectedItem.documentationUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      window.open(selectedItem.documentationUrl, "_blank")
                    }
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Documentation
                  </Button>
                )}
              </Panel>

              {/* Per-agent access — one clean on/off, plus per-capability
                  switches for multi-tool bundles like Gmail */}
              {isAssignable(selectedItem) && (
                <Panel title="Agent access">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          Enabled for this agent
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isItemEnabled(selectedItem)
                            ? `This agent can use ${selectedItem.displayName}.`
                            : `Turn on to let this agent use ${selectedItem.displayName}.`}
                        </p>
                      </div>
                      <Switch
                        checked={isItemEnabled(selectedItem)}
                        disabled={toggling === selectedItem.id}
                        onCheckedChange={(checked) =>
                          setItemEnabled(selectedItem, checked)
                        }
                        aria-label={`Enable ${selectedItem.displayName} for this agent`}
                      />
                    </div>

                    {selectedItem.connectionMode === "oauth" &&
                      selectedItem.status !== "connected" && (
                        <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                          Your {selectedItem.displayName} account isn&apos;t
                          connected yet. Connect it in the account section below
                          — the agent can&apos;t use these tools until then.
                        </p>
                      )}

                    {itemTools(selectedItem).length > 1 && (
                      <div className="divide-y divide-border/70 rounded-xl border border-border">
                        {itemTools(selectedItem).map((tool) => (
                          <div
                            key={tool.toolId}
                            className="flex items-center gap-3 px-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">
                                {capabilityLabel(tool)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {tool.description}
                              </p>
                            </div>
                            <Switch
                              checked={isToolEnabled(tool.toolId)}
                              disabled={
                                toggling === tool.toolId ||
                                toggling === selectedItem.id
                              }
                              onCheckedChange={(checked) =>
                                setToolEnabled(tool.toolId, checked)
                              }
                              aria-label={`Allow: ${capabilityLabel(tool)}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {isItemEnabled(selectedItem) && (
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs">
                          Usage instructions (optional)
                        </Label>
                        <Textarea
                          placeholder="Describe when and how this agent should use this tool…"
                          className="resize-none text-sm"
                          rows={3}
                          value={usageComments}
                          onChange={(e) => setUsageComments(e.target.value)}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            Passed to the agent at runtime alongside the tool
                            definition.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={saveInstructions}
                            disabled={savingConfig}
                          >
                            {savingConfig ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Panel>
              )}

              {/* OAuth account connection — account-wide, shared by all agents */}
              {selectedItem.connectionMode === "oauth" && (
                <div className="rounded-lg border border-border bg-background p-4">
                  <ScopePermissions
                    item={selectedItem}
                    returnUrl={`/studio/agents/${agentId}?section=tools`}
                    title="Account access"
                    subtitle={`What your connected ${selectedItem.displayName} account allows. Applies to your whole workspace — use “Agent access” above to control this agent.`}
                  />
                </div>
              )}

              {/* MCP tools — platform-level connection */}
              {!isAssignable(selectedItem) &&
                selectedItem.connectionMode !== "oauth" && (
                  <Panel
                    title={
                      isConnected(selectedItem)
                        ? "Connection status"
                        : "Setup required"
                    }
                  >
                    {isConnected(selectedItem) ? (
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Connected</p>
                          <p className="text-sm text-muted-foreground">
                            This MCP connection is active and available to your
                            agents.
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
                            This MCP server must be configured before agents can
                            use it.
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

export function SkillsView({
  agentId,
  runtimeType,
}: {
  agentId: string;
  runtimeType?: string;
}) {
  const isManagedRuntime =
    runtimeType === "openclaw" || runtimeType === "hermes";
  const { runtime } = useAgentRuntime(agentId, isManagedRuntime);
  const router = useRouter();
  const { skills, loading, error, setAvailability } = useAgentSkills(agentId);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"assigned" | "all">("assigned");
  const [updating, setUpdating] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");
  const visibleSkills = skills.filter((skill) => {
    if (view === "assigned" && !skill.assigned) return false;
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      skill.name.toLowerCase().includes(needle) ||
      skill.description.toLowerCase().includes(needle) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
  });

  const toggleSkill = async (skillId: string, enabled: boolean) => {
    setUpdating(skillId);
    setMutationError("");
    try {
      await setAvailability(skillId, enabled);
    } catch (cause) {
      setMutationError(
        cause instanceof Error ? cause.message : "Could not update this skill",
      );
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader
        title="Skills"
        subtitle="Choose the reusable playbooks this agent is allowed to invoke."
      />
      {runtime && (
        <div className="mx-auto max-w-5xl px-5 pt-5">
          <RuntimeSkillsNote runtime={runtime} />
        </div>
      )}
      <div className="mx-auto max-w-5xl p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search available skills"
              className="h-9 pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-muted p-1">
              {(["assigned", "all"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs capitalize",
                    view === value
                      ? "bg-background font-medium shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {value === "assigned" ? "On this agent" : "All skills"}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push("/studio/customize/skills")}
            >
              Manage skills
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {(error || mutationError) && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {mutationError || error}
          </div>
        )}

        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : visibleSkills.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <Zap className="mx-auto h-9 w-9 text-muted-foreground/35" />
            <p className="mt-3 text-sm font-medium">
              {view === "assigned" ? "No skills enabled" : "No skills found"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {view === "assigned"
                ? "Switch to All skills to choose what this agent can invoke."
                : "Create a reusable skill in the Skills library."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-background">
            {visibleSkills.map((skill, index) => (
              <div
                key={skill.skillId}
                className={cn(
                  "flex items-center gap-4 px-4 py-3",
                  index > 0 && "border-t",
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/studio/customize/skills/${skill.skillId}`)
                  }
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <SkillIcon icon={skill.icon} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {skill.name}
                      </span>
                      <Badge variant="outline" className="h-5 text-[10px]">
                        {skill.ownerType === "platform" ? "Commons" : "Custom"}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">
                      {skill.description}
                    </span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {skill.assigned ? "Available" : "Unavailable"}
                  </span>
                  {updating === skill.skillId && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    checked={skill.assigned}
                    disabled={updating === skill.skillId}
                    onCheckedChange={(checked) =>
                      toggleSkill(skill.skillId, checked)
                    }
                    aria-label={`${skill.assigned ? "Disable" : "Enable"} ${skill.name}`}
                  />
                </div>
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
  tools?: Array<{
    name: string;
    status: string;
    summary?: string;
    duration?: number;
  }>;
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

const observabilityRanges: Array<{ value: ObservabilityRange; label: string }> =
  [
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
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function compactTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusIsBad(status?: string) {
  return ["error", "failed", "timeout", "unauthorized", "cancelled"].includes(
    String(status || "").toLowerCase(),
  );
}

function statusIsBusy(status?: string) {
  return ["pending", "running", "started"].includes(
    String(status || "").toLowerCase(),
  );
}

function observabilityStatusClass(status?: string) {
  if (statusIsBad(status))
    return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300";
  if (String(status).toLowerCase() === "warning")
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300";
  if (statusIsBusy(status))
    return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/70 dark:bg-blue-950/40 dark:text-blue-300";
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
          <p className="mt-1 truncate text-lg font-medium tracking-tight">
            {value}
          </p>
        </div>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
            iconClass,
          )}
        >
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

export function ObservabilityView({ agentId }: { agentId: string }) {
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
      const res = await fetch(
        `/api/agents/${agentId}/observability?${params.toString()}`,
      );
      const data = await res.json();
      const nextPayload = (data.data ?? data) as ObservabilityPayload;
      setPayload(nextPayload);
      setSelectedLogId((current) => {
        if (current && nextPayload.logs?.some((log) => log.id === current))
          return current;
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
  const toolCalls = payload?.toolCalls?.length
    ? payload.toolCalls
    : (payload?.embeddedToolCalls ?? []);
  const selectedLog =
    logs.find((log) => log.id === selectedLogId) ?? logs[0] ?? null;
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
      return `${log.action} ${log.message} ${log.sessionId ?? ""} ${status}`
        .toLowerCase()
        .includes(needle);
    });
  }, [logs, searchTerm, statusFilter]);

  const selectedLogTools = selectedLog?.tools ?? [];
  const recentTasks = payload?.tasks?.recent ?? [];
  const failedTasks = recentTasks
    .filter((task) => statusIsBad(task.status))
    .slice(0, 4);
  const modelRollups = payload?.usage?.models ?? [];
  const toolRollups = payload?.toolRollups ?? [];

  return (
    <div className="min-h-0 overflow-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Observability</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Understand agent health, performance, tool behavior, and execution
            failures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={range}
            onValueChange={(value) => setRange(value as ObservabilityRange)}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {observabilityRanges.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={load}
          >
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
                  <AreaChart
                    data={chartData}
                    margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="eventsFill"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={34}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="events"
                      name="Events"
                      stroke="hsl(var(--primary))"
                      fill="url(#eventsFill)"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="failures"
                      name="Failures"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="warnings"
                      name="Warnings"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
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
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={42}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgResponseTimeMs"
                      name="Avg response ms"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="toolCalls"
                      name="Tool calls"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
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
                  <div
                    key={tool.id}
                    className="rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {tool.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {tool.calls} calls · avg{" "}
                          {formatMs(tool.avgDurationMs)} · P95{" "}
                          {formatMs(tool.p95DurationMs)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-md",
                          tool.failures
                            ? observabilityStatusClass("warning")
                            : observabilityStatusClass("success"),
                        )}
                      >
                        {tool.successRate}% pass
                      </Badge>
                    </div>
                    <div className="mt-3 grid h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.max(4, Math.min(100, tool.successRate))}%`,
                        }}
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
              <Stat
                label="Completed tasks"
                value={summary?.tasks?.completed ?? 0}
              />
              <Stat label="Failed tasks" value={summary?.tasks?.failed ?? 0} />
              <Stat
                label="Task P95"
                value={formatMs(summary?.tasks?.p95DurationMs)}
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Model activity
                </p>
                {modelRollups.length ? (
                  modelRollups.slice(0, 4).map((model) => (
                    <div
                      key={`${model.provider}:${model.modelId}`}
                      className="rounded-md border border-border bg-muted/20 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">
                          {model.modelId}
                        </span>
                        <span className="text-muted-foreground">
                          {model.calls} calls
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {compactNumber(model.totalTokens)} tokens ·{" "}
                        {formatCost(model.costUsd)} · avg{" "}
                        {formatMs(model.avgDurationMs)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No usage events in this range.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Recent failures
                </p>
                {failedTasks.length ? (
                  failedTasks.map((task) => (
                    <div
                      key={task.taskId}
                      className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-sm dark:border-red-900/60 dark:bg-red-950/20"
                    >
                      <p className="truncate font-medium">{task.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {task.errorMessage ||
                          task.summary ||
                          "Task failed without a recorded message."}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No task failures found.
                  </p>
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
                        selectedLog?.id === log.id &&
                          "border-primary/50 bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {log.action || "Agent event"}
                          </p>
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {log.message || "No message recorded"}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 rounded-md",
                            observabilityStatusClass(log.status),
                          )}
                        >
                          {log.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{compactTime(log.createdAt)}</span>
                        <span>{formatMs(log.responseTimeMs)}</span>
                        {log.sessionId && (
                          <span>Session {shortId(log.sessionId)}</span>
                        )}
                        {!!log.tools?.length && (
                          <span>{log.tools.length} tool events</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyObservabilityState
                  text={
                    loading
                      ? "Loading observability data..."
                      : "No logs match the current filters."
                  }
                />
              )}
            </ScrollArea>
          </Panel>

          <Panel title="Event inspector">
            {selectedLog ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-md",
                        observabilityStatusClass(selectedLog.status),
                      )}
                    >
                      {statusIsBad(selectedLog.status) ? (
                        <XCircle className="mr-1 h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {selectedLog.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {relative(selectedLog.createdAt)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold">
                    {selectedLog.action || "Agent event"}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {selectedLog.message ||
                      "No message was recorded for this event."}
                  </p>
                </div>

                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Response time</span>
                    <span className="font-medium">
                      {formatMs(selectedLog.responseTimeMs)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <span className="text-muted-foreground">Log ID</span>
                    <span className="font-mono text-xs">
                      {shortId(selectedLog.logId)}
                    </span>
                  </div>
                  {selectedLog.sessionId && (
                    <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                      <span className="text-muted-foreground">Session</span>
                      <span className="font-mono text-xs">
                        {shortId(selectedLog.sessionId)}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Tools in this event
                  </p>
                  {selectedLogTools.length ? (
                    <div className="space-y-2">
                      {selectedLogTools.map((tool, index) => (
                        <div
                          key={`${tool.name}-${index}`}
                          className="rounded-md border border-border p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {tool.name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-md",
                                observabilityStatusClass(tool.status),
                              )}
                            >
                              {tool.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tool.summary ||
                              `${formatMs(tool.duration)} recorded duration`}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                      No embedded tool data on this log.
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    Raw event
                  </p>
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
                <div
                  key={tool.id}
                  className="rounded-lg border border-border bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      {tool.toolName}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-md",
                        observabilityStatusClass(tool.status),
                      )}
                    >
                      {tool.status}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {compactTime(tool.startedAt)} · {formatMs(tool.durationMs)}
                  </p>
                  {tool.errorMessage && (
                    <p className="mt-2 line-clamp-2 text-xs text-red-600 dark:text-red-300">
                      {tool.errorMessage}
                    </p>
                  )}
                  {tool.summary && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {tool.summary}
                    </p>
                  )}
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

export function UsageView({ agentId }: { agentId: string }) {
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
          <h1 className="text-lg font-medium tracking-tight">Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Model calls, token volume, and cost for this agent.
          </p>
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
                <Badge variant="secondary" className="rounded-md">
                  {range}
                </Badge>
              </div>
            </div>
          </Panel>
          <Panel title="Cost controls">
            <div className="space-y-3">
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 w-1/5 rounded-full bg-emerald-500" />
              </div>
              <p className="text-xs text-muted-foreground">
                Agent-level budgets are not configured in this workspace yet.
              </p>
            </div>
          </Panel>
          <Panel title="Breakdown">
            <div className="space-y-2">
              {["LLM calls", "Input tokens", "Output tokens"].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm"
                >
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

export function WalletView({ agentId }: { agentId: string }) {
  const [chainId, setChainId] = useState<string>();
  const { wallet, balance, loading, balanceLoading, balanceError } =
    useAgentWallet(agentId, chainId);
  const activity = useWalletActivity(wallet, chainId ?? wallet?.chainId);
  const [copied, setCopied] = useState(false);
  const selectedChainId = chainId ?? wallet?.chainId;

  const copy = async () => {
    if (!wallet?.address) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const balanceValue = (value?: string) =>
    balanceLoading
      ? "Loading"
      : (value ?? (balanceError ? "Unavailable" : "0"));

  const transactions = activity.items
    .filter((item) => item.kind !== "call")
    .map((item) => ({
      id: item.hash,
      type: item.direction === "in" ? "incoming" : "outgoing",
      amount: `${item.amount} ${item.asset}`,
      walletAddress: item.direction === "in" ? item.from : (item.to ?? ""),
      timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
      description: `${item.status === "success" ? "Confirmed" : item.status} on ${
        walletNetwork(item.chainId)?.name ?? item.chainId
      } · ${item.hash}`,
    }));

  return (
    <div className="min-h-0 overflow-auto">
      <SectionHeader
        title="Wallet"
        subtitle="Funding, balances, and wallet activity for this agent."
      />
      <div className="mx-auto grid max-w-5xl gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Primary wallet">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : wallet ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Stat label="USDC" value={balanceValue(balance?.usdc)} />
                <Stat label="Native" value={balanceValue(balance?.native)} />
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <Label className="text-xs text-muted-foreground">Address</Label>
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-mono text-sm">
                    {wallet.address}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={copy}
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <AddToAgentBalance
                agentId={agentId}
                chainId={selectedChainId}
                onChainIdChange={setChainId}
              />
            </div>
          ) : (
            <AddToAgentBalance agentId={agentId} />
          )}
        </Panel>
        <Panel title="Transactions">
          <AgentTransactions transactions={transactions} />
          <p className="mt-3 text-xs text-muted-foreground">
            {activity.loading
              ? "Loading transactions…"
              : activity.error
                ? "Transactions could not be loaded for this network."
                : "USDC and native transfers on the selected network."}
          </p>
        </Panel>
        {wallet && (
          <div className="lg:col-span-2">
            <Panel title="Agent spending">
              <AgentTransferAllowance
                agentId={agentId}
                walletId={wallet.id}
                defaultChainId={selectedChainId}
              />
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}

