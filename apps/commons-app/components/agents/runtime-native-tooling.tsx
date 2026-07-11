"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Puzzle, Server, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentRuntimeType } from "@/types/agent";

export type RuntimeInfo = {
  runtimeType: AgentRuntimeType;
  status: string;
  managed: boolean;
  capabilities: Record<string, boolean>;
  config: {
    deploymentMode?: string;
    channelPolicy?: "pairing" | "allowlist" | "open" | "disabled";
    enabledPlugins?: string[];
    enabledToolsets?: string[];
    memoryMode?: "native" | "platform" | "hybrid";
  };
};

/** Built-in tooling each managed runtime ships with, shown alongside the
 * Agent Commons catalog so both surfaces read as one system. */
export const RUNTIME_NATIVE_TOOLING: Record<
  "openclaw" | "hermes",
  {
    label: string;
    summary: string;
    builtIns: Array<{ name: string; description: string }>;
    bridgeNote: string;
    skillsNote: string;
  }
> = {
  openclaw: {
    label: "OpenClaw",
    summary:
      "OpenClaw runs on this agent's managed computer with its own gateway, plugins, and channel connectors.",
    builtIns: [
      { name: "browser", description: "Full browser automation" },
      { name: "canvas", description: "Visual canvas and rendering" },
      { name: "codex", description: "Code generation sessions" },
      { name: "device-pair", description: "Pair phones and devices" },
      { name: "file-transfer", description: "Send and receive files" },
      { name: "memory-core", description: "OpenClaw's own memory store" },
      { name: "phone-control", description: "Control paired phones" },
      { name: "talk-voice", description: "Voice conversations" },
    ],
    bridgeNote:
      "Tools connected below are also reachable from OpenClaw through the computer's tool bridge — OpenClaw can list and call any of them mid-task.",
    skillsNote:
      "Skills are delivered to OpenClaw sessions as an index; OpenClaw pulls a skill's full instructions through the computer's tool bridge when a request matches.",
  },
  hermes: {
    label: "Hermes",
    summary:
      "Hermes runs on this agent's managed computer with its own full toolset and self-improving skills library.",
    builtIns: [
      { name: "terminal", description: "Shell access inside its runtime" },
      { name: "files", description: "Read and write workspace files" },
      { name: "browser", description: "Web browsing and scraping" },
      { name: "web-search", description: "Built-in web search" },
      { name: "memory", description: "Hermes' persistent memory store" },
      { name: "skills", description: "Self-authored reusable skills" },
    ],
    bridgeNote:
      "Tools connected below are also reachable from Hermes through the computer's tool bridge — Hermes can list and call any of them mid-task.",
    skillsNote:
      "Skills are delivered to Hermes sessions as an index; Hermes pulls a skill's full instructions through the computer's tool bridge. Hermes also keeps its own self-authored skills inside its runtime.",
  },
};

export function useAgentRuntime(agentId: string, enabled = true) {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/runtime`, {
        cache: "no-store",
      });
      const payload = await res.json();
      if (res.ok) setRuntime(payload.data as RuntimeInfo);
    } catch {
      // Runtime info is progressive enhancement — views fall back to AGC-only.
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { runtime, loading, refresh, setRuntime };
}

export function managedRuntimeKey(
  runtime: RuntimeInfo | null,
): "openclaw" | "hermes" | null {
  if (runtime?.runtimeType === "openclaw") return "openclaw";
  if (runtime?.runtimeType === "hermes") return "hermes";
  return null;
}

/** Detail panel for the pinned "native tooling" entry in the agent Tools view. */
export function RuntimeNativeToolingDetail({
  agentId,
  runtime,
  onUpdated,
}: {
  agentId: string;
  runtime: RuntimeInfo;
  onUpdated: (runtime: RuntimeInfo) => void;
}) {
  const key = managedRuntimeKey(runtime);
  const [plugins, setPlugins] = useState(
    (runtime.config.enabledPlugins ?? []).join(", "),
  );
  const [channelPolicy, setChannelPolicy] = useState(
    runtime.config.channelPolicy ?? "pairing",
  );
  const [memoryMode, setMemoryMode] = useState(
    runtime.config.memoryMode ?? "hybrid",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/runtime`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            ...runtime.config,
            enabledPlugins: plugins
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean),
            channelPolicy,
            memoryMode,
          },
          // Config changes redeploy the runtime so the gateway picks them up.
          deploy: true,
        }),
      });
      const payload = await res.json();
      if (!res.ok)
        throw new Error(
          payload?.message || payload?.error || "Could not save configuration",
        );
      onUpdated(payload.data as RuntimeInfo);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save configuration",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <Server className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{meta.label} built-in tooling</h3>
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px] font-normal">
              {runtime.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.summary}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Comes with {meta.label}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {meta.builtIns.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center gap-2.5 rounded-lg border border-border/70 px-2.5 py-2"
            >
              <Puzzle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{tool.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {tool.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        {meta.bridgeNote}
      </p>

      {key === "openclaw" && (
        <div className="grid gap-3 rounded-lg border border-border p-3">
          <p className="text-xs font-medium">OpenClaw configuration</p>
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">
              Extra plugins (comma-separated)
            </p>
            <Input
              value={plugins}
              placeholder="e.g. whatsapp, telegram"
              onChange={(event) => setPlugins(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:max-w-xs">
            <p className="text-xs text-muted-foreground">Channel DM policy</p>
            <Select
              value={channelPolicy}
              onValueChange={(value) =>
                setChannelPolicy(value as typeof channelPolicy)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pairing">Pairing (scan to connect)</SelectItem>
                <SelectItem value="allowlist">Allowlist</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid gap-1.5 sm:max-w-xs">
        <p className="text-xs text-muted-foreground">Memory mode</p>
        <Select
          value={memoryMode}
          onValueChange={(value) => setMemoryMode(value as typeof memoryMode)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">
              Hybrid — runtime + Agent Commons memory
            </SelectItem>
            <SelectItem value="platform">Agent Commons memory only</SelectItem>
            <SelectItem value="native">Runtime memory only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div>
        <Button size="sm" className="h-8 gap-1.5" disabled={saving} onClick={save}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
          {saved ? "Saved" : "Save & apply"}
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Saving restarts the {meta.label} runtime so the new configuration takes
          effect.
        </p>
      </div>
    </div>
  );
}

/** Compact banner for the Skills view when a managed runtime is active. */
export function RuntimeSkillsNote({ runtime }: { runtime: RuntimeInfo | null }) {
  const key = managedRuntimeKey(runtime);
  if (!key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{meta.skillsNote}</p>
    </div>
  );
}
