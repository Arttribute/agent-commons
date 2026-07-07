"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInputBox from "@/components/sessions/chat/chat-input-box";
import { AgentSidebarSwitcher } from "@/components/studio/agent-sidebar-switcher";
import { useAgentContext } from "@/context/AgentContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";

type LauncherAgent = {
  agentId: string;
  name: string;
  avatar?: string | null;
  modelId?: string | null;
};

/**
 * The agents-overview composer: type a message, pick an agent (defaults to the
 * one you most recently had a session with), and hit send to jump straight into
 * a fresh session that streams your message. Reuses {@link ChatInputBox} in
 * launch mode and the {@link AgentSidebarSwitcher} as a compact picker.
 */
export function StudioAgentLauncher({
  agents,
  userAddress,
}: {
  agents: LauncherAgent[];
  userAddress: string;
}) {
  const router = useRouter();
  const { setPendingPrompt } = useAgentContext();
  const { sessions, isLoading: sessionsLoading } = useUserSessions(userAddress);

  // The agent behind the user's most recent session (that they still own),
  // falling back to their first agent.
  const lastUsedAgentId = useMemo(() => {
    const ownedIds = new Set(agents.map((a) => a.agentId));
    const recent = [...sessions].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
    for (const session of recent) {
      if (session.agentId && ownedIds.has(session.agentId)) return session.agentId;
    }
    return agents[0]?.agentId ?? "";
  }, [sessions, agents]);

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const manualPickRef = useRef(false);
  const seededRef = useRef(false);

  // Show a sensible default immediately so the picker never reads as empty.
  useEffect(() => {
    if (!selectedAgentId && agents[0]) setSelectedAgentId(agents[0].agentId);
  }, [agents, selectedAgentId]);

  // Once sessions have loaded, upgrade the default to the last-used agent —
  // unless the user has already picked one themselves.
  useEffect(() => {
    if (seededRef.current || manualPickRef.current || sessionsLoading) return;
    seededRef.current = true;
    if (lastUsedAgentId) setSelectedAgentId(lastUsedAgentId);
  }, [sessionsLoading, lastUsedAgentId]);

  const handleSelect = (id: string) => {
    manualPickRef.current = true;
    setSelectedAgentId(id);
  };

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agentId === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const handleLaunch = (text: string) => {
    if (!selectedAgentId) return;
    setPendingPrompt(text);
    router.push(`/studio/agents/${selectedAgentId}`);
  };

  return (
    <div className="w-full">
      <ChatInputBox
        agentId={selectedAgentId}
        sessionId=""
        userId={userAddress}
        onLaunch={handleLaunch}
        placeholder={
          selectedAgent ? `Message ${selectedAgent.name}…` : "Ask an agent anything…"
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
    </div>
  );
}

export default StudioAgentLauncher;
