"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Building2,
  Loader2,
  Route,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { AgentItem } from "@/hooks/agents/use-agents";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  KnowledgeGrant,
  KnowledgePermission,
  KnowledgeSpace,
} from "./types";

export function SpaceAccessDialog({
  open,
  onOpenChange,
  space,
  agents,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: KnowledgeSpace | null;
  agents: AgentItem[];
  onChanged: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<KnowledgeSpace | null>(space);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    if (!space) return;
    const response = await fetch(`/api/knowledge/${space.spaceId}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (response.ok) setDetail(payload.data);
  }

  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, space?.spaceId]);

  const grants = useMemo(
    () =>
      new Map(
        (detail?.grants || []).map((grant) => [
          `${grant.subjectType}:${grant.subjectId}`,
          grant,
        ]),
      ),
    [detail?.grants],
  );

  async function updateAgent(
    agentId: string,
    permission: KnowledgePermission | "none",
    autoRetrieve?: boolean,
  ) {
    if (!detail) return;
    setBusy(agentId);
    setError("");
    try {
      const existing = grants.get(`agent:${agentId}`);
      const response =
        permission === "none" && existing
          ? await fetch(
              `/api/knowledge/${detail.spaceId}/grants/${existing.grantId}`,
              { method: "DELETE" },
            )
          : permission === "none"
            ? null
            : await fetch(`/api/knowledge/${detail.spaceId}/grants`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subjectType: "agent",
                  subjectId: agentId,
                  permission,
                  autoRetrieve: autoRetrieve ?? existing?.autoRetrieve ?? true,
                }),
              });
      if (response && !response.ok) {
        const payload = await response.json();
        throw new Error(
          payload?.message || payload?.error || "Could not update routing",
        );
      }
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update routing",
      );
    } finally {
      setBusy(null);
    }
  }

  async function toggleFutureAgents(checked: boolean) {
    if (!detail) return;
    setBusy("future");
    setError("");
    try {
      const response = await fetch(`/api/knowledge/${detail.spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGrantNewAgents: checked }),
      });
      if (!response.ok) throw new Error("Could not update the default route");
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update routing",
      );
    } finally {
      setBusy(null);
    }
  }

  const connected = [...grants.values()].filter(
    (grant) => grant.subjectType === "agent",
  ).length;
  const automatic = [...grants.values()].filter(
    (grant) => grant.subjectType === "agent" && grant.autoRetrieve,
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]">
        <DialogHeader className="shrink-0 border-b bg-white px-6 py-5 pr-14">
          <DialogTitle>Agent routing</DialogTitle>
          <DialogDescription>
            Choose which agents can use {detail?.name || "this space"}, and when
            it should be searched automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#faf9f6] p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <RoutingModeCard
              icon={BrainCircuit}
              title="Automatic context"
              description="The agent searches this space when a prompt may benefit from its knowledge."
              accent="teal"
            />
            <RoutingModeCard
              icon={SlidersHorizontal}
              title="Manual only"
              description="The agent can still read or edit this space when you or the agent names it explicitly."
              accent="violet"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border bg-white p-4 shadow-card">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-800 ring-1 ring-teal-100">
                <Route className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Default route for new agents
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Connect unassigned current agents and future agents with write
                  access and automatic context. Existing routes stay
                  individually configurable.
                </p>
              </div>
            </div>
            {busy === "future" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={Boolean(detail?.autoGrantNewAgents)}
                onCheckedChange={toggleFutureAgents}
                aria-label="Automatically connect new agents"
              />
            )}
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-stone-50/70 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Your agents</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {connected} connected · {automatic} automatic
                </p>
              </div>
              <Badge variant="secondary" className="font-normal">
                {agents.length} total
              </Badge>
            </div>
            <div className="max-h-[min(390px,45vh)] divide-y overflow-y-auto">
              {agents.map((agent) => {
                const grant = grants.get(`agent:${agent.agentId}`) as
                  | KnowledgeGrant
                  | undefined;
                const isBusy = busy === agent.agentId;
                return (
                  <div
                    key={agent.agentId}
                    className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">
                        {(agent.name || "A").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {agent.name || "Untitled agent"}
                        </p>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {agent.persona || "Agent Commons agent"}
                        </p>
                      </div>
                    </div>
                    {isBusy ? (
                      <div className="flex h-8 w-full items-center justify-center sm:w-[250px]">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
                        <Select
                          value={grant?.permission || "none"}
                          onValueChange={(value) =>
                            void updateAgent(
                              agent.agentId,
                              value as KnowledgePermission | "none",
                            )
                          }
                        >
                          <SelectTrigger className="h-8 w-[126px] bg-white text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No access</SelectItem>
                            <SelectItem value="read">Can read</SelectItem>
                            <SelectItem value="write">Can edit</SelectItem>
                            <SelectItem value="manage">Can manage</SelectItem>
                          </SelectContent>
                        </Select>
                        <label
                          className={cn(
                            "flex min-w-[108px] items-center justify-end gap-2 text-xs",
                            grant ? "text-stone-700" : "text-stone-400",
                          )}
                        >
                          <span>
                            {grant?.autoRetrieve ? "Automatic" : "Manual"}
                          </span>
                          <Switch
                            checked={Boolean(grant?.autoRetrieve)}
                            disabled={!grant}
                            onCheckedChange={(checked) =>
                              grant &&
                              void updateAgent(
                                agent.agentId,
                                grant.permission,
                                checked,
                              )
                            }
                            aria-label={`Automatic retrieval for ${agent.name || "agent"}`}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
              {!agents.length && (
                <div className="flex flex-col items-center px-4 py-10 text-center">
                  <Bot className="h-7 w-7 text-stone-300" />
                  <p className="mt-3 text-sm font-medium">No agents yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create an agent, then return here to configure its
                    knowledge.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-3 rounded-xl border border-dashed border-stone-300 bg-white/60 p-3.5">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                Team-ready permissions
                <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The same access model supports people and workspaces when team
                administration is enabled later.
              </p>
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoutingModeCard({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: typeof BrainCircuit;
  title: string;
  description: string;
  accent: "teal" | "violet";
}) {
  return (
    <div className="flex gap-3 rounded-xl border bg-white p-3.5 shadow-card">
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          accent === "teal"
            ? "bg-teal-50 text-teal-800"
            : "bg-violet-50 text-violet-700",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
