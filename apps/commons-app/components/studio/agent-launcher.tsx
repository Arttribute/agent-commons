"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInputBox, { type ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { startChat } from "@/lib/start-chat";
import { useToast } from "@/hooks/use-toast";
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
 * The agents-overview composer: type a message, add files or knowledge, pick
 * an agent, and send. The chat opens in its own session view and streams
 * there. Reuses {@link ChatInputBox} in launch mode and the
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
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { setInputText } = useAgentContext();
  const [launching, setLaunching] = useState(false);
  const [pendingLaunch, setPendingLaunch] = useState<ComposerLaunch | null>(null);
  const { isLoading: sessionsLoading } = useUserSessions(userAddress);

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

  const handleLaunch = async (launch: ComposerLaunch) => {
    if (!selectedAgentId || launching) return;
    setPendingLaunch(launch);
    setLaunching(true);
    try {
      router.push(await startChat({ agentId: selectedAgentId, projectId, launch }));
    } catch (cause) {
      setInputText(launch.text);
      toast({
        title: "Could not start the chat",
        description: cause instanceof Error ? cause.message : undefined,
        variant: "destructive",
      });
      setPendingLaunch(null);
      setLaunching(false);
    }
  };

  return (
    <div className="w-full">
      {pendingLaunch && (
        <div aria-live="polite" className="mx-auto mb-5 flex max-w-3xl flex-col gap-4">
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
            {pendingLaunch.text}
            {pendingLaunch.attachments.length > 0 && (
              <div className="mt-2 text-xs text-muted-foreground">
                {pendingLaunch.attachments.map((attachment) => attachment.name).join(", ")}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            {selectedAgent?.name ?? "Agent"} is working…
          </div>
        </div>
      )}
      <ChatInputBox
        agentId={selectedAgentId}
        sessionId=""
        userId={userAddress}
        onLaunch={(launch) => void handleLaunch(launch)}
        launching={launching}
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
