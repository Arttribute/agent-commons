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
import { normalizePrincipalId } from "@/lib/principal-id";
import { normalizeSessionHistory } from "@/lib/session-history";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { useChatLaunchStore } from "@/stores/chat-launch-store";
import { useProjects } from "@/hooks/use-projects";
import { SESSIONS_CHANGED } from "@/hooks/sessions/use-user-sessions";
import { useSessionRunRecovery } from "@/hooks/sessions/use-session-run-recovery";

function SessionPageOpening({ launch }: { launch: ComposerLaunch | null }) {
  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="mx-auto w-full max-w-[46rem] flex-1 px-4 pt-6">
        {launch && <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm whitespace-pre-wrap">
          {launch.text}
          {launch.attachments.map((item) => <div key={item.fileId} className="mt-2 text-xs text-muted-foreground">{item.name}</div>)}
        </div>}
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { sessionId } = useParams() as { sessionId: string };
  const router = useRouter();

  const { activateSession, setSessionHistory, getSessionMessages } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loadedSessionId, setLoadedSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  // A chat opened from a launcher sends its first message here, once.
  const [launch, setLaunch] = useState<ComposerLaunch | null>(() =>
    useChatLaunchStore.getState().peekLaunch(sessionId),
  );
  useSessionRunRecovery(sessionId, loadedSessionId === sessionId && !loading && Boolean(session));

  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { projects } = useProjects(Boolean(userAddress));
  const project = projects.find((entry) => entry.projectId === session?.projectId);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const queued = useChatLaunchStore.getState().peekLaunch(sessionId);
    setLaunch(queued);

    async function fetchData() {
      setLoading(true);
      setSession(null);
      setAgent(null);
      activateSession(sessionId);

      try {
        const sessionRes = await desktopApiFetch(`/api/sessions/${sessionId}?full=true`);
        const sessionData = await sessionRes.json();
        if (cancelled) return;
        const loadedSession = sessionRes.ok ? (sessionData.data ?? null) : null;
        setSession(loadedSession);
        const history = normalizeSessionHistory(loadedSession?.history);
        // Keep the streaming first message if the launch already started it.
        if (history.length || !getSessionMessages(sessionId)?.length) setSessionHistory(sessionId, history);

        if (loadedSession?.agentId) {
          const agentRes = await desktopApiFetch(`/api/agents/${loadedSession.agentId}`);
          const agentData = await agentRes.json();
          if (cancelled) return;
          setAgent(agentRes.ok ? (agentData.data ?? null) : null);
        } else {
          setAgent(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching session:", err);
        setAgent(null);
        setSession(null);
        if (!getSessionMessages(sessionId)?.length) setSessionHistory(sessionId, []);
      } finally {
        if (!cancelled) {
          setLoadedSessionId(sessionId);
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const [liveTitle, setLiveTitle] = useState<string | null>(null);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; title?: string }>).detail;
      if (detail?.sessionId === sessionId && detail.title && detail.title !== "New chat") setLiveTitle(detail.title);
    };
    window.addEventListener(SESSIONS_CHANGED, onChange);
    const unsubscribe = window.agentCommonsLocal?.onEvent((event) => {
      if (event.type !== "state") return;
      const title = event.state.conversations.find((item) => item.id === sessionId)?.title;
      if (title && title !== "New chat") setLiveTitle(title);
    });
    return () => { window.removeEventListener(SESSIONS_CHANGED, onChange); unsubscribe?.(); };
  }, [sessionId]);
  const storedTitle = session?.title && !["New chat", "New Session"].includes(session.title) ? session.title : null;
  const title = liveTitle ?? storedTitle;

  return (
    <div className="h-screen overflow-hidden bg-page">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          {loadedSessionId !== sessionId || (!session && loading) ? (
            <SessionPageOpening launch={launch} />
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
                </div>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
