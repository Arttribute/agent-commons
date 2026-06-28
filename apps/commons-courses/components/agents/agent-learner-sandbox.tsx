"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Terminal, X } from "lucide-react";
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

type StreamEvent = {
  type?: string;
  content?: string;
  message?: string;
  toolName?: string;
  payload?: Record<string, unknown>;
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

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
  const [guideVisible, setGuideVisible] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [runActivity, setRunActivity] = useState<string | undefined>();
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(null);
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
  const [sandboxReturnUrl, setSandboxReturnUrl] = useState("");
  const googleConnectUrl = `${appUrl.replace(/\/$/, "")}/oauth/connect?provider=google_workspace&returnUrl=${encodeURIComponent(sandboxReturnUrl || "/studio/tools")}`;
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

  useEffect(() => {
    setSandboxReturnUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!activeStep || !guideVisible) {
      setHighlightRect(null);
      return;
    }

    let frameId = 0;
    let active = true;
    const primarySelector = activeStep.targetSelector?.trim() || defaultGuideSelector(activeStep.target);
    // When the drawer is closed (or the wrong panel is open), fall back to the
    // corresponding rail icon so the highlight never ends up off-screen.
    const panel = targetToPanel[activeStep.target as keyof typeof targetToPanel];
    const railSelector = panel ? `[data-sandbox-target="rail-${panel}"]` : null;

    const measure = () => {
      if (!active) return;
      const primaryEl = primarySelector ? document.querySelector(primarySelector) : null;
      let finalEl: HTMLElement | null = null;

      if (primaryEl instanceof HTMLElement) {
        const r = primaryEl.getBoundingClientRect();
        // Element is on-screen when its left edge is within the viewport
        if (r.left > -20 && r.width > 0) finalEl = primaryEl;
      }

      // Primary is off-screen (drawer closed / wrong panel) — highlight the rail icon instead
      if (!finalEl && railSelector) {
        const railEl = document.querySelector(railSelector);
        if (railEl instanceof HTMLElement) finalEl = railEl;
      }

      if (finalEl) {
        const r = finalEl.getBoundingClientRect();
        setHighlightRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setHighlightRect(null);
      }
    };

    // Poll for 600ms so the drawer slide-in animation completes before we lock position
    const startMs = performance.now();
    const tick = () => {
      if (!active) return;
      measure();
      if (performance.now() - startMs < 600) frameId = requestAnimationFrame(tick);
    };

    const onViewUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };

    const timeout = window.setTimeout(() => {
      const primaryEl = primarySelector ? document.querySelector(primarySelector) : null;
      if (primaryEl instanceof HTMLElement) {
        const r = primaryEl.getBoundingClientRect();
        if (r.left > -20) {
          primaryEl.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
      }
      frameId = requestAnimationFrame(tick);
    }, 100);

    window.addEventListener("resize", onViewUpdate);
    window.addEventListener("scroll", onViewUpdate, true);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onViewUpdate);
      window.removeEventListener("scroll", onViewUpdate, true);
    };
  }, [activeStep, guideVisible, drawerOpen, logsOpen]);

  if (introOpen && !completed) {
    return (
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
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
      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
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
    setRunActivity("Agent is starting");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    addLog({ level: "info", message: "Running the real agent..." });

    try {
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

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(formatApiError(payload, "The agent run failed."));
      }
      if (!response.body) {
        throw new Error("The agent stream did not return a readable response.");
      }

      let assistantText = "";
      const appendAssistantText = (delta: string) => {
        assistantText += delta;
        setMessages((current) => replaceLastAssistant(current, assistantText));
      };

      for await (const event of readSseEvents(response.body)) {
        if (event.type === "token" && event.content) {
          appendAssistantText(event.content);
          setRunActivity("Agent is responding");
        } else if (event.type === "toolStart") {
          const toolName = event.toolName || "tool";
          setRunActivity(`Using ${toolName}`);
          addLog({ level: "info", message: `Tool call started: ${toolName}.` });
        } else if (event.type === "toolEnd") {
          const toolName = event.toolName || "tool";
          setRunActivity("Agent is continuing");
          addLog({ level: "success", message: `Tool call finished: ${toolName}.` });
        } else if (event.type === "final") {
          const finalText = extractStreamFinalText(event);
          if (finalText && !assistantText.trim()) {
            appendAssistantText(finalText);
          }
        } else if (event.type === "error" || event.type === "failed") {
          throw new Error(event.message || "The agent run failed.");
        }
      }

      const completedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content:
            assistantText.trim() ||
            "The agent finished without returning visible text.",
        },
      ];
      setMessages(completedMessages);
      addLog({ level: "success", message: "Agent returned a live response." });
      void persistSandboxState({ messages: completedMessages, chatInput: "" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The agent run failed.";
      setMessages((current) => [
        ...current.filter((item, index) => item.content || index < current.length - 1),
        { role: "assistant", content: `Run failed: ${message}` },
      ]);
      addLog({ level: "error", message });
    } finally {
      setSending(false);
      setRunActivity(undefined);
    }
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
    const nextIndex = guideIndex + 1;
    if (nextIndex >= guide.length) {
      setGuideVisible(false);
      return;
    }
    setGuideIndex(nextIndex);
    setGuideVisible(true);
    if (createdAgentId) {
      await syncAgent("Saved changes before moving on.", { guideIndex: nextIndex });
    }
    openGuideIndex(nextIndex);
  }

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
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
              <Terminal className="h-4 w-4" />
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
            activityLabel={runActivity}
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
          guideVisible={guideVisible}
          canCreate={canCreate}
          creating={creating}
          createdAgentId={createdAgentId}
          onOpenStep={openGuideStep}
          onNextStep={() => void nextGuideStep()}
          onToggleGuide={() => setGuideVisible((v) => !v)}
          onCreate={createAgent}
          onSync={() => void syncAgent()}
          onFinish={() => void finishSandbox()}
          syncing={syncing}
          canSync={Boolean(createdAgentId) && !syncing}
          finishing={finishing}
          canFinish={Boolean(createdAgentId) && hasUserMessage && !completionSent}
        />
      </main>
      <GuideTour
        rect={highlightRect}
        step={activeStep}
        guideIndex={guideIndex}
        guideLength={guide.length}
        placement={activeStep?.placement}
        visible={guideVisible && Boolean(activeStep)}
        onNext={() => void nextGuideStep()}
        onDismiss={() => setGuideVisible(false)}
      />
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

