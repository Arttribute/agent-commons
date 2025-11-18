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

  const { messages, setMessages, sessions, setSessions } = useAgentContext();

  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const fetchSessions = async () => {
    if (!agentId || !userAddress) return;
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

        // Only load messages from DB if context is empty (preserves streamed messages during navigation)
        if (messages.length === 0) {
          setMessages(sessionData.data.history || []);
        }
        // Only fetch sessions if not already loaded (prevents sidebar flicker on navigation)
        if (sessions.length === 0) {
          fetchSessions();
        }
      } catch (err) {
        console.error("Error fetching session:", err);
        setAgent(null);
        setSession(null);
        if (messages.length === 0) {
          setMessages([]);
        }
      } finally {
        setLoading(false);
      }
    }

    if (agentId && sessionId) fetchData();
  }, [agentId, sessionId, userAddress]);

  // Show loading only if we don't have messages (fresh page load vs navigation with streamed content)
  if (loading && messages.length === 0) return <div>Loading...</div>;
  // Only show not found if not loading and data is missing
  if (!loading && (!agent || !session)) return <div>Not found</div>;

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
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
        sessionId={sessionId}
        isLoadingSession={loading}
      />
    </div>
  );
}
