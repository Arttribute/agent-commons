"use client";
import SessionInterface from "@/components/sessions/session-interface";
import AppBar from "@/components/layout/app-bar";
import { SessionsSideBar } from "@/components/sessions/sessions-side-bar";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

export default function AgentSessionPage() {
  const params = useParams();
  const { agent: agentId, session: sessionId } = params as {
    agent: string;
    session: string;
  };
  const [agent, setAgent] = useState(null);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<any[]>([]);

  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const fetchSessions = async () => {
    const userSessions = await fetch(
      `/api/sessions/list?agentId=${agentId}&initiatorId=${userAddress}`
    );
    const userSessionsData = await userSessions.json();
    if (userSessionsData.data) {
      console.log("User sessions data", userSessionsData.data);
      setSessions(userSessionsData.data);
    }
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
        // handle error
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
