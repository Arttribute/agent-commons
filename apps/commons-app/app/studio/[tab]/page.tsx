"use client";

import { useParams, usePathname } from "next/navigation";
import type { NextPage } from "next";
import { useMemo, useState, useCallback, useRef } from "react";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import { StudioAgentLauncher } from "@/components/studio/agent-launcher";
import { ToolsManagementView } from "@/components/tools/management/tools-management-view";
import { WorkflowsListView } from "@/components/workflows/workflows-list-view";
import { CreateWorkflowDialog } from "@/components/workflows/create-workflow-dialog";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import { SkillsMarketplaceView } from "@/components/skills/skills-marketplace-view";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAgents } from "@/hooks/use-agents";
import { normalizePrincipalId } from "@/lib/principal-id";

const StudioPage: NextPage = () => {
  const { tab } = useParams() as { tab: string };
  const pathname = usePathname();
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  const activeTab = (tab as string) || pathname?.split("/")[2] || "agents";

  const [showCreateWorkflowDialog, setShowCreateWorkflowDialog] = useState(false);
  const skillCreateRef = useRef<(() => void) | null>(null);
  const registerSkillCreate = useCallback((fn: () => void) => { skillCreateRef.current = fn; }, []);
  const taskCreateRef = useRef<(() => void) | null>(null);
  const registerTaskCreate = useCallback((fn: () => void) => { taskCreateRef.current = fn; }, []);
  // The launcher's footprint, so the floating agents can keep clear of it.
  const composerRef = useRef<HTMLDivElement>(null);

  const { agents, loading: loadingAgents } = useAgents(
    activeTab === "agents" ? userAddress : undefined
  );

  const mainContent = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return (
          <div className="p-4 sm:p-6">
            <ToolsManagementView userAddress={userAddress} />
          </div>
        );
      case "tasks":
        return (
          <div className="h-full">
            <TaskManagementView userAddress={userAddress} onRegisterCreate={registerTaskCreate} />
          </div>
        );
      case "workflows":
        return (
          <div className="p-4 sm:p-6">
            <WorkflowsListView userAddress={userAddress} />
          </div>
        );
      case "skills":
        return (
          <div className="p-4 sm:p-6">
            <SkillsMarketplaceView userAddress={userAddress} onRegisterCreate={registerSkillCreate} />
          </div>
        );
      // Only the real /studio/agents route mounts the launcher — it depends on
      // the AgentProvider from that route's layout. The default fallback (for
      // unknown /studio/<x> segments served without that provider) renders just
      // the plain showcase.
      case "agents":
        return (
          <div className="p-4 sm:p-6">
            <div className="relative h-[calc(100vh-170px)]">
              {loadingAgents ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : agents.length === 0 ? (
                <AgentsShowcase agents={agents} />
              ) : (
                <>
                  {/* Rendered before the showcase so composerRef is attached by
                      the time the showcase measures it to route avatars clear.
                      z-index (not DOM order) keeps the composer above them. */}
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
                    <div ref={composerRef} className="pointer-events-auto w-full max-w-2xl">
                      <div className="mb-3 text-center">
                        <h2 className="text-lg font-semibold tracking-tight">
                          Start a session
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Message an agent to spin up a new session instantly.
                        </p>
                      </div>
                      <StudioAgentLauncher
                        agents={agents.map((a) => ({
                          agentId: a.agentId,
                          name: a.name,
                          avatar: (a as any).avatar,
                          modelId: (a as any).modelId,
                        }))}
                        userAddress={userAddress}
                      />
                    </div>
                  </div>
                  <AgentsShowcase agents={agents} avoidRef={composerRef} />
                </>
              )}
            </div>
          </div>
        );
      default:
        return (
          <div className="p-4 sm:p-6">
            <div className="h-[calc(100vh-170px)]">
              {loadingAgents ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <AgentsShowcase agents={agents} />
              )}
            </div>
          </div>
        );
    }
  }, [activeTab, loadingAgents, agents, userAddress, registerSkillCreate, registerTaskCreate]);

  const createLabel = useMemo(() => {
    switch (activeTab) {
      case "tools":     return "Create Tool";
      case "tasks":     return "Create Task";
      case "workflows": return "Create Workflow";
      case "skills":    return "Create Skill";
      default:          return "Create Agent";
    }
  }, [activeTab]);

  const pageCopy = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return {
          title: "Tools",
          description: "Create and manage your tools and API integrations.",
        };
      case "tasks":
        return {
          title: "Tasks",
          description: "Plan, filter, and run agent work from one focused queue.",
        };
      case "workflows":
        return {
          title: "Workflows",
          description: "Build and run multi-step workflows with your tools.",
        };
      case "skills":
        return {
          title: "Skills",
          description: "Browse platform skills or create modular capabilities for your agents.",
        };
      case "agents":
      default:
        return {
          title: "Agents",
          description: "Manage your agents and open an agent workspace.",
        };
    }
  }, [activeTab]);

  const handleCreateClick = () => {
    if (activeTab === "workflows") {
      setShowCreateWorkflowDialog(true);
    } else if (activeTab === "tasks") {
      taskCreateRef.current?.();
    } else if (activeTab === "skills") {
      skillCreateRef.current?.();
    } else if (activeTab === "tools") {
      router.push("/tools/create");
    } else {
      router.push("/agents/create");
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-4 border-b border-border/70 bg-background px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{pageCopy.title}</h1>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {pageCopy.description}
          </p>
        </div>
        <Button size="sm" onClick={handleCreateClick}>
          {createLabel}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{mainContent}</div>

      <CreateWorkflowDialog
        open={showCreateWorkflowDialog}
        onClose={() => setShowCreateWorkflowDialog(false)}
        userAddress={userAddress}
      />
    </div>
  );
};

export default StudioPage;
