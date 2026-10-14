"use client";

import { useEffect, useLayoutEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, FolderClosed } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAgentContext } from "@/context/AgentContext";
import { DashboardSideBar, MobileMenuButton } from "@/components/layout/dashboard-side-bar";
import SessionInterface from "@/components/sessions/session-interface";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { normalizePrincipalId } from "@/lib/principal-id";
import { isPendingSessionId } from "@/lib/start-chat";
import { useProjects } from "@/hooks/use-projects";
import { useSessionView } from "@/hooks/sessions/use-session-view";
import { useToast } from "@/hooks/use-toast";
import { useChatLaunchStore, type LaunchAgent } from "@/stores/chat-launch-store";

// Switch the chat store to this session before paint, so a previous
// conversation never shows for a frame.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function SessionPage() {
  const { sessionId } = useParams() as { sessionId: string };
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={userAddress} />
        <main className="min-h-0 flex min-w-0 flex-1 flex-col overflow-hidden">
          {isPendingSessionId(sessionId) ? (
            <PendingSession pendingId={sessionId} userAddress={userAddress} />
          ) : (
            <ExistingSession sessionId={sessionId} userAddress={userAddress} />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * A chat opened before its session exists. It looks exactly like the chat
 * will (your message, the agent thinking) and moves to the real session as
 * soon as the server has created it.
 */
function PendingSession({ pendingId, userAddress }: { pendingId: string; userAddress: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { activateSession, setInputText } = useAgentContext();
  const start = useChatLaunchStore((state) => state.starts[pendingId]);

  useIsomorphicLayoutEffect(() => {
    activateSession(pendingId);
  }, [pendingId, activateSession]);

  useEffect(() => {
    if (!start) {
      // A reload of a pending link has nothing to wait for.
      router.replace("/new");
      return;
    }
    if (start.sessionId) {
      router.replace(`/sessions/${encodeURIComponent(start.sessionId)}`);
      return;
    }
    if (start.error) {
      setInputText(start.launch.text);
      toast({ title: "Could not start the chat", description: start.error, variant: "destructive" });
      router.replace("/new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(start), start?.sessionId, start?.error]);

  if (!start) return null;
  return (
    <SessionInterface
      agent={{ ...start.agent } as any}
      session={null}
      agentId={start.agent.agentId}
      sessionId=""
      userId={userAddress}
      isLoadingSession
      pendingLaunch={start.launch}
      header={<SessionHeader agent={start.agent} title={null} projectId={start.projectId} sessionId="" userAddress={userAddress} />}
    />
  );
}

function ExistingSession({ sessionId, userAddress }: { sessionId: string; userAddress: string }) {
  const { activateSession } = useAgentContext();
  const { agent, session, loading, ready, launch, clearLaunch, hostActionUrl, title } = useSessionView(sessionId);
  const launchAgent = useChatLaunchStore((state) => state.agents[sessionId]);

  useIsomorphicLayoutEffect(() => {
    activateSession(sessionId);
  }, [sessionId, activateSession]);

  if (ready && !loading && !session) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Session not found
      </div>
    );
  }

  // Until the session loads, a freshly launched chat keeps showing its first
  // turn; an existing chat shows nothing rather than a placeholder.
  const shownAgent: LaunchAgent | null = agent
    ? { agentId: agent.agentId ?? session?.agentId, name: agent.name, avatar: agent.avatar }
    : launchAgent ?? null;
  const agentId = session?.agentId ?? launchAgent?.agentId;
  if (!agentId) return null;
  const settled = ready && !loading && Boolean(session);

  return (
    <SessionInterface
      hostActionUrl={hostActionUrl}
      agent={agent ?? (shownAgent as any)}
      session={session}
      agentId={agentId}
      userId={userAddress}
      sessionId={sessionId}
      isLoadingSession={!settled}
      initialLaunch={settled ? launch : null}
      pendingLaunch={launch}
      onInitialLaunchSent={clearLaunch}
      header={<SessionHeader agent={shownAgent} title={title} projectId={session?.projectId} sessionId={sessionId} userAddress={userAddress} />}
    />
  );
}

function SessionHeader({
  agent,
  title,
  projectId,
  sessionId,
  userAddress,
}: {
  agent: LaunchAgent | null;
  title: string | null;
  projectId?: string | null;
  sessionId: string;
  userAddress: string;
}) {
  const router = useRouter();
  const { projects } = useProjects(Boolean(userAddress));
  const project = projectId ? projects.find((entry) => entry.projectId === projectId) : undefined;
  const agentHref = agent
    ? `/studio/agents/${encodeURIComponent(agent.agentId)}${sessionId ? `?session=${encodeURIComponent(sessionId)}&panel=about` : ""}`
    : null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <MobileMenuButton />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 max-md:hidden"
          onClick={() => router.push(project ? `/projects/${project.projectId}` : "/new")}
          aria-label={project ? `Back to ${project.name}` : "Back to new chat"}
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
        {agent && agentHref && (
          <Link
            href={agentHref}
            className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
            title="Agent details"
          >
            <AgentAvatar name={agent.name} src={agent.avatar} size={24} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-tight">{title ?? agent.name}</span>
              {title && <span className="block truncate text-xs text-muted-foreground">{agent.name}</span>}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
