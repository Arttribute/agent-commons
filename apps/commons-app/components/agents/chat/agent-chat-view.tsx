"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, History, PanelRight, SquarePen } from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { RunStatusDot, runStatusLabel } from "@/components/agents/run-status-dot";
import { ProjectChip } from "@/components/projects/project-chip";
import SessionInterface from "@/components/sessions/session-interface";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentContext } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useSessionView } from "@/hooks/sessions/use-session-view";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { compareRuns, isWaitingRun, useSessionRuns, type AgentRun } from "@/hooks/use-agent-activity";
import { useProjects } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";
import { localAgentToCommon } from "@/lib/local-agent-adapter";
import { normalizePrincipalId } from "@/lib/principal-id";
import { shortTime } from "@/lib/short-time";
import { createChat } from "@/lib/start-chat";
import { cn } from "@/lib/utils";
import type { CommonAgent } from "@/types/agent";
import { AgentDetailsPanel, type DetailsTab } from "./agent-details-panel";
import { AgentSectionScreen, parseChatSection, type ChatSection } from "./agent-chat-sections";
import { headerIconButton } from "./agents-list-pane";

// Switch the chat store before paint so another chat never shows for a frame.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type AgentSession = { sessionId: string; agentId: string; title?: string | null; updatedAt?: string | null; createdAt?: string | null; projectId?: string | null };

const DETAILS_TABS: DetailsTab[] = ["about", "files", "computer"];

function chatTitle(title?: string | null) {
  return title && !["New chat", "New Session"].includes(title) ? title : null;
}

function sessionTime(session: AgentSession) {
  return Date.parse(session.updatedAt ?? session.createdAt ?? "") || 0;
}

/**
 * One agent in the chat app: its latest conversation (or a new one), a slim
 * header, and the agent's info beside it on demand. Settings open as their
 * own screens from the info panel.
 *
 * URL: `?session=` picks a chat, `?new=1` starts one, `?panel=` opens agent
 * info on a tab, `?section=` opens a setting.
 */
