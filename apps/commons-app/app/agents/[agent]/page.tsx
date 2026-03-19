"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import SessionInterface from "@/components/sessions/session-interface";
import { Loader2 } from "lucide-react";
import { SessionsSideBar } from "@/components/sessions/sessions-side-bar";
import { useAgentContext } from "@/context/AgentContext";

export default function PublicAgentPage() {
  const params = useParams();
  const router = useRouter();
  const { agent: agentId } = params as { agent: string };
  const { messages, setMessages, clearMessages, sessions, setSessions } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const fetchSessions = async () => {
    if (!agentId || !userAddress) return;
    try {
      const res = await fetch(`/api/sessions/list?agentId=${agentId}&initiatorId=${encodeURIComponent(userAddress)}`);
      const data = await res.json();
      setSessions(data?.data || []);
    } catch {
      setSessions([]);
    }
  };

  useEffect(() => {
    async function fetchAgent() {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        const data = await res.json();
        setAgent(res.ok ? (data.data ?? null) : null);
      } catch {
        setAgent(null);
      } finally {
        setLoading(false);
      }
      clearMessages();
      fetchSessions();
    }

    if (agentId) fetchAgent();
  }, [agentId, userAddress, clearMessages]);

  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!agent) return <div>Agent not found</div>;

  return (
    <div className="flex h-screen bg-background">
      <SessionsSideBar
        username={userAddress}
        sessions={sessions}
        agentId={agentId}
      />
      <SessionInterface
        agent={agent}
        session={session}
        agentId={agentId}
        userId={userAddress}
        sessionId={session?.sessionId || ""}
        isRedirecting={isRedirecting}
        onSessionCreated={(newSessionId) => {
          setIsRedirecting(true);
          router.replace(`/agents/${agentId}/${newSessionId}`);
        }}
      />
    </div>
  );
}
