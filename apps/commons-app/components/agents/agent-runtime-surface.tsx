"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Moon,
  RefreshCw,
  Server,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UpgradeDialog,
  upgradePromptFrom,
  type UpgradePrompt,
} from "@/components/billing/upgrade-dialog";

type RuntimeState = {
  runtimeType: "native" | "openclaw" | "hermes" | "custom";
  version?: string | null;
  status: string;
  managed: boolean;
  capabilities: Record<string, boolean>;
  computer?: {
    computerId: string;
    status: string;
    desiredState?: string;
    resources?: { vcpu?: number; memoryGiB?: number; storageGiB?: number };
  } | null;
};

export function AgentRuntimeSurface({ agentId }: { agentId: string }) {
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<UpgradePrompt | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/agents/${agentId}/runtime`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.message || payload?.error || "Runtime status unavailable",
        );
      setRuntime(payload.data);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Runtime status unavailable",
      );
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!runtime || !["provisioning", "starting"].includes(runtime.status)) {
      return;
    }
    const timer = window.setInterval(() => void load(), 5_000);
    return () => window.clearInterval(timer);
  }, [load, runtime]);

  const perform = async (name: "deploy" | "restart" | "sleep") => {
    setAction(name);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/runtime/${name}`, {
        method: "POST",
      });
      const payload = await response.json();
      const upgrade = upgradePromptFrom(response.status, payload);
      if (upgrade) {
        setUpgradePrompt(upgrade);
        return;
      }
      if (!response.ok)
        throw new Error(
          payload?.message || payload?.error || `Could not ${name} runtime`,
        );
      setRuntime(payload.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `Could not ${name} runtime`,
      );
    } finally {
      setAction(null);
    }
  };

  const changeRuntime = async (runtimeType: RuntimeState["runtimeType"]) => {
    setAction("configure");
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/runtime`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtimeType, deploy: runtimeType !== "native" }),
      });
      const payload = await response.json();
      const upgrade = upgradePromptFrom(response.status, payload);
      if (upgrade) {
        setUpgradePrompt(upgrade);
        return;
      }
      if (!response.ok)
        throw new Error(
          payload?.message || payload?.error || "Could not update runtime",
        );
      setRuntime(payload.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update runtime",
      );
    } finally {
      setAction(null);
    }
  };

  if (loading && !runtime) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const label =
    runtime?.runtimeType === "openclaw"
      ? "OpenClaw"
      : runtime?.runtimeType === "hermes"
        ? "Hermes"
        : runtime?.runtimeType === "custom"
          ? "Custom runtime"
          : "Agent Commons";
  const ready = runtime?.status === "ready";

  return (
    <div className="grid gap-4">
      <UpgradeDialog
        prompt={upgradePrompt}
        onOpenChange={(open) => {
          if (!open) setUpgradePrompt(null);
        }}
      />
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-2">
              {runtime?.managed ? (
                <Server className="h-5 w-5" />
              ) : (
                <Bot className="h-5 w-5" />
              )}
            </div>
            <div>
              <CardTitle className="text-base">{label}</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {runtime?.managed
                  ? "Managed on this agent’s persistent isolated computer"
                  : "Native Agent Commons execution path"}
              </p>
            </div>
          </div>
          <Badge
            variant={ready ? "default" : "secondary"}
            className="gap-1 rounded-md"
          >
            {ready && <CheckCircle2 className="h-3 w-3" />}
            {runtime?.status ?? "unknown"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid max-w-sm gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Execution runtime
            </p>
            <Select
              value={runtime?.runtimeType ?? "native"}
              disabled={Boolean(action)}
              onValueChange={(value: RuntimeState["runtimeType"]) =>
                void changeRuntime(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="native">Agent Commons</SelectItem>
                <SelectItem value="openclaw">OpenClaw</SelectItem>
                <SelectItem value="hermes">Hermes</SelectItem>
                <SelectItem value="custom">Custom runtime</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {runtime?.computer && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Computer</p>
                <p className="mt-1 truncate font-medium">
                  {runtime.computer.computerId.slice(0, 12)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">State</p>
                <p className="mt-1 font-medium">{runtime.computer.status}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPU</p>
                <p className="mt-1 font-medium">
                  {runtime.computer.resources?.vcpu ?? "—"} vCPU
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Memory</p>
                <p className="mt-1 font-medium">
                  {runtime.computer.resources?.memoryGiB ?? "—"} GiB
                </p>
              </div>
            </div>
          )}
          {runtime?.managed && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={Boolean(action)}
                onClick={() => void perform("deploy")}
              >
                {action === "deploy" ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Server className="mr-2 h-3.5 w-3.5" />
                )}
                Wake / deploy
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(action)}
                onClick={() => void perform("restart")}
              >
                {action === "restart" ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Restart
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(action)}
                onClick={() => void perform("sleep")}
              >
                {action === "sleep" ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Moon className="mr-2 h-3.5 w-3.5" />
                )}
                Sleep
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Unified capabilities</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {Object.entries(runtime?.capabilities ?? {}).map(
            ([capability, enabled]) => (
              <Badge
                key={capability}
                variant={enabled ? "secondary" : "outline"}
                className="rounded-md font-normal"
              >
                {capability}
                {enabled ? "" : " unavailable"}
              </Badge>
            ),
          )}
        </CardContent>
      </Card>
    </div>
  );
}
