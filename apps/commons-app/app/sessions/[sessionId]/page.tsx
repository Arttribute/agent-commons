"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, FolderClosed } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAgentContext } from "@/context/AgentContext";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import SessionInterface from "@/components/sessions/session-interface";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizePrincipalId } from "@/lib/principal-id";
import { normalizeSessionHistory } from "@/lib/session-history";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useChatLaunchStore } from "@/stores/chat-launch-store";
import { useProjects } from "@/hooks/use-projects";
import { SESSIONS_CHANGED } from "@/hooks/sessions/use-user-sessions";

function SessionPageSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="ml-auto h-16 w-2/3" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { sessionId } = useParams() as { sessionId: string };
  const router = useRouter();

  const { setMessages, clearMessages } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"chat" | "trajectory">("chat");
  // A chat opened from a launcher sends its first message here, once.
  const [launch, setLaunch] = useState<ComposerLaunch | null>(() =>
    useChatLaunchStore.getState().peekLaunch(sessionId),
  );

  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { projects } = useProjects(Boolean(userAddress));
  const project = projects.find((entry) => entry.projectId === session?.projectId);

  useEffect(() => {
    if (!sessionId) return;
    const queued = useChatLaunchStore.getState().peekLaunch(sessionId);
    setLaunch(queued);

    async function fetchData() {
      setLoading(true);
      clearMessages();

      try {
        const sessionRes = await desktopApiFetch(`/api/sessions/${sessionId}?full=true`);
        const sessionData = await sessionRes.json();
        const loadedSession = sessionRes.ok ? (sessionData.data ?? null) : null;
        setSession(loadedSession);
        const history = normalizeSessionHistory(loadedSession?.history);
        // Keep the streaming first message if the launch already started it.
        if (history.length) setMessages(history);

        if (loadedSession?.agentId) {
          const agentRes = await desktopApiFetch(`/api/agents/${loadedSession.agentId}`);
          const agentData = await agentRes.json();
          setAgent(agentRes.ok ? (agentData.data ?? null) : null);
        } else {
          setAgent(null);
        }
      } catch (err) {
        console.error("Error fetching session:", err);
        setAgent(null);
        setSession(null);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; title?: string }>).detail;
      if (detail?.sessionId === sessionId && detail.title) setLiveTitle(detail.title);
    };
    window.addEventListener(SESSIONS_CHANGED, onChange);
    return () => window.removeEventListener(SESSIONS_CHANGED, onChange);
  }, [sessionId]);
  const storedTitle = session?.title && !["New chat", "New Session"].includes(session.title) ? session.title : null;
  const title = liveTitle ?? storedTitle;

  return (
    <div className="h-screen overflow-hidden bg-page">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          {!session && loading ? (
            <SessionPageSkeleton />
          ) : !session ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Session not found
            </div>
          ) : (
            <SessionInterface
              agent={agent}
              session={session}
              agentId={session.agentId}
              userId={userAddress}
              sessionId={sessionId}
              isLoadingSession={loading}
              viewMode={viewMode}
              initialLaunch={loading ? null : launch}
              onInitialLaunchSent={() => {
                useChatLaunchStore.getState().clearLaunch(sessionId);
                setLaunch(null);
              }}
              header={
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => router.push(project ? `/projects/${project.projectId}` : "/studio/agents")}
                      aria-label={project ? `Back to ${project.name}` : "Back to agents"}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {project && (
                      <>
                        <Link
                          href={`/projects/${project.projectId}`}
                          className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <FolderClosed className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[12rem] truncate">{project.name}</span>
                        </Link>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      </>
                    )}
                    {agent && (
                      <Link
                        href={`/studio/agents/${session.agentId}`}
                        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                        title="Agent settings"
                      >
                        <AgentAvatar name={agent.name} src={agent.avatar} size={24} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium leading-tight">
                            {title ?? agent.name}
                          </span>
                          {title && (
                            <span className="block truncate text-xs text-muted-foreground">{agent.name}</span>
                          )}
                        </span>
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center rounded-lg bg-muted/60 p-0.5 text-xs">
                    {(["chat", "trajectory"] as const).map((mode) => (
                      <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`rounded-md px-2.5 py-1 capitalize transition-colors ${viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{mode}</button>
                    ))}
                  </div>
                </div>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