function replaceLastAssistant(messages: ChatMessage[], content: string): ChatMessage[] {
  const next = [...messages];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index].role === "assistant") {
      next[index] = { ...next[index], content };
      return next;
    }
  }
  return [...next, { role: "assistant", content }];
}

async function* readSseEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        const event = parseSseFrame(buffer);
        if (event && event.type !== "keepalive") yield event;
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (event && event.type !== "keepalive") yield event;
    }
  }
}

function parseSseFrame(frame: string) {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}

function extractStreamFinalText(event: StreamEvent) {
  const payload = event.payload || {};
  return (
    event.content ||
    stringValue(payload.content) ||
    stringValue(payload.text) ||
    stringValue(payload.message) ||
    ""
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function defaultGuideSelector(target?: string) {
  const selectors: Record<string, string> = {
    identity: '[data-sandbox-target="agent-name"]',
    system_prompt: '[data-sandbox-target="system-prompt"]',
    skills: '[data-sandbox-target="skills"]',
    tools: '[data-sandbox-target="tools"]',
    connectors: '[data-sandbox-target="connect-google"]',
    workflows: '[data-sandbox-target="workflows"]',
    tasks: '[data-sandbox-target="first-task"]',
    chat: '[data-sandbox-target="chat-input"]',
    logs: '[data-sandbox-target="logs-panel"]',
    publish: '[data-sandbox-target="finish-sandbox"]',
  };
  return target ? selectors[target] : "";
}

function GuideTour({
  rect,
  step,
  guideIndex,
  guideLength,
  placement = "auto",
  visible,
  onNext,
  onDismiss,
}: {
  rect: HighlightRect | null;
  step?: { title: string; body: string };
  guideIndex: number;
  guideLength: number;
  placement?: "top" | "right" | "bottom" | "left" | "auto";
  visible: boolean;
  onNext: () => void;
  onDismiss: () => void;
}) {
  if (!visible || !rect || !step) return null;

  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dialogW = 216;
  const dialogH = 132;

  // On mobile the floating dialog causes clutter — just show the highlight ring.
  // Step text is already visible in the BottomGuide bar.
  const isMobile = vw < 640;

  // Keep the dialog above the chat input row so it never covers the Send button
  // or the message input. Query the actual send button position at render time.
  const sendEl = document.querySelector('[data-sandbox-target="send-button"]');
  const safeBottom =
    sendEl instanceof HTMLElement ? sendEl.getBoundingClientRect().top - 8 : vh - 70;

  // Prefer side placement (right → left) to avoid covering the focused element
  // above or below. Fall back to bottom/top only when there truly is no side room.
  const resolved: "top" | "right" | "bottom" | "left" =
    placement === "auto"
      ? rect.left + rect.width + gap + dialogW <= vw
        ? "right"
        : rect.left - gap - dialogW >= 0
          ? "left"
          : rect.top + rect.height + gap + dialogH <= safeBottom
            ? "bottom"
            : "top"
      : placement;

  const style = isMobile ? {} : tourDialogStyle(rect, resolved, gap, dialogW, dialogH, vw, safeBottom);
  const isLast = guideIndex + 1 >= guideLength;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Highlight ring only — no dark backdrop */}
      <div
        className="pointer-events-none absolute rounded-lg border-2 border-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]"
        style={{
          top: rect.top - 5,
          left: rect.left - 5,
          width: rect.width + 10,
          height: rect.height + 10,
        }}
      />
      {/* Floating tooltip — desktop only */}
      {!isMobile ? (
        <div
          className="pointer-events-auto absolute overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950 shadow-xl"
          style={{ ...style, width: dialogW }}
        >
          <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {guideIndex + 1} / {guideLength}
            </span>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Hide guide"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="px-3 pb-0 pt-1.5">
            <p className="text-sm font-bold leading-snug">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.body}</p>
          </div>
          <div className="flex items-center justify-end px-3 py-2.5">
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
            >
              {isLast ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function tourDialogStyle(
  rect: HighlightRect,
  placement: "top" | "right" | "bottom" | "left",
  gap: number,
  dialogW: number,
  dialogH: number,
  vw: number,
  safeBottom: number
) {
  const clampX = (v: number) => Math.max(12, Math.min(v, vw - dialogW - 12));
  // Never let the dialog's bottom edge reach the chat input / send button row
  const clampY = (v: number) => Math.max(12, Math.min(v, safeBottom - dialogH));
  const cx = rect.left + rect.width / 2 - dialogW / 2;
  const cy = rect.top + rect.height / 2 - dialogH / 2;
  if (placement === "top") return { left: clampX(cx), top: clampY(rect.top - dialogH - gap) };
  if (placement === "right") return { left: clampX(rect.left + rect.width + gap), top: clampY(cy) };
  if (placement === "left") return { left: clampX(rect.left - dialogW - gap), top: clampY(cy) };
  return { left: clampX(cx), top: clampY(rect.top + rect.height + gap) };
}
