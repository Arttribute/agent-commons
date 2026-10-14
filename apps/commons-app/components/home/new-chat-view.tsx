"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useAgents } from "@/hooks/use-agents";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { useSessionRuns } from "@/hooks/use-agent-activity";
import { normalizePrincipalId } from "@/lib/principal-id";
import { StudioAgentLauncher } from "@/components/studio/agent-launcher";
import { LauncherGreeting } from "@/components/studio/launcher-greeting";
import { CommonsAppsBar } from "@/components/plugins/apps-bar";
import { MobileMenuButton } from "@/components/layout/dashboard-side-bar";
import { SessionActivityMenu } from "./session-activity-menu";
import { StartSuggestionList, useStartSuggestions } from "./start-suggestions";

/**
 * /new: the place to start a chat with any agent. One composer with an agent
 * and project picker, a greeting, and a few suggestions. The top right shows
 * which agents are working or waiting for you.
 */
export function NewChatView({ userAddress: userOverride }: { userAddress?: string } = {}) {
  const { authState } = useAuth();
  const userAddress = userOverride ?? normalizePrincipalId(authState.walletAddress);
  const { agents, loading: agentsLoading } = useAgents(userAddress || undefined);
  const { sessions, isLoading: sessionsLoading } = useUserSessions(userAddress);
  const runs = useSessionRuns(sessions);
  const suggestions = useStartSuggestions({ userAddress, sessions, sessionsLoading });

  const launcherAgents = useMemo(
    () =>
      agents.map((agent: any) => ({
        agentId: agent.agentId,
        name: agent.name,
        avatar: agent.avatar,
        modelId: agent.modelId,
        isDefault: Boolean(agent.isDefault),
      })),
    [agents],
  );
  const menuAgents = useMemo(
    () => agents.map((agent: any) => ({ agentId: agent.agentId, name: agent.name, avatar: agent.avatar })),
    [agents],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2 sm:px-4">
        <MobileMenuButton />
        <div className="min-w-0 flex-1" />
        <CommonsAppsBar />
        <SessionActivityMenu agents={menuAgents} sessions={sessions} runs={runs} loading={agentsLoading || sessionsLoading} />
      </header>

      {/* Phones: greeting and suggestions scroll, the composer stays at the
          bottom above the keyboard. Larger screens: one centered group. */}
      <div className="flex min-h-0 flex-1 flex-col md:overflow-y-auto">
        <div className="mx-auto flex min-h-0 w-full max-w-[46rem] flex-1 flex-col px-3 sm:px-4 md:my-auto md:flex-none md:pb-[8vh]">
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto overscroll-contain py-6 md:flex-none md:overflow-visible md:py-0">
            <div className="text-center md:mb-6">
              <LauncherGreeting />
            </div>
            <StartSuggestionList items={suggestions.items} loading={suggestions.loading} className="mt-6 md:hidden" />
          </div>
          <div className="shrink-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:pb-0">
            <StudioAgentLauncher agents={launcherAgents} userAddress={userAddress} hideStarters projectPicker />
          </div>
          <StartSuggestionList items={suggestions.items} loading={suggestions.loading} className="mt-3 hidden md:block" />
        </div>
      </div>
    </div>
  );
}
