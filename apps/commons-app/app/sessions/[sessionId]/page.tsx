"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, FolderClosed } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DashboardSideBar, MobileMenuButton } from "@/components/layout/dashboard-side-bar";
import SessionInterface from "@/components/sessions/session-interface";
import type { ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { normalizePrincipalId } from "@/lib/principal-id";
import { useProjects } from "@/hooks/use-projects";
import { useSessionView } from "@/hooks/sessions/use-session-view";

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
  const { agent, session, loading, ready, launch, clearLaunch, hostActionUrl, title } = useSessionView(sessionId);

  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { projects } = useProjects(Boolean(userAddress));
  const project = projects.find((entry) => entry.projectId === session?.projectId);

  return (
    <div className="h-app overflow-hidden bg-page">
      <div className="flex h-app flex-col md:flex-row">
        <DashboardSideBar username={userAddress} />
        <main className="min-h-0 flex min-w-0 flex-1 flex-col overflow-hidden">
          {!ready || (!session && loading) ? (
            <SessionPageOpening launch={launch} />
          ) : !session ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Session not found
            </div>
          ) : (
            <SessionInterface
              hostActionUrl={hostActionUrl}
              agent={agent}
              session={session}
              agentId={session.agentId}
              userId={userAddress}
              sessionId={sessionId}
              isLoadingSession={loading}
              initialLaunch={loading ? null : launch}
              onInitialLaunchSent={clearLaunch}
              header={
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
                    {agent && (
                      <Link
                        href={`/studio/agents/${session.agentId}?session=${encodeURIComponent(sessionId)}&panel=about`}
                        className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                        title="Agent details"
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
