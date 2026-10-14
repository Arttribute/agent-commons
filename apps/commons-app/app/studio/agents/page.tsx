"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAgents } from "@/hooks/use-agents";
import { normalizePrincipalId } from "@/lib/principal-id";

/**
 * Opening Agents goes straight to Commons Copilot: its latest chat, or a new
 * one if you haven't chatted yet. On phones the agent list is this screen, so
 * it stays put there.
 */
export default function AgentsPage() {
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents, loading } = useAgents(userAddress || undefined);

  useEffect(() => {
    if (loading || !agents.length) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const copilot =
      agents.find((agent: any) => agent.isDefault) ??
      agents.find((agent) => agent.name === "Commons Copilot") ??
      agents[0];
    router.replace(`/studio/agents/${encodeURIComponent(copilot.agentId)}`);
  }, [agents, loading, router]);

  return null;
}