export function AgentChatView({ agentId }: { agentId: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? `/studio/agents/${agentId}`;
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { authState } = useAuth();
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { activateSession } = useAgentContext();

  const parsedSection = parseChatSection(searchParams.get("section"));
  const section = parsedSection && parsedSection !== "chat" && parsedSection !== "new" ? parsedSection : null;
  const sessionParam = searchParams.get("session");
  const isNew = !sessionParam && (searchParams.get("new") === "1" || parsedSection === "new");
  const panelParam = searchParams.get("panel") as DetailsTab | null;
  const panel = panelParam && DETAILS_TABS.includes(panelParam) ? panelParam : null;

  const setParams = useCallback(
    (update: Record<string, string | null>, method: "push" | "replace" = "replace") => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(update)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router[method](query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // The agent and its tools.
  const [agent, setAgent] = useState<CommonAgent | null>(null);
  const [agentLoading, setAgentLoading] = useState(true);
  const [agentTools, setAgentTools] = useState<any[]>([]);
  const [toolsLoaded, setToolsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAgentLoading(true);
      try {
        if (local) {
          const state = await window.agentCommonsLocal?.getState();
          const localAgent = state?.agents.find((candidate) => candidate.id === agentId);
          if (!cancelled) setAgent(state && localAgent ? localAgentToCommon(localAgent, state) : null);
          return;
        }
        const [agentRes, toolsRes] = await Promise.all([
          fetch(`/api/agents/${encodeURIComponent(agentId)}`),
          fetch(`/api/agents/${encodeURIComponent(agentId)}/tools`),
        ]);
        const agentData = await agentRes.json().catch(() => null);
        const toolsData = await toolsRes.json().catch(() => null);
        if (cancelled) return;
        setAgent(agentRes.ok ? ((agentData?.data ?? null) as CommonAgent | null) : null);
        setAgentTools(Array.isArray(toolsData?.data) ? toolsData.data : []);
        setToolsLoaded(toolsRes.ok);
      } catch {
        if (!cancelled) setAgent(null);
      } finally {
        if (!cancelled) setAgentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, local]);

  const isOwner = Boolean(
    userAddress && agent && ((agent as any).ownerUserId === userAddress || agent.owner === userAddress || local),
  );

  // This agent's chats, newest first, and what each is doing.
  const { sessions, isLoading: sessionsLoading } = useUserSessions(userAddress);
  const agentSessions = useMemo(
    () => (sessions as AgentSession[]).filter((session) => session.agentId === agentId).sort((a, b) => sessionTime(b) - sessionTime(a)),
    [sessions, agentId],
  );
  const runs = useSessionRuns(sessions);

  // Opening an agent shows its latest chat. Settle on it once, so a chat
  // started elsewhere doesn't swap the conversation out from under you.
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (latestSessionId !== null || sessionsLoading || !userAddress) return;
    setLatestSessionId(agentSessions[0]?.sessionId ?? "");
  }, [agentSessions, latestSessionId, sessionsLoading, userAddress]);
  const activeSessionId = sessionParam ?? (isNew ? "" : latestSessionId ?? "");
  const resolving = !sessionParam && !isNew && latestSessionId === null;

  const activeRun = activeSessionId ? runs.get(activeSessionId) : undefined;

  const openSection = (next: ChatSection) => setParams({ section: next }, "push");
  const closeSection = () => setParams({ section: null, panel: panel ?? "about" });
  const togglePanel = () => setParams({ panel: panel ? null : "about" });
  const startNewChat = () => setParams({ new: "1", session: null, section: null }, "push");
  const openChat = (sessionId: string) => setParams({ session: sessionId, new: null, section: null }, "push");

  if (agentLoading && !agent) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center gap-3 px-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-[46rem] px-4 pb-4">
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
      </div>
    );
  }
  if (!agent) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">Agent not found</p>
        <Link href="/studio/agents" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back to agents
        </Link>
      </div>
    );
  }

  if (section) {
    return (
      <AgentSectionScreen
        section={section}
        agent={agent}
        isOwner={isOwner}
        userAddress={userAddress}
        agentTools={agentTools}
        setAgentTools={setAgentTools}
        onAgentUpdated={setAgent}
        onOpenSection={openSection}
        onBack={closeSection}
      />
    );
  }

  const header = (title: string | null) => (
    <AgentChatHeader
      agent={agent}
      run={activeRun}
      title={title}
      panelOpen={Boolean(panel)}
      sessions={agentSessions}
      runs={runs}
      activeSessionId={activeSessionId}
      onTogglePanel={togglePanel}
      onNewChat={startNewChat}
      onOpenChat={openChat}
    />
  );

  return (
    <div className="relative flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {resolving ? (
          <div className="flex h-full flex-col">
            {header(null)}
            <div className="flex-1" />
          </div>
        ) : activeSessionId ? (
          <AgentSessionPane key={activeSessionId} sessionId={activeSessionId} agent={agent} userAddress={userAddress} header={header} />
        ) : (
          <NewAgentChat
            key={`new:${agentId}`}
            agent={agent}
            userAddress={userAddress}
            header={header(null)}
            onActivate={() => activateSession("")}
            onCreated={(sessionId) => {
              setLatestSessionId(sessionId);
              setParams({ session: sessionId, new: null });
            }}
            onError={(message) => toast({ title: "Could not start the chat", description: message, variant: "destructive" })}
          />
        )}
      </div>
      {panel && (
        <>
          {/* Tablets and phones: the info panel slides over the chat. */}
          <button
            type="button"
            aria-label="Close agent info"
            onClick={togglePanel}
            className="fixed inset-0 z-[55] bg-black/20 lg:hidden"
          />
          <AgentDetailsPanel
            agent={agent}
            isOwner={isOwner}
            toolCount={toolsLoaded ? agentTools.length : null}
            tab={panel}
            onTab={(tab) => setParams({ panel: tab })}
            onOpenSection={openSection}
            onClose={togglePanel}
            onAgentUpdated={setAgent}
            className="max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-[60] max-lg:h-app max-lg:w-full max-lg:pt-[env(safe-area-inset-top)] max-lg:shadow-floating sm:max-lg:w-[380px] lg:w-[340px] lg:shrink-0 lg:border-l lg:border-border xl:w-[360px]"
          />
        </>
      )}
    </div>
  );
}

