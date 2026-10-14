"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInputBox, { type ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { beginChat } from "@/lib/start-chat";
import { AgentSidebarSwitcher } from "@/components/studio/agent-sidebar-switcher";
import { useAgentContext } from "@/context/AgentContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { normalizeConversationStarters } from "@/lib/conversation-starters";
import { ProjectChip } from "@/components/projects/project-chip";
import { useProjects } from "@/hooks/use-projects";

type LauncherAgent = {
  agentId: string;
  name: string;
  avatar?: string | null;
  modelId?: string | null;
  isDefault?: boolean;
  conversationStarters?: unknown;
};

/**
 * The composer on /new and project pages: type a message, add files or
 * knowledge, pick an agent, and send. The chat opens at once in its session
 * view and streams there. Reuses {@link ChatInputBox} in launch mode and the
 * {@link AgentSidebarSwitcher} as a compact picker.
 */
export function StudioAgentLauncher({
  agents,
  userAddress,
  projectId,
  preferredAgentId,
  onAgentChange,
  placeholder,
  hideStarters = false,
  projectPicker = false,
  requestedAgent,
}: {
  agents: LauncherAgent[];
  userAddress: string;
  /** Start chats inside this project. */
  projectId?: string;
  /** Agent to select first, e.g. the project's usual agent. */
  preferredAgentId?: string | null;
  onAgentChange?: (agentId: string) => void;
  placeholder?: string;
  hideStarters?: boolean;
  /** Let the person choose a project for the chat when none is fixed. */
  projectPicker?: boolean;
  /** Switch to this agent, e.g. when a suggestion names one. `key` repeats a request. */
  requestedAgent?: { agentId: string; key: number } | null;
}) {
  const router = useRouter();
  const { setInputText } = useAgentContext();
  const { isLoading: sessionsLoading } = useUserSessions(userAddress);
  const showProjectPicker = projectPicker && !projectId;
  const { projects } = useProjects(showProjectPicker && Boolean(userAddress));
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(null);

  const defaultAgentId = useMemo(
    () =>
      (preferredAgentId && agents.some((agent) => agent.agentId === preferredAgentId) ? preferredAgentId : undefined) ??
      agents.find((agent) => agent.isDefault)?.agentId ??
      agents[0]?.agentId ??
      "",
    [agents, preferredAgentId],
  );

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const manualPickRef = useRef(false);
  const seededRef = useRef(false);

  // Show a sensible default immediately so the picker never reads as empty.
  useEffect(() => {
    if (!selectedAgentId && agents[0]) setSelectedAgentId(agents[0].agentId);
  }, [agents, selectedAgentId]);

  // A project's usual agent wins until the person picks another one.
  useEffect(() => {
    if (manualPickRef.current || !preferredAgentId) return;
    if (agents.some((agent) => agent.agentId === preferredAgentId)) setSelectedAgentId(preferredAgentId);
  }, [agents, preferredAgentId]);

  // Once sessions have loaded, upgrade the default to the last-used agent —
  // unless the user has already picked one themselves.
  useEffect(() => {
    if (seededRef.current || manualPickRef.current || sessionsLoading) return;
    seededRef.current = true;
    if (defaultAgentId) setSelectedAgentId(defaultAgentId);
  }, [sessionsLoading, defaultAgentId]);

  const appliedRequestRef = useRef<number | null>(null);
  useEffect(() => {
    if (!requestedAgent || appliedRequestRef.current === requestedAgent.key) return;
    if (!agents.some((agent) => agent.agentId === requestedAgent.agentId)) return;
    appliedRequestRef.current = requestedAgent.key;
    manualPickRef.current = true;
    setSelectedAgentId(requestedAgent.agentId);
    onAgentChange?.(requestedAgent.agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedAgent?.key, agents]);

  const handleSelect = (id: string) => {
    manualPickRef.current = true;
    setSelectedAgentId(id);
    onAgentChange?.(id);
  };

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  // Starter pills below the composer — the selected agent's own starters
  // (the Commons Copilot's by default), clicking one fills the composer.
  const starters = useMemo(
    () => normalizeConversationStarters(selectedAgent?.conversationStarters),
    [selectedAgent],
  );

  // Open the chat right away; it shows the message and the agent thinking
  // while the session is created in the background.
  const handleLaunch = (launch: ComposerLaunch) => {
    if (!selectedAgent) return;
    router.push(
      beginChat({
        agent: { agentId: selectedAgent.agentId, name: selectedAgent.name, avatar: selectedAgent.avatar },
        projectId: projectId ?? chosenProjectId ?? undefined,
        launch,
      }),
    );
  };

  return (
    <div className="flex w-full flex-col">
      <ChatInputBox
        agentId={selectedAgentId}
        sessionId=""
        userId={userAddress}
        onLaunch={handleLaunch}
        placeholder={
          placeholder ??
          (selectedAgent
            ? `Message ${selectedAgent.name}…`
            : "Ask an agent anything…")
        }
        footerLeft={
          <AgentSidebarSwitcher
            compact
            current={{
              id: selectedAgentId,
              name: selectedAgent?.name ?? "",
              avatar: selectedAgent?.avatar,
              modelId: selectedAgent?.modelId,
            }}
            items={agents.map((a) => ({
              id: a.agentId,
              name: a.name,
              avatar: a.avatar,
              modelId: a.modelId,
            }))}
            onSelect={handleSelect}
          />
        }
      />
      {showProjectPicker && (
        // Above the composer on phones, where it sits at the bottom of the
        // screen; below it on larger screens.
        <div className="order-first mb-1.5 flex items-center md:order-none md:mb-0 md:mt-2">
          <ProjectChip
            variant="quiet"
            side="bottom"
            projects={projects.map(({ projectId: id, name }) => ({ projectId: id, name }))}
            projectId={chosenProjectId}
            onChange={setChosenProjectId}
          />
        </div>
      )}
      {!hideStarters && starters.length > 0 && (
        <div className="mt-3 flex flex-nowrap justify-center gap-2">
          {starters.map((starter) => (
            <button
              key={starter.label}
              type="button"
              title={starter.prompt}
              className="min-w-0 max-w-[12rem] truncate rounded-full border border-border bg-white px-3.5 py-1.5 text-sm text-muted-foreground shadow-card transition-colors hover:bg-muted hover:text-foreground"
              onClick={() => setInputText(starter.prompt)}
            >
              {starter.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default StudioAgentLauncher;
