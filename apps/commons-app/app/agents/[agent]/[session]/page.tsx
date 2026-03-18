"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import SessionInterface from "@/components/sessions/session-interface";
import { SessionsSideBar } from "@/components/sessions/sessions-side-bar";
import { useAgentContext } from "@/context/AgentContext";
import { Skeleton } from "@/components/ui/skeleton";
import { commons } from "@/lib/commons";

function SessionPageSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      <div className="w-[260px] border-r flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-9 w-full" />
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-full opacity-60" />
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-4 p-6 max-w-2xl mx-auto w-full">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-2/3 ml-auto" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export default function AgentSessionPage() {
  const { agent: agentId, session: sessionId } = useParams() as {
    agent: string;
    session: string;
  };

  const { messages, setMessages, clearMessages, sessions, setSessions } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const lastAgentIdRef = useRef<string>("");

  const fetchSessions = async (id: string, address: string) => {
    if (!id || !address) return;
    try {
      const res = await commons.sessions.list(id, address);
      setSessions(res.data || []);
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    if (!agentId || !sessionId) return;

    async function fetchData() {
      setLoading(true);
      clearMessages();

      try {
        const [agentRes, sessionRes] = await Promise.all([
          commons.agents.get(agentId),
          commons.sessions.getFull(sessionId),
        ]);

        setAgent(agentRes.data);
        setSession(sessionRes.data);
        setMessages(sessionRes.data?.history || []);

        if (lastAgentIdRef.current !== agentId && userAddress) {
          lastAgentIdRef.current = agentId;
          fetchSessions(agentId, userAddress);
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
  }, [agentId, sessionId]);

  // Reload sessions when userAddress becomes available (wallet connect delay)
  useEffect(() => {
    if (userAddress && agentId && lastAgentIdRef.current !== agentId) {
      lastAgentIdRef.current = agentId;
      fetchSessions(agentId, userAddress);
    }
  }, [userAddress, agentId]);

  if (loading && messages.length === 0) return <SessionPageSkeleton />;
  if (!loading && (!agent || !session)) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
        Session not found
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <SessionsSideBar
        username={userAddress}
        sessions={sessions}
        agentId={agentId}
        currentSessionId={sessionId}
      />
      <SessionInterface
        agent={agent}
        session={session}
        agentId={agentId}
        userId={userAddress}
        sessionId={sessionId}
        isLoadingSession={loading}
      />
    </div>
  );
}
