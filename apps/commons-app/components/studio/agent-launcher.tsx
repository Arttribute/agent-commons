"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInputBox from "@/components/sessions/chat/chat-input-box";
import { AgentSidebarSwitcher } from "@/components/studio/agent-sidebar-switcher";
import { useAgentContext } from "@/context/AgentContext";
import { useUserSessions } from "@/hooks/sessions/use-user-sessions";
import { normalizeConversationStarters } from "@/lib/conversation-starters";

type LauncherAgent = {
  agentId: string;
  name: string;
  avatar?: string | null;
  modelId?: string | null;
  isDefault?: boolean;
  conversationStarters?: unknown;
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
  const { setPendingPrompt, setInputText } = useAgentContext();
  const { isLoading: sessionsLoading } = useUserSessions(userAddress);

  const defaultAgentId = useMemo(
    () =>
      agents.find((agent) => agent.isDefault)?.agentId ??
      agents[0]?.agentId ??
      "",
    [agents],
  );

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
    if (defaultAgentId) setSelectedAgentId(defaultAgentId);
  }, [sessionsLoading, defaultAgentId]);

  const handleSelect = (id: string) => {
    manualPickRef.current = true;
    setSelectedAgentId(id);
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
          selectedAgent
            ? `Message ${selectedAgent.name}…`
            : "Ask an agent anything…"
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
      {starters.length > 0 && (
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
