"use client";

import { useAuth } from "@/context/AuthContext";
import AppBar from "@/components/layout/app-bar";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import { useAgents } from "@/hooks/use-agents";
import { Loader2 } from "lucide-react";

export default function AgentsPage() {
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";
  const { agents, loading } = useAgents(userAddress || undefined);

  return (
    <div>
      <AppBar />
      <div className="mt-12 h-[calc(100vh-48px)]">
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
