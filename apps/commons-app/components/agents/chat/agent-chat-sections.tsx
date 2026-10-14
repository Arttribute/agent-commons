"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { PROFILE_ICON_SIZE } from "@/lib/profile-icons";
import { AgentAutonomy } from "@/components/agents/agent-autonomy";
import { AgentRuntimeSurface } from "@/components/agents/agent-runtime-surface";
import { AgentArtifactsView } from "@/components/artifacts/agent-artifacts-view";
import { AgentComputerSurface } from "@/components/computers/agent-computer-surface";
import { AgentMemoryView } from "@/components/memory/agent-memory-view";
import { TaskManagementView } from "@/components/tasks/task-management-view";
import { InfoHint } from "@/components/ui/info-hint";
import type { CommonAgent } from "@/types/agent";
import {
  EmbeddedSection,
  ObservabilityView,
  SetupView,
  SkillsView,
  ToolsView,
  UsageView,
  WalletView,
} from "@/components/agents/studio/agent-sections";

export type ChatSection =
  | "profile"
  | "instructions"
  | "model"
  | "heartbeat"
  | "tools"
  | "skills"
  | "tasks"
  | "memory"
  | "observability"
  | "usage"
  | "wallet"
  | "runtime"
  | "artifacts"
  | "computer";

export const CHAT_SECTIONS: Record<ChatSection, { title: string; hint?: string; fill?: boolean }> = {
  profile: { title: "Profile", hint: "Name, picture, description, and whether other agents can discover this one." },
  instructions: { title: "Instructions", hint: "Persona, greeting, conversation starters and the system prompt." },
  model: { title: "Model", hint: "The model this agent thinks with, and your own provider key if you have one." },
  heartbeat: { title: "Heartbeat", hint: "Let the agent check in on its own at a set interval." },
  tools: { title: "Tools", hint: "What this agent can use: platform tools, connected apps and your own tools." },
  skills: { title: "Skills", hint: "Reusable know-how the agent loads when a task calls for it." },
  tasks: { title: "Scheduled tasks", fill: true },
  memory: { title: "Memory", hint: "Facts the agent keeps between chats. Review, add or remove them." },
  observability: { title: "Activity", hint: "Runs, tool calls, errors and timing for this agent." },
  usage: { title: "Usage" },
  wallet: { title: "Wallet" },
  runtime: { title: "Runtime", hint: "The engine that runs this agent and its lifecycle." },
  artifacts: { title: "Files", fill: true },
  computer: { title: "Computer", fill: true },
};

/** Old ?section= values keep working: they open the matching view or chat. */
const LEGACY: Record<string, ChatSection | "chat" | "new"> = {
  setup: "profile",
  "new-session": "new",
  sessions: "chat",
  artefacts: "artifacts",
};

export function parseChatSection(value: string | null): ChatSection | "chat" | "new" | null {
  if (!value) return null;
  if (value in CHAT_SECTIONS) return value as ChatSection;
  return LEGACY[value] ?? null;
}

/** One agent setting, opened full width with a way back to the chat. */
export function AgentSectionScreen({
  section,
  agent,
  isOwner,
  userAddress,
  agentTools,
  setAgentTools,
  onAgentUpdated,
  onOpenSection,
  onBack,
}: {
  section: ChatSection;
  agent: CommonAgent;
  isOwner: boolean;
  userAddress: string;
  agentTools: any[];
  setAgentTools: React.Dispatch<React.SetStateAction<any[]>>;
  onAgentUpdated: (agent: CommonAgent) => void;
  onOpenSection: (section: ChatSection) => void;
  onBack: () => void;
}) {
  const meta = CHAT_SECTIONS[section];
  const agentId = agent.agentId;
  // Forms that need saving put their Save button in the header.
  const [actions, setActions] = useState<HTMLDivElement | null>(null);

  const content = (() => {
    switch (section) {
      case "profile":
        return <SetupView agent={agent} isOwner={isOwner} onSaved={onAgentUpdated} part="profile" actionsTarget={actions} />;
      case "instructions":
        return <SetupView agent={agent} isOwner={isOwner} onSaved={onAgentUpdated} part="behavior" actionsTarget={actions} />;
      case "model":
        return (
          <SetupView
            agent={agent}
            isOwner={isOwner}
            onSaved={onAgentUpdated}
            part="model"
            actionsTarget={actions}
            onOpenSection={(key) => key === "runtime" && onOpenSection("runtime")}
          />
        );
      case "heartbeat":
        return (
          <div className="mx-auto max-w-3xl p-4 sm:p-5">
            <AgentAutonomy agentId={agentId} isOwner={isOwner} actionsTarget={actions} />
          </div>
        );
      case "tools":
        return <ToolsView agentId={agentId} agentTools={agentTools} setAgentTools={setAgentTools} runtimeType={agent.runtimeType} isOwner={isOwner} />;
      case "skills":
        return <SkillsView agentId={agentId} runtimeType={agent.runtimeType} />;
      case "tasks":
        return <TaskManagementView userAddress={userAddress} agentId={agentId} hideAgentFilter preSelectedAgentId={agentId} />;
      case "memory":
        return (
          <div className="mx-auto max-w-5xl p-4 sm:p-5">
            <AgentMemoryView agentId={agentId} />
          </div>
        );
      case "observability":
        return <ObservabilityView agentId={agentId} />;
      case "usage":
        return <UsageView agentId={agentId} />;
      case "wallet":
        return <WalletView agentId={agentId} />;
      case "runtime":
        return (
          <div className="mx-auto max-w-5xl p-4 sm:p-5">
            <AgentRuntimeSurface agentId={agentId} />
          </div>
        );
      case "artifacts":
        return <AgentArtifactsView agentId={agentId} />;
      case "computer":
        return <AgentComputerSurface agentId={agentId} embedded className="h-full" />;
    }
  })();

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-page">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-white px-2 sm:px-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chat"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <AgentAvatar name={agent.name} src={agent.avatar} size={PROFILE_ICON_SIZE} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {meta.title}
            {meta.hint && <InfoHint label={`About ${meta.title}`}>{meta.hint}</InfoHint>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{agent.name}</p>
        </div>
        <div ref={setActions} className="ml-auto flex shrink-0 items-center" />
      </header>
      <div className={meta.fill ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto overscroll-contain"}>
        <EmbeddedSection>{content}</EmbeddedSection>
      </div>
    </div>
  );
}
