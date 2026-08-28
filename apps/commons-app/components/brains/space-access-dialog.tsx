"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Building2, Loader2, ShieldCheck } from "lucide-react";
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
    const response = await fetch(`/api/brains/${space.spaceId}`, {
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

  async function changeAgent(
    agentId: string,
    permission: KnowledgePermission | "none",
  ) {
    if (!detail) return;
    setBusy(agentId);
    setError("");
    try {
      const existing = grants.get(`agent:${agentId}`);
      const response =
        permission === "none" && existing
          ? await fetch(
              `/api/brains/${detail.spaceId}/grants/${existing.grantId}`,
              {
                method: "DELETE",
              },
            )
          : permission === "none"
            ? null
            : await fetch(`/api/brains/${detail.spaceId}/grants`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  subjectType: "agent",
                  subjectId: agentId,
                  permission,
                  autoRetrieve: true,
                }),
              });
      if (response && !response.ok) {
        const payload = await response.json();
        throw new Error(
          payload?.message || payload?.error || "Could not update access",
        );
      }
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update access",
      );
    } finally {
      setBusy(null);
    }
  }

  async function toggleFutureAgents(checked: boolean) {
    if (!detail) return;
    setBusy("future");
    try {
      const response = await fetch(`/api/brains/${detail.spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGrantNewAgents: checked }),
      });
      if (!response.ok) throw new Error("Could not update automatic access");
      await Promise.all([load(), onChanged()]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update access",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>
            Access to {detail?.name || "Knowledge Space"}
          </DialogTitle>
          <DialogDescription>
            Decide which agents can retrieve or change this knowledge.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex items-center justify-between rounded-xl border bg-stone-50/70 p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-stone-200">
                <Bot className="h-4 w-4 text-stone-600" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  Automatically add new agents
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  New agents receive write access and can retrieve context.
                </p>
              </div>
            </div>
            {busy === "future" ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={Boolean(detail?.autoGrantNewAgents)}
                onCheckedChange={toggleFutureAgents}
              />
            )}
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b bg-stone-50 px-4 py-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your agents
              </p>
              <Badge variant="secondary" className="font-normal">
                {agents.length}
              </Badge>
            </div>
            <div className="max-h-64 divide-y overflow-y-auto">
              {agents.map((agent) => {
                const grant = grants.get(`agent:${agent.agentId}`) as
                  | KnowledgeGrant
                  | undefined;
                return (
                  <div
                    key={agent.agentId}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {agent.name || "Untitled agent"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.persona || agent.agentId}
                      </p>
                    </div>
                    {busy === agent.agentId ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Select
                        value={grant?.permission || "none"}
                        onValueChange={(value) =>
                          changeAgent(
                            agent.agentId,
                            value as KnowledgePermission | "none",
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-[132px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No access</SelectItem>
                          <SelectItem value="read">Can read</SelectItem>
                          <SelectItem value="write">Can edit</SelectItem>
                          <SelectItem value="manage">Can manage</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}
              {!agents.length && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Create an agent to share this space.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-3 rounded-xl border border-dashed p-3.5">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                Team-ready permissions{" "}
                <ShieldCheck className="h-3.5 w-3.5 text-teal-700" />
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The access model already supports people and workspaces. Team
                management will appear here when Enterprise is enabled.
              </p>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
