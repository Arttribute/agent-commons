"use client";

import { useAuth } from "@/context/AuthContext";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import { useAgents } from "@/hooks/use-agents";
import { Loader2 } from "lucide-react";
import { normalizePrincipalId } from "@/lib/principal-id";

export default function AgentsPage() {
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const { agents, loading } = useAgents(userAddress || undefined);

  return (
    <div className="h-screen overflow-hidden">
      <div className="h-screen">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AgentsShowcase agents={agents} />
        )}
      </div>
    </div>
  );
}
