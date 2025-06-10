"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import SessionInterface from "@/components/sessions/session-interface";
import AgentIdentity from "@/components/agents/agent-identity";
import { Loader2 } from "lucide-react";
import { SessionsSideBar } from "@/components/sessions/sessions-side-bar";
import { supabase } from "@/lib/supabase";

export default function PublicAgentPage() {
  const params = useParams();
  const router = useRouter();
  const { agent: agentId } = params as { agent: string };
  const [agent, setAgent] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingSession, setCreatingSession] = useState(false);

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
    async function fetchAgent() {
      setLoading(true);
      const res = await fetch(`/api/agents/agent?agentId=${agentId}`);
      const json = await res.json();
      setAgent(json.data);
      setLoading(false);
      fetchSessions();
    }
    if (agentId) fetchAgent();
  }, [agentId, userAddress]);

  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!agent) return <div>Agent not found</div>;

  return (
    <div className="flex  h-screen bg-gray-50 dark:bg-gray-900">
      <SessionsSideBar username={userAddress} sessions={sessions} />
      <SessionInterface
        agent={agent}
        session={session}
        messages={messages}
        setMessages={setMessages}
        agentId={agentId}
        userId={userAddress}
        sessionId={session?.sessionId || ""}
        onSessionCreated={async (newSessionId: string) => {
          router.push(`/agents/${agentId}/${newSessionId}`);
        }}
      />
    </div>
  );
}
