"use client";

import { desktopApiFetch } from "@/lib/desktop-api-fetch";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { InfoHint } from "@/components/ui/info-hint";
import type { AgentItem } from "@/hooks/agents/use-agents";
import { AgentAvatar } from "@/components/agents/agent-avatar";
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
    const response = await desktopApiFetch(`/api/knowledge/${space.spaceId}`, {
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
          ? await desktopApiFetch(
              `/api/knowledge/${detail.spaceId}/grants/${existing.grantId}`,
              { method: "DELETE" },
            )
          : permission === "none"
          ? null
          : await desktopApiFetch(`/api/knowledge/${detail.spaceId}/grants`, {
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
      const response = await desktopApiFetch(`/api/knowledge/${detail.spaceId}`, {
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>Agent access</DialogTitle>
          <DialogDescription className="truncate">{detail?.name || "This space"}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-4 border-b px-5 py-3">
            <span className="flex items-center gap-1.5 text-sm">
              New agents get access
              <InfoHint>
                Agents without their own setting, and agents you create later, can edit this space and search it automatically.
              </InfoHint>
            </span>
            {busy === "future" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={Boolean(detail?.autoGrantNewAgents)}
                onCheckedChange={toggleFutureAgents}
                aria-label="New agents get access"
              />
            )}
          </div>

          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[11px] text-muted-foreground">
            <span>{connected} of {agents.length} agents</span>
            <span className="flex items-center gap-1">
              Automatic
              <InfoHint>
                On: the agent searches this space whenever a request may need it. Off: it reads the space only when you or the agent name it.
              </InfoHint>
            </span>
          </div>
          <div className="divide-y">
            {agents.map((agent) => {
              const grant = grants.get(`agent:${agent.agentId}`) as KnowledgeGrant | undefined;
              const isBusy = busy === agent.agentId;
              return (
                <div key={agent.agentId} className="flex items-center gap-3 px-5 py-2.5">
                  <AgentAvatar name={agent.name} src={agent.avatar} size={28} />
                  <p className="min-w-0 flex-1 truncate text-sm">{agent.name || "Untitled agent"}</p>
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <Select
                        value={grant?.permission || "none"}
                        onValueChange={(value) => void updateAgent(agent.agentId, value as KnowledgePermission | "none")}
                      >
                        <SelectTrigger className="h-8 w-[116px] bg-white text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No access</SelectItem>
                          <SelectItem value="read">Can read</SelectItem>
                          <SelectItem value="write">Can edit</SelectItem>
                          <SelectItem value="manage">Can manage</SelectItem>
                        </SelectContent>
                      </Select>
                      <Switch
                        checked={Boolean(grant?.autoRetrieve)}
                        disabled={!grant}
                        onCheckedChange={(checked) => grant && void updateAgent(agent.agentId, grant.permission, checked)}
                        aria-label={`Automatic retrieval for ${agent.name || "agent"}`}
                      />
                    </>
                  )}
                </div>
              );
            })}
            {!agents.length && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No agents yet.</p>
            )}
          </div>
          {error && (
            <p className="mx-5 my-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

