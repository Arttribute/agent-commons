"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, Plus, Search, Users, X } from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { RunStatusDot, runStatusLabel } from "@/components/agents/run-status-dot";
import { MobileMenuButton } from "@/components/layout/dashboard-side-bar";
import { PageTitle } from "@/components/layout/page-header";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAgents } from "@/hooks/use-agents";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { compareRuns, isWaitingRun, useSessionRuns, type AgentRun } from "@/hooks/use-agent-activity";
import { shortTime } from "@/lib/short-time";
import { cn } from "@/lib/utils";

type ListSession = { sessionId: string; agentId: string; title?: string | null; updatedAt?: string | null; createdAt?: string | null };

function sessionTime(session?: ListSession | null) {
  return session ? Date.parse(session.updatedAt ?? session.createdAt ?? "") || 0 : 0;
}

function chatTitle(title?: string | null) {
  return title && !["New chat", "New Session"].includes(title) ? title : null;
}

export const headerIconButton =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-muted hover:text-foreground";

/**
 * The left column of the agents chat app: your agents ordered by their latest
 * chat, each with what it is doing now. Search filters in place; the plus
 * creates an agent or a space with several agents.
 */
export function AgentsListPane({
  userAddress,
  selectedAgentId,
  className,
}: {
  userAddress: string;
  selectedAgentId?: string;
  className?: string;
}) {
  const router = useRouter();
  const { agents, loading, error, refresh } = useAgents(userAddress || undefined);
  const { sessions } = useUserSessions(userAddress);
  const runs = useSessionRuns(sessions);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const rows = useMemo(() => {
    const latest = new Map<string, ListSession>();
    for (const session of sessions as ListSession[]) {
      const current = latest.get(session.agentId);
      if (!current || sessionTime(session) > sessionTime(current)) latest.set(session.agentId, session);
    }
    const runByAgent = new Map<string, AgentRun>();
    for (const run of runs.values()) {
      const current = runByAgent.get(run.agentId);
      if (!current || compareRuns(run, current) < 0) runByAgent.set(run.agentId, run);
    }
    const needle = query.trim().toLowerCase();
    return agents
      .map((agent: any) => {
        const last = latest.get(agent.agentId);
        const run = runByAgent.get(agent.agentId);
        const activity = Math.max(sessionTime(last), run ? Date.parse(run.updatedAt) || 0 : 0);
        return { agent, last, run, activity };
      })
      .filter(({ agent, last }) =>
        !needle ||
        agent.name?.toLowerCase().includes(needle) ||
        chatTitle(last?.title)?.toLowerCase().includes(needle),
      )
      .sort((left, right) =>
        right.activity - left.activity ||
        Number(Boolean(right.agent.isDefault)) - Number(Boolean(left.agent.isDefault)) ||
        String(left.agent.name).localeCompare(String(right.agent.name)),
      );
  }, [agents, sessions, runs, query]);

  return (
    <aside className={cn("flex h-full min-h-0 flex-col bg-white", className)} aria-label="Agents">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
        <MobileMenuButton />
        {searching ? (
          <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-muted px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setQuery("");
                  setSearching(false);
                }
              }}
              placeholder="Search agents and chats"
              aria-label="Search agents and chats"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>
        ) : (
          <div className="min-w-0 flex-1 px-1">
            <PageTitle title="Agents" />
          </div>
        )}
        <button
          type="button"
          aria-label={searching ? "Close search" : "Search agents"}
          title={searching ? "Close search" : "Search"}
          className={headerIconButton}
          onClick={() => {
            setQuery("");
            setSearching((open) => !open);
          }}
        >
          {searching ? <X className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="New" title="New" className={headerIconButton}>
              <Plus className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => router.push("/studio/agents/create")}>
              <Bot className="mr-2 h-4 w-4" strokeWidth={1.75} />
              New agent
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/spaces/create")}>
              <Users className="mr-2 h-4 w-4" strokeWidth={1.75} />
              New space
              <span className="ml-auto text-xs text-muted-foreground">Group</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {loading && !agents.length ? (
          <div className="space-y-1 px-1 pt-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center gap-2.5 px-2 py-1.5" style={{ opacity: 1 - index * 0.15 }}>
                <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <span className="block h-3 w-2/3 animate-pulse rounded bg-muted" />
                </span>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <AlertCircle className="h-5 w-5 text-red-500" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-medium">Couldn&rsquo;t load your agents</p>
            <button type="button" onClick={() => void refresh()} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
              Try again
            </button>
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <Bot className="h-6 w-6 text-muted-foreground/60" strokeWidth={1.75} />
            <p className="mt-3 text-sm font-medium">{query ? "No matches" : "No agents yet"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query ? "Try another name or chat title." : "Create an agent to start chatting."}
            </p>
            {!query && (
              <Link href="/studio/agents/create" className="mt-4 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800">
                Create agent
              </Link>
            )}
          </div>
        ) : (
          <ul className="space-y-px">
            {rows.map(({ agent, last, run }) => {
              const selected = agent.agentId === selectedAgentId;
              const status = runStatusLabel(run);
              const waiting = isWaitingRun(run);
              const preview = status && run?.state !== "failed"
                ? status
                : chatTitle(last?.title) ?? agent.description ?? (last ? "New chat" : "No chats yet");
              return (
                <li key={agent.agentId}>
                  <Link
                    href={`/studio/agents/${encodeURIComponent(agent.agentId)}`}
                    aria-current={selected ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                      selected ? "bg-accent" : "hover:bg-muted/70",
                    )}
                  >
                    <span className="relative shrink-0">
                      <AgentAvatar name={agent.name} src={agent.avatar} size={28} />
                      <RunStatusDot state={run?.state} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-foreground">{agent.name}</span>
                        {last && <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(last.updatedAt ?? last.createdAt)}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-xs leading-4",
                            waiting ? "text-amber-700" : "text-muted-foreground",
                            run?.state === "running" && "text-shimmer",
                          )}
                        >
                          {preview}
                        </span>
                        {waiting && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
