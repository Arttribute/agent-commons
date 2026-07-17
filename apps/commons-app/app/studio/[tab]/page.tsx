"use client";

import { useParams, usePathname } from "next/navigation";
import type { NextPage } from "next";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import AgentsShowcase from "@/components/agents/AgentsShowcase";
import {
  AgentsPagination,
  AGENT_PAGE_SIZES,
} from "@/components/agents/agents-pagination";
import { StudioAgentLauncher } from "@/components/studio/agent-launcher";
import { ToolsManagementView } from "@/components/tools/management/tools-management-view";
import { WorkflowsListView } from "@/components/workflows/workflows-list-view";
import { CreateWorkflowDialog } from "@/components/workflows/create-workflow-dialog";
import { CreateToolDialog } from "@/components/tools/create-tool-dialog";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import { SkillsMarketplaceView } from "@/components/skills/skills-marketplace-view";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CreateButton, PageHeader } from "@/components/layout/page-header";
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
  // The launcher's footprint, so the floating agents can keep clear of it.
  const composerRef = useRef<HTMLDivElement>(null);

  const { agents, loading: loadingAgents } = useAgents(
    activeTab === "agents" ? userAddress : undefined,
  );

  // Agents arrive ordered by latest interaction (falling back to creation);
  // we page through them client-side, 10 floating profiles at a time.
  const [agentPage, setAgentPage] = useState(0);
  const [agentPageSize, setAgentPageSize] = useState(10);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("studio-agents-per-page"));
    if (AGENT_PAGE_SIZES.includes(stored)) setAgentPageSize(stored);
  }, []);

  const handleAgentPageSizeChange = useCallback((size: number) => {
    setAgentPageSize(size);
    setAgentPage(0);
    window.localStorage.setItem("studio-agents-per-page", String(size));
  }, []);

  // Keep the page in range when the list shrinks or the page size grows.
  const agentPageCount = Math.max(1, Math.ceil(agents.length / agentPageSize));
  useEffect(() => {
    setAgentPage((p) => Math.min(p, agentPageCount - 1));
  }, [agentPageCount]);

  const pagedAgents = useMemo(
    () =>
      agents.slice(
        agentPage * agentPageSize,
        (agentPage + 1) * agentPageSize,
      ),
    [agents, agentPage, agentPageSize],
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
                    <div
                      ref={composerRef}
                      className="pointer-events-auto w-full max-w-3xl"
                    >
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
                          isDefault: Boolean((a as any).isDefault),
                        }))}
                        userAddress={userAddress}
                      />
                    </div>
                  </div>
                  <AgentsShowcase agents={pagedAgents} avoidRef={composerRef} />
                  <div className="pointer-events-none absolute bottom-2 left-2 z-30">
                    <AgentsPagination
                      page={agentPage}
                      pageSize={agentPageSize}
                      total={agents.length}
                      onPageChange={setAgentPage}
                      onPageSizeChange={handleAgentPageSizeChange}
                    />
                  </div>
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
  }, [
    activeTab,
    loadingAgents,
    agents,
    pagedAgents,
    agentPage,
    agentPageSize,
    handleAgentPageSizeChange,
    userAddress,
    registerSkillCreate,
    registerTaskCreate,
  ]);

  const createLabel = useMemo(() => {
    switch (activeTab) {
      case "tools":
        return "Create new tool";
      case "tasks":
        return "Create new task";
      case "workflows":
        return "Create new workflow";
      case "skills":
        return "Create new skill";
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
          title: "Tasks",
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
    } else {
      router.push("/studio/agents/create");
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-stone-50">
      <PageHeader title={pageCopy.title} description={pageCopy.description}>
        <CreateButton label={createLabel} onClick={handleCreateClick} />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">{mainContent}</div>

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
