"use client";

import { use, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

import AppBar from "@/components/layout/app-bar";
import AgentTools from "@/components/tools/agent-tools";
import AgentIdentity from "@/components/agents/agent-identity";
import SessionInterface from "@/components/sessions/session-interface";
import { AgentMetrics } from "@/components/agents/agent-metrics";
import { AgentKnowledgebase } from "@/components/agents/agent-knowledge-base";
import SessionsList from "@/components/sessions/sessions-list";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { useAuth } from "@/context/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommonAgent } from "@/types/agent";
import { Skeleton } from "@/components/ui/skeleton";
import { CostDashboard } from "@/components/usage/cost-dashboard";
import { AgentMemoryView } from "@/components/memory/agent-memory-view";
import AgentFinances from "@/components/finances/agent-finances";
import { AgentAutonomy } from "@/components/agents/agent-autonomy";
import { AgentMcpSection } from "@/components/mcp/agent-mcp-section";

function AgentPageSkeleton() {
  return (
    <div className="grid grid-cols-9 gap-0 h-[calc(100vh-48px)]">
      <div className="col-span-2 border-r p-3 space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="col-span-5 p-4 space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-1/2 ml-auto" />
      </div>
      <div className="col-span-2 border-l p-3 space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

export default function AgentStudioPage({
  params,
}: {
  params: Promise<{ agent: string }>;
}) {
  const { agent: agentId } = use(params);
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const [agent, setAgent] = useState<CommonAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentTools, setAgentTools] = useState<any[]>([]);
  const [knowledgebase, setKnowledgebase] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [studioSession, setStudioSession] = useState<any>(null);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);

  // Fetch agent + tools in parallel
  useEffect(() => {
    if (!agentId) return;
    async function load() {
      setLoading(true);
      try {
        const [agentRes, toolsRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`),
          fetch(`/api/agents/${agentId}/tools`),
        ]);
        const agentData = await agentRes.json();
        const toolsData = await toolsRes.json();
        setAgent(agentRes.ok ? (agentData.data as unknown as CommonAgent) : null);
        setAgentTools(toolsData.data || []);
      } catch {
        // leave nulls
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agentId]);

  // Fetch sessions + init studio session
  useEffect(() => {
    if (!agentId || !userAddress) return;
    async function initSessionsAndStudio() {
      try {
        const listRes = await fetch(`/api/sessions/list?agentId=${agentId}&initiatorId=${encodeURIComponent(userAddress)}`);
        const listData = await listRes.json();
        const sessionList = listData?.data || [];
        setSessions(sessionList);

        let session = sessionList[0] ?? null;
        if (!session) {
          const createRes = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, initiator: userAddress }),
          });
          const createData = await createRes.json();
          session = createData.data ?? null;
          if (session) setSessions([session]);
        }
        setStudioSession(session);
      } catch {
        // leave empty
      }
    }
    initSessionsAndStudio();
  }, [agentId, userAddress]);

  if (loading) return (
    <div>
      <AppBar />
      <div className="mt-12"><AgentPageSkeleton /></div>
    </div>
  );

  if (!agent) return (
    <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
      Agent not found
    </div>
  );

  return (
    <div>
      <AppBar />

      <div className="grid grid-cols-9 gap-0 mt-12 h-[calc(100vh-48px)] bg-background">
        {/* ── Left sidebar ── */}
        <div className="col-span-2 border-r border-border overflow-y-auto">
          <div className="flex flex-col gap-2 p-3">
            <AgentIdentity
              agent={agent}
              isOwner={userAddress === agent.owner}
              onUpdate={async (data) => {
                await fetch(`/api/agents/${agentId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                const res = await fetch(`/api/agents/${agentId}`);
                const updated = await res.json();
                setAgent(updated.data as unknown as CommonAgent);
              }}
            />

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setShowCreateTaskDialog(true)}
            >
              <Calendar className="h-3.5 w-3.5" />
              Create Task
            </Button>

            <AgentTools
              agentTools={agentTools}
              setAgentTools={setAgentTools}
              agentId={agentId}
            />

            <AgentKnowledgebase
              knowledgebase={knowledgebase}
              setKnowledgebase={setKnowledgebase}
              agentId={agentId}
            />

            <AgentMcpSection agentId={agentId} />
          </div>
        </div>

        {/* ── Center chat ── */}
        <div className="col-span-5">
          <SessionInterface
            agent={agent}
            session={studioSession}
            agentId={agentId}
            sessionId={studioSession?.sessionId || ""}
            userId={userAddress}
            height="calc(100vh - 140px)"
            onSessionCreated={async (newSessionId) => {
              try {
                const res = await fetch(`/api/sessions/${newSessionId}?full=true`);
                const data = await res.json();
                const newSession = data.data ?? null;
                if (newSession) {
                  setStudioSession(newSession);
                  setSessions((prev) => [newSession, ...prev]);
                }
              } catch {
                // ignore
              }
            }}
          />
        </div>

        {/* ── Right panel ── */}
        <div className="col-span-2 border-l border-border overflow-y-auto">
          <div className="flex flex-col gap-2 p-3">
            <AgentAutonomy
              agentId={agentId}
              isOwner={!!userAddress && agent?.owner?.toLowerCase() === userAddress}
            />
            <AgentMetrics agentId={agentId} />
            <AgentFinances agentId={agentId} />

            <div className="rounded-lg border border-border p-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-1">
                Recent Sessions
              </h3>
              <ScrollArea className="h-64">
                <SessionsList sessions={sessions} />
              </ScrollArea>
            </div>

            <div className="rounded-lg border border-border p-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 px-1">
                Usage & Cost
              </h3>
              <CostDashboard agentId={agentId} />
            </div>

            <div className="rounded-lg border border-border p-3">
              <AgentMemoryView agentId={agentId} />
            </div>
          </div>
        </div>
      </div>

      <CreateTaskDialog
        open={showCreateTaskDialog}
        onClose={() => setShowCreateTaskDialog(false)}
        userAddress={userAddress}
        preSelectedAgentId={agentId}
        onTaskCreated={() => {}}
      />
    </div>
  );
}
