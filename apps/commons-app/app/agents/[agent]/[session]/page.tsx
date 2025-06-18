"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import SessionInterface from "@/components/sessions/session-interface";
import { SessionsSideBar } from "@/components/sessions/sessions-side-bar";
import { useAgentContext } from "@/context/AgentContext";

export default function AgentSessionPage() {
  const { agent: agentId, session: sessionId } = useParams() as {
    agent: string;
    session: string;
  };

  const { messages, setMessages } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const fetchSessions = async () => {
    const res = await fetch(
      `/api/sessions/list?agentId=${agentId}&initiatorId=${userAddress}`
    );
    const data = await res.json();
    setSessions(data.data || []);
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const agentRes = await fetch(`/api/agents/agent?agentId=${agentId}`);
        const sessionRes = await fetch(
          `/api/sessions/session/full?sessionId=${sessionId}`
        );
        const agentData = await agentRes.json();
        const sessionData = await sessionRes.json();

        setAgent(agentData.data);
        setSession(sessionData.data);
        setMessages(sessionData.data.history || []);
        fetchSessions();
      } catch (err) {
        console.error("Error fetching session:", err);
        setAgent(null);
        setSession(null);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    }

    if (agentId && sessionId) fetchData();
  }, [agentId, sessionId, userAddress]);

  if (loading) return <div>Loading...</div>;
  if (!agent || !session) return <div>Not found</div>;

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <SessionsSideBar username={userAddress} sessions={sessions} />
      <SessionInterface
        agent={agent}
        session={session}
        messages={messages}
        setMessages={setMessages}
        agentId={agentId}
        userId={userAddress}
        sessionId={sessionId}
      />
    </div>
  );
}
