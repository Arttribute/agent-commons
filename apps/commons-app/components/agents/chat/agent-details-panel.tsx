"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  ChevronRight,
  Clock,
  Cpu,
  HeartPulse,
  NotebookText,
  Server,
  Wallet,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import AgentAvatarUploader from "@/components/agents/agent-avatar-uploader";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useAgentSkills } from "@/hooks/use-skills";
import type { CommonAgent } from "@/types/agent";
import { cn } from "@/lib/utils";
import { AgentFilesPanel } from "./agent-files-panel";
import { AgentComputerCard } from "./agent-computer-card";
import type { ChatSection } from "./agent-chat-sections";

export type DetailsTab = "about" | "files" | "computer";

const TABS: Array<[DetailsTab, string]> = [
  ["about", "About"],
  ["files", "Files"],
  ["computer", "Computer"],
];

function Row({ icon: Icon, label, value, onClick }: { icon: LucideIcon; label: string; value?: string | number | null; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        {value !== undefined && value !== null && value !== "" && (
          <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{value}</span>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </button>
    </li>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-white">{children}</ul>;
}

function formatInterval(seconds?: number) {
  if (!seconds) return "";
  if (seconds < 3600) return `every ${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `every ${Math.round(seconds / 3600)}h`;
  return `every ${Math.round(seconds / 86_400)}d`;
}

/**
 * The agent's profile beside its chat, like a contact's info in a messenger:
 * who it is, then one row per setting that opens its own view.
 */
export function AgentDetailsPanel({
  agent,
  isOwner,
  toolCount,
  tab,
  onTab,
  onOpenSection,
  onClose,
  onAgentUpdated,
  className,
}: {
  agent: CommonAgent;
  isOwner: boolean;
  toolCount: number | null;
  tab: DetailsTab;
  onTab: (tab: DetailsTab) => void;
  onOpenSection: (section: ChatSection) => void;
  onClose: () => void;
  onAgentUpdated: (agent: CommonAgent) => void;
  className?: string;
}) {
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const { skills } = useAgentSkills(agent.agentId);
  const managed = agent.runtimeType === "openclaw" || agent.runtimeType === "hermes";
  const [heartbeat, setHeartbeat] = useState<{ enabled?: boolean; intervalSec?: number } | null>(null);

  useEffect(() => {
    if (local || managed) return;
    let cancelled = false;
    fetch(`/api/agents/${encodeURIComponent(agent.agentId)}/autonomy`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => !cancelled && setHeartbeat(payload?.data ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agent.agentId, local, managed]);

  const runtimeLabel = agent.runtimeType === "openclaw" ? "OpenClaw" : agent.runtimeType === "hermes" ? "Hermes" : agent.runtimeType === "custom" ? "Custom" : "Agent Commons";
  const about = agent.persona || agent.instructions;

  return (
    <aside className={cn("flex min-h-0 flex-col bg-page", className)} aria-label={`${agent.name} details`}>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        <span className="px-1 text-sm font-medium">Agent info</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close agent info"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col items-center px-5 pb-5 pt-1 text-center">
          {isOwner ? (
            <AgentAvatarUploader
              agentId={agent.agentId}
              name={agent.name}
              avatarUrl={agent.avatar}
              size={88}
              onUploaded={(avatar, updated) => onAgentUpdated(updated ? (updated as CommonAgent) : { ...agent, avatar })}
            />
          ) : (
            <AgentAvatar name={agent.name} src={agent.avatar} size={88} />
          )}
          <h2 className="mt-3 max-w-full truncate text-lg font-medium">{agent.name}</h2>
          {agent.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{agent.description}</p>
          ) : isOwner ? (
            <button type="button" onClick={() => onOpenSection("profile")} className="mt-1 text-sm text-muted-foreground hover:text-foreground">
              Add a description
            </button>
          ) : null}
          {isOwner && agent.description && (
            <button type="button" onClick={() => onOpenSection("profile")} className="mt-2 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Edit profile
            </button>
          )}
        </div>

        <div className="sticky top-0 z-10 bg-page px-4 pb-3">
          <div className="flex gap-1 rounded-full bg-muted p-1" role="tablist" aria-label="Agent info">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => onTab(key)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1 text-xs transition-colors",
                  tab === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "about" && (
          <div className="space-y-3 px-4 pb-6">
            <button
              type="button"
              onClick={() => onOpenSection("instructions")}
              className="block w-full rounded-xl border border-border bg-white px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
            >
              <span className="flex items-center justify-between text-xs text-muted-foreground">
                Instructions
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              </span>
              <span className={cn("mt-1 line-clamp-3 text-sm", !about && "text-muted-foreground")}>
                {about || "Tell this agent who it is and how to help."}
              </span>
            </button>
            <RowGroup>
              <Row icon={Cpu} label="Model" value={agent.modelId || "Default"} onClick={() => onOpenSection("model")} />
              <Row icon={Wrench} label="Tools" value={toolCount ?? undefined} onClick={() => onOpenSection("tools")} />
              <Row icon={Zap} label="Skills" value={skills.length || undefined} onClick={() => onOpenSection("skills")} />
              <Row icon={Clock} label="Scheduled tasks" onClick={() => onOpenSection("tasks")} />
              {!managed && !local && (
                <Row
                  icon={HeartPulse}
                  label="Heartbeat"
                  value={heartbeat ? (heartbeat.enabled ? `On, ${formatInterval(heartbeat.intervalSec)}` : "Off") : undefined}
                  onClick={() => onOpenSection("heartbeat")}
                />
              )}
              <Row icon={NotebookText} label="Memory" onClick={() => onOpenSection("memory")} />
            </RowGroup>
            <RowGroup>
              <Row icon={Activity} label="Activity" onClick={() => onOpenSection("observability")} />
              <Row icon={BarChart3} label="Usage" onClick={() => onOpenSection("usage")} />
              <Row icon={Wallet} label="Wallet" onClick={() => onOpenSection("wallet")} />
              <Row icon={Server} label="Runtime" value={runtimeLabel} onClick={() => onOpenSection("runtime")} />
            </RowGroup>
          </div>
        )}
        {tab === "files" && <AgentFilesPanel agentId={agent.agentId} onSeeAll={() => onOpenSection("artifacts")} />}
        {tab === "computer" && <AgentComputerCard agentId={agent.agentId} onOpen={() => onOpenSection("computer")} />}
      </div>
    </aside>
  );
}