function AgentChatHeader({
  agent,
  run,
  title,
  panelOpen,
  sessions,
  runs,
  activeSessionId,
  onTogglePanel,
  onNewChat,
  onOpenChat,
}: {
  agent: CommonAgent;
  run?: AgentRun;
  title: string | null;
  panelOpen: boolean;
  sessions: AgentSession[];
  runs: Map<string, AgentRun>;
  activeSessionId: string;
  onTogglePanel: () => void;
  onNewChat: () => void;
  onOpenChat: (sessionId: string) => void;
}) {
  const status = runStatusLabel(run);
  const subtitle = status ?? title ?? (activeSessionId ? "Chat" : "New chat");
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Link href="/studio/agents" aria-label="Back to agents" className={cn(headerIconButton, "md:hidden")}>
        <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </Link>
      <button
        type="button"
        onClick={onTogglePanel}
        aria-label={`${agent.name} info`}
        aria-expanded={panelOpen}
        className="flex min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-muted"
      >
        <span className="relative shrink-0">
          <AgentAvatar name={agent.name} src={agent.avatar} size={34} />
          <RunStatusDot state={run?.state} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight">{agent.name}</span>
          <span
            className={cn(
              "block truncate text-xs leading-tight",
              isWaitingRun(run) ? "text-amber-700" : "text-muted-foreground",
              run?.state === "running" && "text-shimmer",
            )}
          >
            {subtitle}
          </span>
        </span>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onNewChat} aria-label="New chat" title="New chat" className={headerIconButton}>
          <SquarePen className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <ChatHistory sessions={sessions} runs={runs} activeSessionId={activeSessionId} onOpenChat={onOpenChat} onNewChat={onNewChat} />
        <button
          type="button"
          onClick={onTogglePanel}
          aria-label={panelOpen ? "Hide agent info" : "Show agent info"}
          title={panelOpen ? "Hide agent info" : "Agent info"}
          className={cn(headerIconButton, "max-sm:hidden", panelOpen && "bg-muted text-foreground")}
        >
          <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function ChatHistory({
  sessions,
  runs,
  activeSessionId,
  onOpenChat,
  onNewChat,
}: {
  sessions: AgentSession[];
  runs: Map<string, AgentRun>;
  activeSessionId: string;
  onOpenChat: (sessionId: string) => void;
  onNewChat: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ordered = useMemo(() => {
    const active = sessions.filter((session) => runs.get(session.sessionId)).sort((a, b) => compareRuns(runs.get(a.sessionId)!, runs.get(b.sessionId)!));
    const rest = sessions.filter((session) => !runs.get(session.sessionId));
    return [...active, ...rest].slice(0, 50);
  }, [sessions, runs]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Chat history" title="Chats" className={cn(headerIconButton, open && "bg-muted text-foreground")}>
          <History className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent onOpenAutoFocus={(event) => event.preventDefault()} align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <span className="text-sm font-medium">Chats</span>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onNewChat();
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            New chat
          </button>
        </div>
        <ul className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain p-1.5">
          {!ordered.length && <li className="px-2 py-6 text-center text-xs text-muted-foreground">No chats yet</li>}
          {ordered.map((session) => {
            const run = runs.get(session.sessionId);
            const status = runStatusLabel(run);
            return (
              <li key={session.sessionId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onOpenChat(session.sessionId);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted",
                    session.sessionId === activeSessionId && "bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{chatTitle(session.title) ?? "New chat"}</span>
                  {status ? (
                    <span className={cn("shrink-0 text-[11px]", isWaitingRun(run) ? "text-amber-700" : "text-muted-foreground", run?.state === "running" && "text-shimmer")}>{status}</span>
                  ) : (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{shortTime(session.updatedAt ?? session.createdAt)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** An existing chat, loaded and resumed the same way as the session page. */
function AgentSessionPane({
  sessionId,
  agent,
  userAddress,
  header,
}: {
  sessionId: string;
  agent: CommonAgent;
  userAddress: string;
  header: (title: string | null) => React.ReactNode;
}) {
  const { session, loading, ready, launch, clearLaunch, hostActionUrl, title } = useSessionView(sessionId, { loadAgent: false });
  const { activateSession } = useAgentContext();
  useIsomorphicLayoutEffect(() => {
    activateSession(sessionId);
  }, [sessionId, activateSession]);

  if (ready && !loading && !session) {
    return (
      <div className="flex h-full flex-col">
        {header(null)}
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">This chat could not be found.</div>
      </div>
    );
  }

  return (
    <SessionInterface
      hostActionUrl={hostActionUrl}
      agent={agent}
      session={session}
      agentId={agent.agentId}
      sessionId={sessionId}
      userId={userAddress}
      isLoadingSession={!ready || loading}
      initialLaunch={ready && !loading ? launch : null}
      pendingLaunch={launch}
      showResponseTimes
      onInitialLaunchSent={clearLaunch}
      composerVariant="compact"
      composerPlaceholder={`Message ${agent.name}`}
      header={header(title)}
    />
  );
}

/** A fresh chat. The first message creates the session and stays in this view. */
function NewAgentChat({
  agent,
  userAddress,
  header,
  onActivate,
  onCreated,
  onError,
}: {
  agent: CommonAgent;
  userAddress: string;
  header: React.ReactNode;
  onActivate: () => void;
  onCreated: (sessionId: string) => void;
  onError: (message?: string) => void;
}) {
  const { projects } = useProjects(Boolean(userAddress));
  const { setInputText } = useAgentContext();
  const [projectId, setProjectId] = useState<string | null>(null);
  // The message being sent, shown as the first turn while the session is made.
  const [sending, setSending] = useState<ComposerLaunch | null>(null);

  useIsomorphicLayoutEffect(() => {
    onActivate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launch = async (value: ComposerLaunch) => {
    if (sending) return;
    setSending(value);
    try {
      onCreated(await createChat({ agentId: agent.agentId, projectId: projectId ?? undefined, launch: value }));
    } catch (cause) {
      setInputText(value.text);
      onError(cause instanceof Error ? cause.message : undefined);
      setSending(null);
    }
  };

  return (
    <SessionInterface
      agent={agent}
      session={null}
      agentId={agent.agentId}
      sessionId=""
      userId={userAddress}
      onLaunch={(value) => void launch(value)}
      isLoadingSession={Boolean(sending)}
      pendingLaunch={sending}
      composerVariant="compact"
      composerPlaceholder={`Message ${agent.name}`}
      composerAccessory={
        projects.length > 0 && !sending ? (
          <ProjectChip
            variant="quiet"
            projects={projects.map(({ projectId: id, name }) => ({ projectId: id, name }))}
            projectId={projectId}
            onChange={setProjectId}
          />
        ) : undefined
      }
      header={header}
    />
  );
}
