"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { SandboxCompletion, SandboxIntro } from "./agent-sandbox/sandbox-framing";
import { formatApiError, logDotClass } from "./agent-sandbox/status-utils";
import type {
  ChatMessage,
  ConfigPanel,
  ReviewResult,
  SandboxLog,
  SandboxResumeState,
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
  onContinue?: () => void;
};

export function AgentLearnerSandbox({
  courseSlug,
  challengeId,
  config,
  completed,
  authenticated,
  signInHref,
  onComplete,
  onContinue,
}: Props) {
  const [introOpen, setIntroOpen] = useState(Boolean(config.intro?.enabled));
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
  const [finishing, setFinishing] = useState(false);
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
  const lastLog = logs[0];
  const hasUserMessage = messages.some((message) => message.role === "user");

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    async function loadSandboxState() {
      const response = await fetch(
        `/api/skills/${courseSlug}/sandbox?challengeId=${encodeURIComponent(challengeId)}`
      ).catch(() => null);
      if (!response?.ok) return;
      const payload = (await response.json().catch(() => ({}))) as {
        state?: SandboxResumeState | null;
      };
      if (cancelled || !payload.state) return;
      applySandboxState(payload.state);
    }
    void loadSandboxState();
    return () => {
      cancelled = true;
    };
  // State setters are stable; this should only reload when the sandbox identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, challengeId, courseSlug]);

  if (introOpen && !completed) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
        <SandboxIntro
          intro={config.intro}
          title={config.title}
          brief={config.brief}
          onStart={() => setIntroOpen(false)}
        />
      </div>
    );
  }

  if (completionSent) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
        <SandboxCompletion
          completion={config.completion}
          creditReward={creditReward}
          onContinue={onContinue}
        />
      </div>
    );
  }

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
    const createdMessages: ChatMessage[] = [
      {
        role: "assistant",
        content:
          "Agent created in Agent Commons. Send a message to test the live agent.",
      },
    ];

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
        sandboxState: buildSandboxState({ messages: createdMessages }),
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
    setMessages(createdMessages);
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

  async function syncAgent(
    reason = "Saved agent changes.",
    statePatch?: Partial<SandboxResumeState>
  ) {
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
        sandboxState: buildSandboxState(statePatch),
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
    const completedMessages: ChatMessage[] = [
      ...nextMessages,
      { role: "assistant", content: assistantText },
    ];
    setMessages(completedMessages);
    addLog({ level: "success", message: "Agent returned a live response." });
    void persistSandboxState({ messages: completedMessages, chatInput: "" });
    requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ block: "end" }));
  }

  async function finishSandbox() {
    if (requireAuth() || finishing || !createdAgentId || !hasUserMessage) return;
    setFinishing(true);
    await syncAgent("Saved final sandbox state.", { completionSent: true });
    setCompletionSent(true);
    onComplete({
      agentId: createdAgentId,
      simulated: false,
      creditReward,
    });
    setFinishing(false);
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
    setGuideIndex(nextIndex);
    if (createdAgentId) {
      await syncAgent("Saved changes before moving on.", { guideIndex: nextIndex });
    }
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
              className="relative rounded-lg border border-slate-200 p-2 text-slate-600"
              aria-label="Toggle logs"
            >
              <PanelRight className="h-4 w-4" />
              {lastLog ? (
                <span
                  className={logDotClass(lastLog.level)}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <ConfigDrawer
            open={drawerOpen}
            panel={activePanel}
            onClose={() => setDrawerOpen(false)}
          >
            {renderConfigPanel()}
          </ConfigDrawer>
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
            <aside className="hidden min-h-0 w-72 shrink-0 overflow-hidden border-l border-slate-200 bg-white lg:block">
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
          onFinish={() => void finishSandbox()}
          syncing={syncing}
          canSync={Boolean(createdAgentId) && !syncing}
          finishing={finishing}
          canFinish={Boolean(createdAgentId) && hasUserMessage && !completionSent}
        />
      </main>
    </div>
  );

  function renderConfigPanel() {
    if (activePanel === "identity") {
      return (
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
      );
    }
    if (activePanel === "skills") {
      return (
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
      );
    }
    if (activePanel === "tools") {
      return (
        <ToolsPanel
          tools={config.toolTemplates || []}
          selected={selectedTools}
          onChange={setSelectedTools}
          googleConnectUrl={googleConnectUrl}
        />
      );
    }
    return <WorkflowPanel taskTitle={taskTitle} onTaskChange={setTaskTitle} />;
  }

  function buildSandboxState(
    patch: Partial<SandboxResumeState> = {}
  ): SandboxResumeState {
    return {
      agentName,
      persona,
      systemPrompt,
      selectedSkills,
      skillInstructions,
      selectedTools,
      taskTitle,
      activePanel,
      guideIndex,
      createdAgentId,
      completionSent,
      creditReward,
      chatInput,
      messages,
      logs,
      reviews,
      ...patch,
    };
  }

  async function persistSandboxState(patch: Partial<SandboxResumeState> = {}) {
    if (!createdAgentId) return;
    await syncAgent("Saved sandbox progress.", patch);
  }

  function applySandboxState(state: SandboxResumeState) {
    if (state.agentName) setAgentName(state.agentName);
    if (state.persona) setPersona(state.persona);
    if (state.systemPrompt) setSystemPrompt(state.systemPrompt);
    if (state.selectedSkills) setSelectedSkills(state.selectedSkills);
    if (state.skillInstructions) setSkillInstructions(state.skillInstructions);
    if (state.selectedTools) setSelectedTools(state.selectedTools);
    if (state.taskTitle) setTaskTitle(state.taskTitle);
    if (state.activePanel) setActivePanel(state.activePanel);
    if (typeof state.guideIndex === "number") setGuideIndex(state.guideIndex);
    if (state.createdAgentId) {
      setCreatedAgentId(state.createdAgentId);
      setIntroOpen(false);
    }
    if (typeof state.completionSent === "boolean") {
      setCompletionSent(state.completionSent || completed);
    }
    if (typeof state.creditReward === "number") setCreditReward(state.creditReward);
    if (typeof state.chatInput === "string") setChatInput(state.chatInput);
    if (state.messages?.length) setMessages(state.messages);
    if (state.logs?.length) setLogs(state.logs);
    if (state.reviews) setReviews(state.reviews);
  }
}
