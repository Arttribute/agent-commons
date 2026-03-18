"use client";

import { useParams } from "next/navigation";
import type { NextPage } from "next";
import { useMemo, useState, useCallback, useRef } from "react";
import AppBar from "@/components/layout/app-bar";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import { ToolsManagementView } from "@/components/tools/management/tools-management-view";
import { WorkflowsListView } from "@/components/workflows/workflows-list-view";
import { CreateWorkflowDialog } from "@/components/workflows/create-workflow-dialog";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { SkillsMarketplaceView } from "@/components/skills/skills-marketplace-view";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DashboardSideBar } from "@/components/layout/dashboard-side-bar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAgents } from "@/hooks/use-agents";

const StudioPage: NextPage = () => {
  const { tab } = useParams() as { tab: string };
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = authState.walletAddress?.toLowerCase() || "";

  const activeTab = (tab as string) || "agents";

  const [showCreateWorkflowDialog, setShowCreateWorkflowDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const skillCreateRef = useRef<(() => void) | null>(null);
  const registerSkillCreate = useCallback((fn: () => void) => { skillCreateRef.current = fn; }, []);

  const { agents, loading: loadingAgents } = useAgents(
    activeTab === "agents" ? userAddress : undefined
  );

  const mainContent = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-0.5">Tools</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Create and manage your tools and API integrations
            </p>
            <ToolsManagementView userAddress={userAddress} />
          </div>
        );
      case "tasks":
        return (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-0.5">Tasks</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Schedule and manage tasks for your agents
            </p>
            <TaskManagementView userAddress={userAddress} />
          </div>
        );
      case "workflows":
        return (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-0.5">Workflows</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Build and run multi-step workflows with your tools
            </p>
            <WorkflowsListView userAddress={userAddress} />
          </div>
        );
      case "skills":
        return (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-0.5">Skills</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Modular capabilities your agents can invoke — browse platform skills or create your own
            </p>
            <SkillsMarketplaceView userAddress={userAddress} onRegisterCreate={registerSkillCreate} />
          </div>
        );
      case "agents":
      default:
        return (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-0.5">My Agents</h2>
            <p className="text-muted-foreground text-sm mb-4">Manage your agents</p>
            <div className="h-[64vh]">
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
  }, [activeTab, loadingAgents, agents, userAddress]);

  const createLabel = useMemo(() => {
    switch (activeTab) {
      case "tools":     return "Create Tool";
      case "tasks":     return "Create Task";
      case "workflows": return "Create Workflow";
      case "skills":    return "Create Skill";
      default:          return "Create Agent";
    }
  }, [activeTab]);

  const handleCreateClick = () => {
    if (activeTab === "workflows") {
      setShowCreateWorkflowDialog(true);
    } else if (activeTab === "tasks") {
      setShowCreateTaskDialog(true);
    } else if (activeTab === "skills") {
      skillCreateRef.current?.();
    } else if (activeTab === "tools") {
      router.push("/tools/create");
    } else {
      router.push("/agents/create");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppBar />

      <div className="mt-12 flex">
        <DashboardSideBar username={userAddress} />

        <div className="flex-1 min-w-0">
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-background">
            <h1 className="text-xl font-semibold tracking-tight">Studio</h1>

            <Tabs
              value={activeTab}
              onValueChange={(v) => router.push(`/studio/${v}`)}
            >
              <TabsList className="h-8">
                <TabsTrigger value="agents" className="text-xs px-3">Agents</TabsTrigger>
                <TabsTrigger value="tools" className="text-xs px-3">Tools</TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs px-3">Tasks</TabsTrigger>
                <TabsTrigger value="workflows" className="text-xs px-3">Workflows</TabsTrigger>
                <TabsTrigger value="skills" className="text-xs px-3">Skills</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button size="sm" onClick={handleCreateClick}>
              {createLabel}
            </Button>
          </div>

          <div className="h-[calc(100vh-112px)] overflow-y-auto">
            {mainContent}
          </div>
        </div>
      </div>

      <CreateWorkflowDialog
        open={showCreateWorkflowDialog}
        onClose={() => setShowCreateWorkflowDialog(false)}
        userAddress={userAddress}
      />

      <CreateTaskDialog
        open={showCreateTaskDialog}
        onClose={() => setShowCreateTaskDialog(false)}
        userAddress={userAddress}
      />
    </div>
  );
};

export default StudioPage;
