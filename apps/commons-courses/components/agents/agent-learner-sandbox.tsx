"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, PanelRight } from "lucide-react";
import { ChatSurface } from "./agent-sandbox/chat-surface";
import {
  IdentityPanel,
  SkillsPanel,
  ToolsPanel,
  WorkflowPanel,
} from "./agent-sandbox/config-panels";
import { ConfigDrawer, ConfigRail } from "./agent-sandbox/config-shell";
import { BottomGuide } from "./agent-sandbox/bottom-guide";
import { LogsPanel } from "./agent-sandbox/logs-panel";
import { extractAssistantText } from "./agent-sandbox/extract-assistant-text";
import type {
  ChatMessage,
  ConfigPanel,
  ReviewResult,
  SandboxLog,
} from "./agent-sandbox/types";
import { targetToPanel } from "./agent-sandbox/types";
import type { AgentSandboxConfig } from "@/types/skills";

type Props = {
  courseSlug: string;
  challengeId: string;
  config: AgentSandboxConfig;
  completed: boolean;
  authenticated: boolean;
  signInHref: string;
  onComplete: (payload: {
    agentId?: string;
    simulated: boolean;
    creditReward: number;
  }) => void;
};

export function AgentLearnerSandbox({
  courseSlug,
  challengeId,
  config,
  completed,
  authenticated,
  signInHref,
  onComplete,
}: Props) {
  const [agentName, setAgentName] = useState(
    config.starterAgent?.name || "Study Planner Agent"
  );
  const [persona, setPersona] = useState(
    config.starterAgent?.persona ||
      "A friendly study planning coach for beginners"
  );
  const [systemPrompt, setSystemPrompt] = useState(
    config.starterAgent?.systemPrompt ||
      "You are a friendly study planning coach for beginners. Help learners turn goals into small weekly plans. Ask clarifying questions when details are missing. Be practical, concise, and encouraging."
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    (config.skillTemplates || []).slice(0, 1).map((skill) => skill.id)
  );
  const [skillInstructions, setSkillInstructions] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      (config.skillTemplates || []).map((skill) => [
        skill.id,
        skill.instructions,
      ])
    )
  );
  const [selectedTools, setSelectedTools] = useState<string[]>(
    (config.toolTemplates || []).slice(0, 1).map((tool) => tool.id)
  );
  const [taskTitle, setTaskTitle] = useState("Plan a realistic study week");
  const [activePanel, setActivePanel] = useState<ConfigPanel>("identity");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewResult>>({});
  const [createdAgentId, setCreatedAgentId] = useState<string | undefined>();
  const [completionSent, setCompletionSent] = useState(completed);
  const [creditReward, setCreditReward] = useState(config.creditReward || 0);
  const [chatInput, setChatInput] = useState(
    "Help me plan three focused study sessions this week."
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Create the agent first. Then I will run as your real Agent Commons agent here.",
    },
  ]);
  const [logs, setLogs] = useState<SandboxLog[]>([
    {
      level: "info",
      message:
        "Configure the agent, create it in Agent Commons, then test it here.",
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const guide = config.guideSteps || [];
  const activeStep = guide[guideIndex];
  const reviewTargets = config.review?.enabled ? config.review.targets || [] : [];
  const promptReviewPassed =
    !reviewTargets.includes("system_prompt") || reviews.system_prompt?.passed;
  const needsGoogleConnection = selectedTools.some((toolId) => {
    const tool = config.toolTemplates?.find((item) => item.id === toolId);
    return tool?.connectorKind?.startsWith("google_") || tool?.connectorKind === "gmail";
  });
  const appUrl =
    process.env.NEXT_PUBLIC_AGENT_COMMONS_APP_URL || "https://www.agentcommons.io";
  const googleConnectUrl = `${appUrl.replace(/\/$/, "")}/oauth/connect?provider=google_workspace&returnUrl=/studio/tools`;
  const agentStudioUrl = createdAgentId
    ? `${appUrl.replace(/\/$/, "")}/studio/agents/${createdAgentId}`
    : "";

  const canCreate =
    agentName.trim().length > 1 &&
    systemPrompt.trim().length > 40 &&
    promptReviewPassed;

  const statusLabel = useMemo(() => {
    if (completionSent) return "Completed";
    if (createdAgentId) return "Agent created. Test it in chat.";
    if (!promptReviewPassed) return "System prompt review required";
    return "Create the agent in Agent Commons";
  }, [completionSent, createdAgentId, promptReviewPassed]);

  function addLog(log: SandboxLog) {
    setLogs((current) => [log, ...current].slice(0, 40));
  }

  function requireAuth() {
    if (authenticated) return false;
    window.location.href = signInHref;
    return true;
  }

  async function createAgent() {
    if (requireAuth() || creating || !canCreate) return;
    setCreating(true);
    addLog({ level: "info", message: "Creating a real Agent Commons agent..." });

    const response = await fetch(`/api/skills/${courseSlug}/sandbox`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId,
        agent: {
          name: agentName,
          persona,
          systemPrompt,
          skills: selectedSkills,
          skillInstructions,
          tools: selectedTools,
          taskTitle,
          message: chatInput,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setCreating(false);

    if (!response.ok || !payload.agentId || payload.simulated) {
      addLog({
        level: "error",
        message: formatApiError(
          payload,
          "Agent Commons did not create a real agent. The lesson cannot continue with a mock agent."
        ),
      });
      return;
    }

    setCreatedAgentId(payload.agentId);
    setCreditReward(payload.creditReward || config.creditReward || 0);
    setMessages([
      {
        role: "assistant",
        content:
          "Agent created in Agent Commons. Send a message to test the live agent.",
      },
    ]);
    addLog({
      level: "success",
      message: `Created Agent Commons agent ${payload.agentId}.`,
    });
    if (payload.assignedTools?.length) {
      addLog({
        level: "success",
        message: `Attached ${payload.assignedTools.length} real platform tool${payload.assignedTools.length === 1 ? "" : "s"}.`,
      });
    }
    for (const warning of payload.toolWarnings || []) {
      addLog({ level: "warning", message: warning });
    }
    if (needsGoogleConnection) {
      addLog({
        level: "warning",
        message:
          "Google tools require a real Google Workspace connection before the agent can use Google data.",
      });
    }
  }

  async function syncAgent(reason = "Saved agent changes.") {
    if (requireAuth() || syncing || !createdAgentId) return false;
    setSyncing(true);
    addLog({ level: "info", message: "Saving changes to Agent Commons..." });

    const response = await fetch(`/api/skills/${courseSlug}/sandbox`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: createdAgentId,
        challengeId,
        agent: {
          name: agentName,
          persona,
          systemPrompt,
          skills: selectedSkills,
          skillInstructions,
          tools: selectedTools,
          taskTitle,
          message: chatInput,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSyncing(false);

    if (!response.ok) {
      addLog({
        level: "error",
        message: formatApiError(
          payload,
          "Could not save this agent change yet."
        ),
      });
      return false;
    }

    addLog({ level: "success", message: reason });
    if (payload.assignedTools?.length) {
      addLog({
        level: "success",
        message: `Attached ${payload.assignedTools.length} new platform tool${payload.assignedTools.length === 1 ? "" : "s"}.`,
      });
    }
    for (const warning of payload.toolWarnings || []) {
      addLog({ level: "warning", message: warning });
    }
    return true;
  }

  async function sendMessage() {
    if (requireAuth() || sending || !chatInput.trim()) return;
    if (!createdAgentId) {
      addLog({
        level: "warning",
        message: "Create the Agent Commons agent before testing the chat.",
      });
      return;
    }
    const synced = await syncAgent("Saved latest changes before chat.");
    if (!synced) return;

    const userMessage: ChatMessage = { role: "user", content: chatInput.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput("");
    setSending(true);
    addLog({ level: "info", message: "Running the real agent..." });

    const response = await fetch(`/api/skills/${courseSlug}/sandbox/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: createdAgentId,
        messages: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSending(false);

    if (!response.ok) {
      const error = formatApiError(payload, "The agent run failed.");
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `Run failed: ${error}` },
      ]);
      addLog({ level: "error", message: error });
      return;
    }

    const assistantText = extractAssistantText(payload.data);
    setMessages((current) => [
      ...current,
      { role: "assistant", content: assistantText },
    ]);
    addLog({ level: "success", message: "Agent returned a live response." });
    requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ block: "end" }));

    if (!completionSent) {
      setCompletionSent(true);
      onComplete({
        agentId: createdAgentId,
        simulated: false,
        creditReward,
      });
    }
  }

  async function reviewTarget(target: "system_prompt" | "skills") {
    if (requireAuth()) return;
    const content =
      target === "system_prompt"
        ? systemPrompt
        : (config.skillTemplates || [])
            .filter((skill) => selectedSkills.includes(skill.id))
            .map(
              (skill) =>
                `${skill.name}\n${skillInstructions[skill.id] || skill.instructions}`
            )
            .join("\n\n");
    if (!content.trim()) return;

    setReviewing(target);
    const response = await fetch(`/api/skills/${courseSlug}/sandbox/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId,
        target,
        content,
        context: { agentName, persona, selectedSkills },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setReviewing(null);

    if (!response.ok) {
      addLog({
        level: "error",
        message: formatApiError(payload, "Could not review this yet."),
      });
      return;
    }
    const result = payload.data as ReviewResult;
    setReviews((current) => ({ ...current, [target]: result }));
    addLog({
      level: result.passed ? "success" : "warning",
      message: `${target === "system_prompt" ? "System prompt" : "Skill"} review: ${result.score}/100. ${result.summary}`,
    });
  }

  function openGuideStep() {
    openGuideIndex(guideIndex);
  }

  function openGuideIndex(index: number) {
    const step = guide[index];
    const panel = step?.target ? targetToPanel[step.target] : undefined;
    if (panel) {
      setActivePanel(panel);
      setDrawerOpen(true);
    }
  }

  async function nextGuideStep() {
    const nextIndex = (guideIndex + 1) % Math.max(guide.length, 1);
    if (createdAgentId) {
      await syncAgent("Saved changes before moving on.");
    }
    setGuideIndex(nextIndex);
    openGuideIndex(nextIndex);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
      <ConfigRail
        activePanel={activePanel}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((value) => !value)}
        onOpenPanel={(panel) => {
          setActivePanel(panel);
          setDrawerOpen(true);
        }}
      />

      <ConfigDrawer
        open={drawerOpen}
        panel={activePanel}
        onClose={() => setDrawerOpen(false)}
      >
        {activePanel === "identity" ? (
          <IdentityPanel
            agentName={agentName}
            persona={persona}
            systemPrompt={systemPrompt}
            reviewEnabled={reviewTargets.includes("system_prompt")}
            review={reviews.system_prompt}
            reviewing={reviewing === "system_prompt"}
            onNameChange={setAgentName}
            onPersonaChange={setPersona}
            onPromptChange={(value) => {
              setSystemPrompt(value);
              setReviews((current) => {
                const rest = { ...current };
                delete rest.system_prompt;
                return rest;
              });
            }}
            onReview={() => reviewTarget("system_prompt")}
          />
        ) : null}
        {activePanel === "skills" ? (
          <SkillsPanel
            skills={config.skillTemplates || []}
            selected={selectedSkills}
            skillInstructions={skillInstructions}
            onChange={(items) => {
              setSelectedSkills(items);
              setReviews((current) => {
                const rest = { ...current };
                delete rest.skills;
                return rest;
              });
            }}
            onInstructionChange={(id, value) => {
              setSkillInstructions((current) => ({ ...current, [id]: value }));
              setReviews((current) => {
                const rest = { ...current };
                delete rest.skills;
                return rest;
              });
            }}
            reviewEnabled={reviewTargets.includes("skills")}
            review={reviews.skills}
            reviewing={reviewing === "skills"}
            onReview={() => reviewTarget("skills")}
          />
        ) : null}
        {activePanel === "tools" ? (
          <ToolsPanel
            tools={config.toolTemplates || []}
            selected={selectedTools}
            onChange={setSelectedTools}
            googleConnectUrl={googleConnectUrl}
          />
        ) : null}
        {activePanel === "workflow" ? (
          <WorkflowPanel taskTitle={taskTitle} onTaskChange={setTaskTitle} />
        ) : null}
      </ConfigDrawer>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-widest text-slate-500">
              {createdAgentId ? `Agent ${createdAgentId}` : "Agent Commons sandbox"}
            </p>
            <h2 className="truncate text-lg font-semibold">
              {agentName || "Untitled agent"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {agentStudioUrl ? (
              <a
                href={agentStudioUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 sm:inline-flex"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Agent Commons
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setLogsOpen((value) => !value)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600"
              aria-label="Toggle logs"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <ChatSurface
            messages={messages}
            sending={sending}
            chatInput={chatInput}
            createdAgentId={createdAgentId}
            chatEndRef={chatEndRef}
            onInputChange={setChatInput}
            onSend={sendMessage}
          />
          {logsOpen ? (
            <aside className="hidden w-72 shrink-0 border-l border-slate-200 bg-white lg:block">
              <LogsPanel logs={logs} />
            </aside>
          ) : null}
          {logsOpen ? (
            <div className="absolute inset-y-0 right-0 z-40 w-full border-l border-slate-200 bg-white shadow-2xl lg:hidden">
              <LogsPanel logs={logs} onClose={() => setLogsOpen(false)} />
            </div>
          ) : null}
        </div>

        <BottomGuide
          statusLabel={statusLabel}
          completed={completionSent}
          creditReward={creditReward}
          activeStep={activeStep}
          guideIndex={guideIndex}
          guideLength={guide.length}
          canCreate={canCreate}
          creating={creating}
          createdAgentId={createdAgentId}
          onOpenStep={openGuideStep}
          onNextStep={() => void nextGuideStep()}
          onCreate={createAgent}
          onSync={() => void syncAgent()}
          syncing={syncing}
          canSync={Boolean(createdAgentId) && !syncing}
        />
      </main>
    </div>
  );
}

function formatApiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as {
    error?: unknown;
    message?: unknown;
  };
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message =
      typeof error.message === "string" && error.message.trim()
        ? error.message
        : fallback;
    const requestId =
      typeof error.requestId === "string" ? ` Request ${error.requestId}.` : "";
    const type =
      typeof error.type === "string" ? ` (${error.type})` : "";
    return `${message}${type}.${requestId}`.trim();
  }
  if (typeof data.message === "string") return data.message;
  return fallback;
}
