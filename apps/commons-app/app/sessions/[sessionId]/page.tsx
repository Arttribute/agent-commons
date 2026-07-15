"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAgentContext } from "@/context/AgentContext";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import SessionInterface from "@/components/sessions/session-interface";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizePrincipalId } from "@/lib/principal-id";
import { normalizeSessionHistory } from "@/lib/session-history";

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
        <Skeleton className="h-16 w-2/3 ml-auto" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export default function SessionPage() {
  const { sessionId } = useParams() as { sessionId: string };
  const router = useRouter();

  const { messages, setMessages, clearMessages } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  useEffect(() => {
    if (!sessionId) return;

    async function fetchData() {
      setLoading(true);
      clearMessages();

      try {
        const sessionRes = await fetch(`/api/sessions/${sessionId}?full=true`);
        const sessionData = await sessionRes.json();
        const loadedSession = sessionRes.ok ? (sessionData.data ?? null) : null;
        setSession(loadedSession);
        setMessages(normalizeSessionHistory(loadedSession?.history));

        if (loadedSession?.agentId) {
          const agentRes = await fetch(`/api/agents/${loadedSession.agentId}`);
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

  return (
    <div className="h-screen overflow-hidden bg-slate-50">
      <div className="flex h-screen">
        <DashboardSideBar username={userAddress} />
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          {loading && messages.length === 0 ? (
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
              header={
                <div className="flex min-w-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => router.push("/studio/agents")}
                    aria-label="Back to agents"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  {agent && (
                    <Link
                      href={`/studio/agents/${session.agentId}`}
                      className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <AgentAvatar
                        name={agent.name}
                        src={agent.avatar}
                        size={28}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium leading-tight">
                          {agent.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {agent.modelId || session.title || "Session"}
                        </span>
                      </span>
                    </Link>
                  )}
                </div>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
