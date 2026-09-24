"use client";

import { useParams, usePathname } from "next/navigation";
import type { NextPage } from "next";
import { useMemo, useState, useCallback, useRef } from "react";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import { AgentsWorkspaceView } from "@/components/studio/agents-workspace-view";
import { StudioAgentLauncher } from "@/components/studio/agent-launcher";
import { LauncherGreeting } from "@/components/studio/launcher-greeting";
import { CommonsAppsBar } from "@/components/plugins/apps-bar";
import { ToolsManagementView } from "@/components/tools/management/tools-management-view";
import { WorkflowsListView } from "@/components/workflows/workflows-list-view";
import { CreateWorkflowDialog } from "@/components/workflows/create-workflow-dialog";
import { CreateToolDialog } from "@/components/tools/create-tool-dialog";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import { SkillsMarketplaceView } from "@/components/skills/skills-marketplace-view";
import { UiPluginsView } from "@/components/plugins/ui-plugins-view";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CreateButton, PageHeader } from "@/components/layout/page-header";
import { useRouter } from "next/navigation";
import { useAgents } from "@/hooks/use-agents";
import { normalizePrincipalId } from "@/lib/principal-id";
import {
  CREATE_UI_PLUGIN_HASH,
  openUiPluginCreator,
} from "@/lib/commons-copilot-events";
import { CustomizeTabs } from "@/components/customize/customize-tabs";

const StudioPage: NextPage = () => {
  const { tab } = useParams() as { tab: string };
  const pathname = usePathname();
  const router = useRouter();
  const { authState } = useAuth();
  const userAddress = normalizePrincipalId(authState.walletAddress);

  const activeTab =
    (tab as string) ||
    (pathname?.startsWith("/studio/customize/")
      ? pathname.split("/")[3]
      : pathname?.split("/")[2]) ||
    "agents";
  const isCustomize = pathname?.startsWith("/studio/customize/") ?? false;

  const [showCreateWorkflowDialog, setShowCreateWorkflowDialog] =
    useState(false);
  const [showCreateToolDialog, setShowCreateToolDialog] = useState(false);
  const skillCreateRef = useRef<(() => void) | null>(null);
  const registerSkillCreate = useCallback((fn: () => void) => {
    skillCreateRef.current = fn;
  }, []);
  const taskCreateRef = useRef<(() => void) | null>(null);
  const registerTaskCreate = useCallback((fn: () => void) => {
    taskCreateRef.current = fn;
  }, []);

  const {
    agents,
    loading: loadingAgents,
    error: agentsError,
    refresh: refreshAgents,
  } = useAgents(activeTab === "agents" ? userAddress : undefined);

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
          <div className="h-full px-2 pb-2">
            <div className="h-full overflow-hidden rounded-xl border border-border bg-white">
              <TaskManagementView
                userAddress={userAddress}
                onRegisterCreate={registerTaskCreate}
              />
            </div>
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
            <SkillsMarketplaceView
              userAddress={userAddress}
              onRegisterCreate={registerSkillCreate}
            />
          </div>
        );
      case "apps":
        return (
          <div className="p-4 sm:p-6">
            <UiPluginsView />
          </div>
        );
      // Only the real /studio/agents route mounts the launcher — it depends on
      // the AgentProvider from that route's layout. The default fallback (for
      // unknown /studio/<x> segments served without that provider) renders just
      // the plain showcase.
      case "agents":
        return (
          <AgentsWorkspaceView
            agents={agents}
            loading={loadingAgents}
            error={Boolean(agentsError)}
            onRetry={refreshAgents}
            onAgentClick={(id) => router.push(`/studio/agents/${id}`)}
            launcher={<StudioAgentLauncher
              agents={agents.map((a) => ({
                agentId: a.agentId,
                name: a.name,
                avatar: (a as any).avatar,
                modelId: (a as any).modelId,
                isDefault: Boolean((a as any).isDefault),
                conversationStarters: (a as any).conversationStarters,
              }))}
              userAddress={userAddress}
            />}
          />
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
                <AgentsShowcase agents={agents} onAgentClick={(id) => router.push(`/studio/agents/${id}`)} />
              )}
            </div>
          </div>
        );
    }
  }, [
    activeTab,
    loadingAgents,
    agentsError,
    agents,
    userAddress,
    registerSkillCreate,
    registerTaskCreate,
    refreshAgents,
  ]);

  const createLabel = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return "Create new tool";
      case "tasks":
        return "Create new scheduled task";
      case "workflows":
        return "Create new workflow";
      case "skills":
        return "Create new skill";
      case "apps":
        return "Create app with Commons Copilot";
      default:
        return "Create new agent";
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
          title: "Scheduled tasks",
          description:
            "Schedule one-off or recurring tasks for your agents to run automatically.",
        };
      case "workflows":
        return {
          title: "Workflows",
          description: "Build and run multi-step workflows with your tools.",
        };
      case "skills":
        return {
          title: "Skills",
          description:
            "Browse platform skills or create modular capabilities for your agents.",
        };
      case "apps":
        return {
          title: "Apps",
          description:
            "Review and manage sandboxed pages and floating widgets built for your workspace.",
        };
      case "agents":
      default:
        return {
          title: "Agents",
          description: "",
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
      setShowCreateToolDialog(true);
    } else if (activeTab === "apps") {
      openUiPluginCreator();
    } else {
      router.push("/studio/agents/create");
    }
  };

  return (
    <div className="relative flex h-full min-w-0 flex-col bg-page">
      <PageHeader title={pageCopy.title} description={pageCopy.description}>
        <CommonsAppsBar />
        <CreateButton
          label={createLabel}
          onClick={handleCreateClick}
          href={activeTab === "apps" ? CREATE_UI_PLUGIN_HASH : undefined}
        />
      </PageHeader>

      {isCustomize && <CustomizeTabs />}

      <div className="min-h-0 flex-1 overflow-y-auto">{mainContent}</div>

      {/* Anchored at the page edge — same bottom line as the session chat
          input and other fixed bottom UI, clear of the padded content area. */}

      <CreateWorkflowDialog
        open={showCreateWorkflowDialog}
        onClose={() => setShowCreateWorkflowDialog(false)}
        userAddress={userAddress}
      />
      <CreateToolDialog
        open={showCreateToolDialog}
        onOpenChange={setShowCreateToolDialog}
      />
    </div>
  );
};

export default StudioPage;
