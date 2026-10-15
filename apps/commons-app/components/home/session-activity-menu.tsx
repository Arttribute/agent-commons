"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { RunStatusDot, runStatusLabel } from "@/components/agents/run-status-dot";
import { CreateButton } from "@/components/layout/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compareRuns, isActiveRun, isWaitingRun, type AgentRun } from "@/hooks/use-agent-activity";
import { shortTime } from "@/lib/short-time";
import { cn } from "@/lib/utils";

type MenuAgent = { agentId: string; name: string; avatar?: string | null };
type MenuSession = { sessionId: string; agentId: string; title?: string | null; updatedAt?: string | null; createdAt?: string | null };

const RECENT_LIMIT = 8;

function chatTitle(title?: string | null) {
  return title && !["New chat", "New Session"].includes(title) ? title : "New chat";
}

/**
 * The top-right of /new: the agent you most need to see, with its run state.
 * Opening it lists chats in progress, those waiting for approval, and recent
 * ones. With no chats yet it is the create-agent button.
 */
export function SessionActivityMenu({
  agents,
  sessions,
  runs,
  loading = false,
}: {
  agents: MenuAgent[];
  sessions: MenuSession[];
  runs: Map<string, AgentRun>;
  /** Agents or chats are still loading: hold the button's place. */
  loading?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents]);
  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.sessionId, session])), [sessions]);

  const active = useMemo(() => [...runs.values()].filter(isActiveRun).sort(compareRuns), [runs]);
  const recent = useMemo(() => {
    const activeIds = new Set(active.map((run) => run.sessionId));
    return sessions.filter((session) => !activeIds.has(session.sessionId)).slice(0, RECENT_LIMIT);
  }, [active, sessions]);

  const lead = active[0] ?? null;
  const leadAgent = agentById.get(lead?.agentId ?? sessions[0]?.agentId ?? "");

  if (!leadAgent) {
    if (loading || sessions.length) return <span className="h-9 w-9 shrink-0" aria-hidden="true" />;
    return <CreateButton label="Create new agent" onClick={() => router.push("/studio/agents/create")} />;
  }

  const waitingCount = active.filter(isWaitingRun).length;
  const triggerLabel = waitingCount
    ? `${waitingCount} chat${waitingCount === 1 ? "" : "s"} waiting for you`
    : active.length
      ? `${active.length} chat${active.length === 1 ? "" : "s"} in progress`
      : "Recent chats";

  const row = (session: { sessionId: string; agentId: string; title?: string | null; time?: string | null }, run?: AgentRun) => {
    const agent = agentById.get(session.agentId);
    const status = runStatusLabel(run);
    const waiting = isWaitingRun(run);
    return (
      <li key={session.sessionId}>
        <Link
          href={run?.actionUrl || `/sessions/${encodeURIComponent(session.sessionId)}`}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
        >
          <span className="relative shrink-0">
            <AgentAvatar name={agent?.name} src={agent?.avatar} size={28} />
            <RunStatusDot state={run?.state} size="sm" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-foreground">{chatTitle(session.title)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {agent?.name ?? "Agent"}
              {status && !waiting ? (
                <>
                  {" · "}
                  <span className={run?.state === "running" ? "text-shimmer" : undefined}>{status}</span>
                </>
              ) : null}
            </span>
          </span>
          {waiting ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{status}</span>
          ) : (
            <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(session.time)}</span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${triggerLabel}. Show chats`}
          title={triggerLabel}
          className={cn(
            "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background shadow-card transition-colors hover:bg-muted",
            open && "bg-muted",
          )}
        >
          <AgentAvatar name={leadAgent.name} src={leadAgent.avatar} size={29} bordered={false} />
          <RunStatusDot state={lead?.state} />
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(event) => event.preventDefault()} align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden p-0">
        <div className="max-h-[min(30rem,70dvh)] overflow-y-auto overscroll-contain p-1.5">
          {active.length > 0 && (
            <section>
              <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">In progress</p>
              <ul>
                {active.map((run) => {
                  const session = sessionById.get(run.sessionId);
                  return row({ sessionId: run.sessionId, agentId: run.agentId, title: session?.title ?? run.title, time: run.updatedAt }, run);
                })}
              </ul>
            </section>
          )}
          {recent.length > 0 && (
            <section className={cn(active.length > 0 && "mt-1 border-t border-border/70 pt-1")}>
              <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">Recent</p>
              <ul>
                {recent.map((session) =>
                  row({ ...session, time: session.updatedAt ?? session.createdAt }, runs.get(session.sessionId)),
                )}
              </ul>
            </section>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-3.5 py-2.5 text-xs">
          <Link href="/studio/agents" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            All agents
          </Link>
          <Link href="/studio/agents/create" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            New agent
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
