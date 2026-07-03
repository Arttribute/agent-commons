"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Check,
  Circle,
  Code2,
  File,
  Folder,
  Globe2,
  HardDrive,
  Loader2,
  Monitor,
  Play,
  Power,
  RefreshCw,
  Save,
  SquareTerminal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ComputerConfig = {
  enabled: boolean;
  defaultMode: "persistent" | "ephemeral";
  autoStart: boolean;
  allowAgentStart: boolean;
  allowUserSelect: boolean;
  allowBrowser: boolean;
  allowTerminal: boolean;
  allowFilesystem: boolean;
  networkAccess: string;
  maxPersistentComputers: number;
  maxEphemeralComputers: number;
  maxConcurrentComputers: number;
  idleTtlMinutes: number;
  sessionTtlMinutes: number;
  image?: string | null;
  cpuLimit?: string | null;
  memoryLimit?: string | null;
  storageLimit?: string | null;
  region?: string | null;
};

export type AgentComputer = {
  computerId: string;
  agentId: string;
  sessionId?: string | null;
  name: string;
  lifecycle: "persistent" | "ephemeral";
  status: string;
  provider: string;
  cloudProvider?: string | null;
  region?: string | null;
  namespaceId?: string | null;
  workspaceRoot?: string | null;
  workspaceSnapshot?: string | null;
  browser?: {
    status?: "off" | "starting" | "on" | "error";
    url?: string | null;
    title?: string | null;
    screenshot?: string | null;
    lastAction?: string | null;
    error?: string | null;
    updatedAt?: string | null;
  } | null;
  terminal?: {
    lastCommand?: string | null;
    lastOutput?: string | null;
    updatedAt?: string | null;
  } | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ComputerEvent = {
  eventId: string;
  eventType: string;
  summary?: string | null;
  payload?: Record<string, any> | null;
  createdAt: string;
};

export type ComputerRuntimeTab = "files" | "browser" | "terminal";

type FsNode = {
  name: string;
  isDir: boolean;
  children: FsNode[];
  depth: number;
};

export function AgentComputerPanel({
  agentId,
  sessionId,
  showConfig = false,
  selectedComputerId,
  activeTab,
  autoRefresh = false,
  className,
}: {
  agentId: string;
  sessionId?: string;
  showConfig?: boolean;
  selectedComputerId?: string;
  activeTab?: ComputerRuntimeTab;
  autoRefresh?: boolean;
  className?: string;
}) {
  const [config, setConfig] = useState<ComputerConfig | null>(null);
  const [draft, setDraft] = useState<ComputerConfig | null>(null);
  const [computers, setComputers] = useState<AgentComputer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedComputer =
    computers.find((computer) => computer.computerId === selectedId) ??
    computers[0] ??
    null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, computersRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/computer/config`, { cache: "no-store" }),
        fetch(
          `/api/agents/${agentId}/computers${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`,
          { cache: "no-store" },
        ),
      ]);
      const configPayload = await configRes.json();
      const computersPayload = await computersRes.json();
      if (!configRes.ok) throw new Error(configPayload?.error || "Could not load computer config");
      if (!computersRes.ok) throw new Error(computersPayload?.error || "Could not load computers");
      setConfig(configPayload.data);
      setDraft(configPayload.data);
      const nextComputers = computersPayload.data ?? [];
      setComputers(nextComputers);
      setSelectedId((current) => {
        if (
          selectedComputerId &&
          nextComputers.some((computer: AgentComputer) => computer.computerId === selectedComputerId)
        ) {
          return selectedComputerId;
        }
        if (
          current &&
          nextComputers.some((computer: AgentComputer) => computer.computerId === current)
        ) {
          return current;
        }
        return nextComputers[0]?.computerId ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Computer load failed");
    } finally {
      setLoading(false);
    }
  }, [agentId, selectedComputerId, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedComputerId) return;
    setSelectedId(selectedComputerId);
  }, [selectedComputerId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      load();
    }, 2500);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const saveConfig = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/agents/${agentId}/computer/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save config");
      setConfig(payload.data);
      setDraft(payload.data);
    } finally {
      setSaving(false);
    }
  };

  const startComputer = async (lifecycle: "persistent" | "ephemeral") => {
    setStarting(true);
    try {
      const response = await fetch(`/api/agents/${agentId}/computers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          lifecycle,
          reason: showConfig ? "Started from agent studio" : "Started from session computer drawer",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not start computer");
      await load();
      setSelectedId(payload.data?.computerId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start computer");
    } finally {
      setStarting(false);
    }
  };

  const stopComputer = async (computerId: string) => {
    await fetch(`/api/agents/${agentId}/computers/${computerId}/stop`, {
      method: "POST",
    }).catch(() => null);
    await load();
  };

  return (
    <div
      className={cn(
        "grid h-full min-h-0 overflow-hidden",
        showConfig ? "grid-cols-[340px_minmax(0,1fr)]" : "grid-cols-1",
        className,
      )}
    >
      {showConfig && draft && (
        <aside className="flex min-h-0 flex-col border-r border-border bg-muted/15">
          <div className="border-b border-border/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Computer</h2>
                <p className="mt-1 text-xs text-muted-foreground">Per-agent runtime policy</p>
              </div>
              <Button size="sm" className="h-8 gap-1.5" onClick={saveConfig} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 p-4">
              <ToggleRow
                label="Computer access"
                detail="Allow this agent to use CommonOS computers."
                checked={draft.enabled}
                onChange={(enabled) => setDraft({ ...draft, enabled })}
              />
              <ToggleRow
                label="Agent can start computers"
                detail="Lets the agent provision a computer when the task requires one."
                checked={draft.allowAgentStart}
                onChange={(allowAgentStart) => setDraft({ ...draft, allowAgentStart })}
              />
              <ToggleRow
                label="User-selectable"
                detail="Show this option in the session composer."
                checked={draft.allowUserSelect}
                onChange={(allowUserSelect) => setDraft({ ...draft, allowUserSelect })}
              />
              <div className="grid gap-1.5">
                <Label>Default mode</Label>
                <Select value={draft.defaultMode} onValueChange={(defaultMode) => setDraft({ ...draft, defaultMode: defaultMode as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ephemeral">Ephemeral</SelectItem>
                    <SelectItem value="persistent">Persistent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <NumberField label="Persistent" value={draft.maxPersistentComputers} onChange={(value) => setDraft({ ...draft, maxPersistentComputers: value })} />
                <NumberField label="Ephemeral" value={draft.maxEphemeralComputers} onChange={(value) => setDraft({ ...draft, maxEphemeralComputers: value })} />
                <NumberField label="Total" value={draft.maxConcurrentComputers} onChange={(value) => setDraft({ ...draft, maxConcurrentComputers: value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Idle min" value={draft.idleTtlMinutes} onChange={(value) => setDraft({ ...draft, idleTtlMinutes: value })} />
                <NumberField label="Session min" value={draft.sessionTtlMinutes} onChange={(value) => setDraft({ ...draft, sessionTtlMinutes: value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Runtime image</Label>
                <Input value={draft.image ?? ""} onChange={(e) => setDraft({ ...draft, image: e.target.value })} placeholder="CommonOS default" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <TextField label="CPU" value={draft.cpuLimit ?? ""} onChange={(value) => setDraft({ ...draft, cpuLimit: value })} />
                <TextField label="Memory" value={draft.memoryLimit ?? ""} onChange={(value) => setDraft({ ...draft, memoryLimit: value })} />
                <TextField label="Storage" value={draft.storageLimit ?? ""} onChange={(value) => setDraft({ ...draft, storageLimit: value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Region</Label>
                <Input value={draft.region ?? ""} onChange={(e) => setDraft({ ...draft, region: e.target.value })} placeholder="CommonOS default" />
              </div>
            </div>
          </ScrollArea>
        </aside>
      )}

      <div className="min-h-0 overflow-hidden">
        <div className="flex min-h-0 h-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <h3 className="truncate text-sm font-medium">Agent computers</h3>
                {hasActiveComputer(computers) && <span className="h-2 w-2 rounded-full bg-red-500" />}
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {config?.enabled ? `${computers.length} active or recent runtime${computers.length === 1 ? "" : "s"}` : "Computer access is disabled"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={load}>
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button size="sm" className="h-8 gap-1.5" disabled={!config?.enabled || starting} onClick={() => startComputer("ephemeral")}>
                {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Ephemeral
              </Button>
              {showConfig && (
                <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!config?.enabled || starting} onClick={() => startComputer("persistent")}>
                  <HardDrive className="h-3.5 w-3.5" />
                  Persistent
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
            <aside className="min-h-0 border-r border-border bg-muted/10">
              <ScrollArea className="h-full">
                <div className="p-2">
                  {loading && computers.length === 0 ? (
                    <div className="flex h-28 items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : computers.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No computers yet.
                    </div>
                  ) : (
                    computers.map((computer) => (
                      <button
                        key={computer.computerId}
                        type="button"
                        className={cn(
                          "mb-1 w-full rounded-md px-3 py-2 text-left hover:bg-muted",
                          selectedComputer?.computerId === computer.computerId && "bg-accent text-accent-foreground",
                        )}
                        onClick={() => setSelectedId(computer.computerId)}
                      >
                        <div className="flex items-center gap-2">
                          <Circle className={cn("h-2.5 w-2.5 fill-current", statusTone(computer.status))} />
                          <p className="min-w-0 flex-1 truncate text-sm font-medium">{computer.name}</p>
                          <Badge variant="secondary" className="rounded-md text-[10px]">{computer.lifecycle}</Badge>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {computer.status} · {shortId(computer.computerId)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </aside>

            <div className="min-h-0 overflow-hidden">
              {selectedComputer ? (
                <ComputerRuntime
                  agentId={agentId}
                  sessionId={sessionId}
                  computer={selectedComputer}
                  activeTab={activeTab}
                  autoRefresh={autoRefresh}
                  eventsKey={computers.map((computer) => computer.updatedAt).join("|")}
                  onRefresh={load}
                  onStop={() => stopComputer(selectedComputer.computerId)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select or start a computer.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComputerRuntime({
  agentId,
  sessionId,
  computer,
  activeTab,
  autoRefresh,
  eventsKey,
  onRefresh,
  onStop,
}: {
  agentId: string;
  sessionId?: string;
  computer: AgentComputer;
  activeTab?: ComputerRuntimeTab;
  autoRefresh?: boolean;
  eventsKey: string;
  onRefresh: () => void;
  onStop: () => void;
}) {
  const [tab, setTab] = useState<ComputerRuntimeTab>(activeTab ?? "files");

  useEffect(() => {
    if (activeTab) setTab(activeTab);
  }, [activeTab]);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as ComputerRuntimeTab)} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <TabsList className="h-8">
          <TabsTrigger value="files" className="h-7 gap-1.5"><Folder className="h-3.5 w-3.5" />Files</TabsTrigger>
          <TabsTrigger value="browser" className="h-7 gap-1.5"><Globe2 className="h-3.5 w-3.5" />Browser</TabsTrigger>
          <TabsTrigger value="terminal" className="h-7 gap-1.5"><SquareTerminal className="h-3.5 w-3.5" />Terminal</TabsTrigger>
        </TabsList>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={onStop}>
          <Power className="h-3.5 w-3.5" />
          Stop
        </Button>
      </div>
      <TabsContent value="files" className="min-h-0 flex-1 p-0">
        <FilesView agentId={agentId} computer={computer} />
      </TabsContent>
      <TabsContent value="browser" className="min-h-0 flex-1 p-0">
        <BrowserView agentId={agentId} sessionId={sessionId} computer={computer} onRefresh={onRefresh} />
      </TabsContent>
      <TabsContent value="terminal" className="min-h-0 flex-1 p-0">
        <TerminalView agentId={agentId} sessionId={sessionId} computer={computer} autoRefresh={autoRefresh} eventsKey={eventsKey} onRefresh={onRefresh} />
      </TabsContent>
    </Tabs>
  );
}

function FilesView({ agentId, computer }: { agentId: string; computer: AgentComputer }) {
  const [path, setPath] = useState<string[]>([]);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const tree = useMemo(() => parseSnapshot(computer.workspaceSnapshot ?? ""), [computer.workspaceSnapshot]);
  const nodes = useMemo(() => currentNodes(tree, path), [tree, path]);

  const readFile = async (name: string) => {
    const fullPath = "/" + [...path, name].join("/");
    setFilePath(fullPath);
    setFileContent(null);
    setFileError(null);
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/computers/${computer.computerId}/files/read?path=${encodeURIComponent(fullPath)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || "Could not read file");
      setFileContent(payload.data?.content ?? "");
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setLoadingFile(false);
    }
  };

  if (filePath) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-10 items-center gap-2 border-b border-border/70 px-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFilePath(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-0 flex-1 truncate font-mono text-xs">{filePath}</p>
        </div>
        {loadingFile ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : fileError ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">{fileError}</div>
        ) : (
          <pre className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4 text-xs leading-6">{fileContent}</pre>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 items-center gap-2 border-b border-border/70 px-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={path.length === 0} onClick={() => setPath(path.slice(0, -1))}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-xs">workspace/{path.join("/")}</p>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {nodes.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            {computer.workspaceSnapshot ? "Empty folder" : "Workspace snapshot will appear after the computer starts working."}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2 p-3">
            {nodes.map((node) => (
              <button
                key={node.name}
                type="button"
                className="flex h-24 flex-col items-center justify-center gap-2 rounded-md border border-transparent p-2 text-center hover:border-border hover:bg-muted/40"
                onClick={() => node.isDir ? setPath([...path, node.name]) : readFile(node.name)}
              >
                {node.isDir ? <Folder className="h-7 w-7 text-amber-500" /> : <File className="h-7 w-7 text-blue-500" />}
                <span className="line-clamp-2 max-w-full break-all text-xs">{node.name}</span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function BrowserView({ agentId, sessionId, computer, onRefresh }: { agentId: string; sessionId?: string; computer: AgentComputer; onRefresh: () => void }) {
  const [url, setUrl] = useState(computer.browser?.url ?? "");
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    setUrl(computer.browser?.url ?? "");
  }, [computer.browser?.url]);

  const open = async () => {
    if (!url.trim()) return;
    setOpening(true);
    try {
      await fetch(`/api/agents/${agentId}/computers/${computer.computerId}/browser/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sessionId }),
      });
      onRefresh();
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center gap-2 border-b border-white/10 p-2">
        <span className={cn("h-2 w-2 rounded-full", browserStatusClass(computer.browser?.status))} />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-8 border-white/10 bg-slate-900 font-mono text-xs text-slate-100"
          placeholder="https://example.com"
        />
        <Button size="sm" className="h-8 gap-1.5" onClick={open} disabled={opening}>
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe2 className="h-3.5 w-3.5" />}
          Open
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-3">
        {computer.browser?.screenshot ? (
          <img src={computer.browser.screenshot} alt="Agent browser viewport" className="mx-auto max-w-full rounded-md border border-white/10" />
        ) : (
          <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 text-sm text-slate-400">
            <Globe2 className="h-8 w-8" />
            <span>{computer.browser?.status === "starting" ? "Browser is launching" : "No browser viewport yet"}</span>
          </div>
        )}
      </div>
      <div className="border-t border-white/10 px-3 py-2 font-mono text-xs text-slate-400">
        {computer.browser?.error ?? computer.browser?.lastAction ?? computer.browser?.title ?? computer.browser?.url ?? "browser idle"}
      </div>
    </div>
  );
}

function TerminalView({
  agentId,
  sessionId,
  computer,
  eventsKey,
  autoRefresh,
  onRefresh,
}: {
  agentId: string;
  sessionId?: string;
  computer: AgentComputer;
  eventsKey: string;
  autoRefresh?: boolean;
  onRefresh: () => void;
}) {
  const [command, setCommand] = useState("");
  const [events, setEvents] = useState<ComputerEvent[]>([]);
  const [running, setRunning] = useState(false);

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/computers/${computer.computerId}/events?limit=80`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (res.ok) setEvents(payload?.data ?? []);
  }, [agentId, computer.computerId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, eventsKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadEvents, 2500);
    return () => clearInterval(interval);
  }, [autoRefresh, loadEvents]);

  const run = async () => {
    if (!command.trim()) return;
    setRunning(true);
    try {
      await fetch(`/api/agents/${agentId}/computers/${computer.computerId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, sessionId, timeoutSeconds: 120 }),
      });
      setCommand("");
      await loadEvents();
      onRefresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 text-zinc-100">
      <div className="flex items-center gap-2 border-b border-white/10 p-2">
        <span className="font-mono text-xs text-zinc-500">$</span>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") run();
          }}
          className="h-8 border-white/10 bg-zinc-900 font-mono text-xs text-zinc-100"
          placeholder="npm test"
        />
        <Button size="sm" className="h-8 gap-1.5" onClick={run} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Code2 className="h-3.5 w-3.5" />}
          Run
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3 font-mono text-xs">
          {computer.terminal?.lastCommand && (
            <TerminalBlock title={`$ ${computer.terminal.lastCommand}`} body={computer.terminal.lastOutput ?? ""} />
          )}
          {events.filter((event) => event.eventType.includes("terminal") || event.eventType.includes("browser") || event.eventType.includes("computer")).map((event) => (
            <TerminalBlock
              key={event.eventId}
              title={`${formatTime(event.createdAt)} ${event.eventType}${event.summary ? ` · ${event.summary}` : ""}`}
              body={event.payload?.response ?? event.payload?.error ?? event.payload?.instruction ?? ""}
            />
          ))}
          {events.length === 0 && !computer.terminal?.lastCommand && (
            <div className="flex h-56 items-center justify-center text-zinc-500">Terminal activity will appear here.</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function TerminalBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-3 py-2 text-zinc-400">{title}</div>
      {body && <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 leading-5 text-zinc-200">{body}</pre>}
    </div>
  );
}

function ToggleRow({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={1} value={value} onChange={(e) => onChange(Number(e.target.value) || 1)} />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function parseSnapshot(snapshot: string): FsNode[] {
  const lines = snapshot.split("\n").filter(Boolean);
  const root: FsNode[] = [];
  const stack: Array<{ node: FsNode; indent: number }> = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const indent = line.length - line.trimStart().length;
    const name = line.trim().replace("... (truncated)", "...");
    if (!name) continue;
    const isDir = name.endsWith("/");
    const node: FsNode = {
      name: isDir ? name.slice(0, -1) : name,
      isDir,
      children: [],
      depth: indent,
    };
    while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) stack.pop();
    if (stack.length === 0) root.push(node);
    else stack[stack.length - 1]!.node.children.push(node);
    stack.push({ node, indent });
  }
  return root;
}

function currentNodes(tree: FsNode[], path: string[]) {
  let nodes = tree;
  for (const segment of path) {
    const next = nodes.find((node) => node.isDir && node.name === segment);
    if (!next) return [];
    nodes = next.children;
  }
  return [
    ...nodes.filter((node) => node.isDir).sort((a, b) => a.name.localeCompare(b.name)),
    ...nodes.filter((node) => !node.isDir).sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export function hasActiveComputer(computers: AgentComputer[]) {
  return computers.some((computer) =>
    ["provisioning", "starting", "running", "idle"].includes(computer.status),
  );
}

function statusTone(status: string) {
  if (["running", "idle"].includes(status)) return "text-emerald-500";
  if (["provisioning", "starting"].includes(status)) return "text-amber-500";
  if (["failed", "error", "unavailable"].includes(status)) return "text-red-500";
  return "text-muted-foreground";
}

function browserStatusClass(status?: string) {
  if (status === "on") return "bg-emerald-500";
  if (status === "starting") return "bg-amber-500";
  if (status === "error") return "bg-red-500";
  return "bg-slate-500";
}

function shortId(id: string) {
  return `${id.slice(0, 8)}...${id.slice(-4)}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
