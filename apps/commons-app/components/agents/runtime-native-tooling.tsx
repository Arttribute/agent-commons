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
  runtime,
}: {
  agentId: string;
  runtime: RuntimeInfo;
  onUpdated: (runtime: RuntimeInfo) => void;
}) {
  const key = managedRuntimeKey(runtime);
  if (!key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <Server className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">
              {meta.label} built-in tooling
            </h3>
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 text-[11px] font-normal"
            >
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

      <p className="text-[11px] text-muted-foreground">
        Runtime-specific configuration lives in Agent setup. This view only
        describes the tools provided by {meta.label} and the Agent Commons tool
        bridge.
      </p>
    </div>
  );
}

/** Runtime-specific settings shown in Agent setup. Native agents deliberately
 * do not render this panel because their model and generation settings already
 * live in the native setup form. */
export function ManagedRuntimeSetup({
  agentId,
  isOwner,
}: {
  agentId: string;
  isOwner: boolean;
}) {
  const { runtime, loading, setRuntime } = useAgentRuntime(agentId);
  const key = managedRuntimeKey(runtime);
  const [channelPolicy, setChannelPolicy] = useState<
    "pairing" | "allowlist" | "open" | "disabled"
  >("pairing");
  const [memoryMode, setMemoryMode] = useState<
    "native" | "platform" | "hybrid"
  >("hybrid");
  const [toolsets, setToolsets] = useState("hermes-cli");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runtime) return;
    setChannelPolicy(runtime.config.channelPolicy ?? "pairing");
    setMemoryMode(runtime.config.memoryMode ?? "hybrid");
    setToolsets((runtime.config.enabledToolsets ?? ["hermes-cli"]).join(", "));
  }, [runtime]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!runtime || !key) return null;
  const meta = RUNTIME_NATIVE_TOOLING[key];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const enabledToolsets = toolsets
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await fetch(`/api/agents/${agentId}/runtime`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            ...runtime.config,
            memoryMode,
            ...(key === "openclaw" ? { channelPolicy } : {}),
            ...(key === "hermes" ? { enabledToolsets } : {}),
          },
          deploy: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.message ||
            payload?.error ||
            "Could not apply runtime settings",
        );
      }
      setRuntime(payload.data as RuntimeInfo);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not apply runtime settings",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <Server className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{meta.label}</p>
            <Badge
              variant="secondary"
              className="h-5 rounded-md px-1.5 text-[11px]"
            >
              {runtime.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{meta.summary}</p>
        </div>
      </div>

      {key === "openclaw" && (
        <div className="grid max-w-sm gap-1.5">
          <p className="text-xs font-medium">Channel direct-message policy</p>
          <Select
            value={channelPolicy}
            disabled={!isOwner || saving}
            onValueChange={(value) =>
              setChannelPolicy(value as typeof channelPolicy)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pairing">Pairing required</SelectItem>
              <SelectItem value="allowlist">Allowlist only</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="disabled">Channels disabled</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Used by OpenClaw channel connectors configured on this persistent
            runtime.
          </p>
        </div>
      )}

      {key === "hermes" && (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium">Hermes toolsets</p>
          <Input
            value={toolsets}
            disabled={!isOwner || saving}
            onChange={(event) => setToolsets(event.target.value)}
            placeholder="hermes-cli"
          />
          <p className="text-[11px] text-muted-foreground">
            Comma-separated Hermes toolsets, such as hermes-cli, web, browser,
            debugging, or safe. Agent Commons tools remain available through the
            bridge.
          </p>
        </div>
      )}

      <div className="grid max-w-sm gap-1.5">
        <p className="text-xs font-medium">Memory context</p>
        <Select
          value={memoryMode}
          disabled={!isOwner || saving}
          onValueChange={(value) => setMemoryMode(value as typeof memoryMode)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hybrid">
              Runtime + Agent Commons memory
            </SelectItem>
            <SelectItem value="platform">
              Agent Commons context preferred
            </SelectItem>
            <SelectItem value="native">Runtime memory only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          disabled={!isOwner || saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
          {saved ? "Applied" : "Save & restart runtime"}
        </Button>
      </div>
    </div>
  );
}

/** Compact banner for the Skills view when a managed runtime is active. */
export function RuntimeSkillsNote({
  runtime,
}: {
  runtime: RuntimeInfo | null;
}) {
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
