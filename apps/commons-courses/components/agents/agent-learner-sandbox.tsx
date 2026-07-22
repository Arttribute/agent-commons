"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { ExternalLink, Loader2 as SandboxLoader, X } from "lucide-react";
import { ChatSurface } from "./agent-sandbox/chat-surface";
import {
  ComputerPanel,
  IdentityPanel,
  MemoryPanel,
  SkillsPanel,
  TasksPanel,
  ToolsPanel,
  WorkflowPanel,
} from "./agent-sandbox/config-panels";
import { ConfigDrawer, ConfigRail } from "./agent-sandbox/config-shell";
import { BottomGuide } from "./agent-sandbox/bottom-guide";
import { LogsPanel } from "./agent-sandbox/logs-panel";
import {
  SandboxCompletion,
  SandboxIntro,
} from "./agent-sandbox/sandbox-framing";
import { formatApiError } from "./agent-sandbox/status-utils";
import type {
  ChatMessage,
  ConfigPanel,
  ReviewResult,
  SandboxLog,
  SandboxResumeState,
  SandboxSection,
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
  courseTitle?: string;
  challengeTitle?: string;
  onComplete: (payload: {
    agentId?: string;
    simulated: boolean;
    creditReward: number;
  }) => void;
  onContinue?: () => void;
  onExit?: () => void;
};

export function AgentLearnerSandbox({
  courseSlug,
  challengeId,
  config,
  completed,
  authenticated,
  signInHref,
  courseTitle,
  challengeTitle,
  onComplete,
  onContinue,
  onExit,
}: Props) {
  const [introOpen, setIntroOpen] = useState(Boolean(config.intro?.enabled));
  const [agentName, setAgentName] = useState(config.starterAgent?.name || "");
  const [persona, setPersona] = useState(config.starterAgent?.persona || "");
  const [systemPrompt, setSystemPrompt] = useState(
    config.starterAgent?.systemPrompt || "",
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    config.starterSkillIds ??
      (config.skillTemplates || []).slice(0, 1).map((skill) => skill.id),
  );
  const [skillInstructions, setSkillInstructions] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      (config.skillTemplates || []).map((skill) => [
        skill.id,
        skill.instructions,
      ]),
    ),
  );
  const [selectedTools, setSelectedTools] = useState<string[]>(
    config.starterToolIds ??
      (config.toolTemplates || []).slice(0, 1).map((tool) => tool.id),
  );
  const [selectedTasks, setSelectedTasks] = useState<string[]>(
    config.starterTaskIds ??
      (config.taskTemplates || []).slice(0, 1).map((task) => task.id),
  );
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(
    config.workflowTemplates?.[0]?.id || "",
  );
  const [workflowResult, setWorkflowResult] = useState<string[]>([]);
  const [memoryEntries, setMemoryEntries] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (config.memoryTemplates || []).map((memory) => [
          memory.id,
          memory.content,
        ]),
      ),
  );
  const [computerCommand, setComputerCommand] = useState(
    config.computerTemplate?.starterCommand || "ls",
  );
  const [computerOutput, setComputerOutput] = useState("");
  const [taskTitle, setTaskTitle] = useState("Plan a realistic study week");
  const [activePanel, setActivePanel] = useState<SandboxSection>(() =>
    firstSandboxSection(config),
  );
  // True while we check the server for a previously-saved sandbox state.
  // Prevents flashing the intro screen before we know whether to skip it.
  const [sandboxLoading, setSandboxLoading] = useState(authenticated);
  const [guideIndex, setGuideIndex] = useState(0);
  const [guideVisible, setGuideVisible] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [runActivity, setRunActivity] = useState<string | undefined>();
  const [highlightRect, setHighlightRect] = useState<HighlightRect | null>(
    null,
  );
  const highlightedElementRef = useRef<{
    element: HTMLElement;
    boxShadow: string;
    position: string;
    zIndex: string;
    borderRadius: string;
    outline: string;
    outlineOffset: string;
  } | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewResult>>({});
  const [createdAgentId, setCreatedAgentId] = useState<string | undefined>();
  const [completionSent, setCompletionSent] = useState(completed);
  const [creditReward, setCreditReward] = useState(config.creditReward || 0);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<SandboxLog[]>([
    {
      level: "info",
      message:
        "Configure the agent, create it in Agent Commons, then test it here.",
    },
  ]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const visibleSections = useMemo(() => sandboxSections(config), [config]);
  const guide = useMemo(
    () =>
      (config.guideSteps || []).filter((step) => {
        const section = targetToPanel[step.target];
        return !section || visibleSections.includes(section);
      }),
    [config.guideSteps, visibleSections],
  );
  const activeStep = guide[guideIndex];
  const visibleCapabilities = useMemo(
    () => new Set(config.capabilities || []),
    [config.capabilities],
  );
  const reviewTargets = config.review?.enabled
    ? config.review.targets || []
    : [];
  const promptReviewPassed =
    config.review?.required === false ||
    !reviewTargets.includes("system_prompt") ||
    reviews.system_prompt?.passed;
  const needsGoogleConnection = selectedTools.some((toolId) => {
    const tool = config.toolTemplates?.find((item) => item.id === toolId);
    return (
      tool?.connectorKind?.startsWith("google_") ||
      tool?.connectorKind === "gmail"
    );
  });
  const appUrl =
    process.env.NEXT_PUBLIC_AGENT_COMMONS_APP_URL ||
    "https://www.agentcommons.io";
  const [sandboxReturnUrl, setSandboxReturnUrl] = useState("");
  const googleConnectUrl = `${appUrl.replace(/\/$/, "")}/oauth/connect?provider=google_workspace&returnUrl=${encodeURIComponent(sandboxReturnUrl || "/studio/tools")}`;
  const agentStudioUrl = createdAgentId
    ? `${appUrl.replace(/\/$/, "")}/studio/agents/${createdAgentId}`
    : "";

  const canCreate =
    agentName.trim().length > 1 &&
    systemPrompt.trim().length > 40 &&
    promptReviewPassed;

  const hasUserMessage = messages.some((message) => message.role === "user");
  const requiredCapabilities = (config.requiredCapabilities || []).filter(
    (capability) => visibleCapabilities.has(capability),
  );
  const unmetRequirements = requiredCapabilities.filter((capability) => {
    if (capability === "identity") return agentName.trim().length <= 1;
    if (capability === "system_prompt") return systemPrompt.trim().length <= 40;
    if (capability === "skills") return selectedSkills.length === 0;
    if (capability === "tools" || capability === "connectors") {
      return selectedTools.length === 0;
    }
    if (capability === "tasks") return selectedTasks.length === 0;
    if (capability === "workflows") return workflowResult.length === 0;
    if (capability === "memory") {
      return !Object.values(memoryEntries).some((entry) => entry.trim());
    }
    if (capability === "computer") return !computerOutput.trim();
    if (capability === "chat") return !hasUserMessage;
    if (capability === "logs") return logs.length <= 1;
    return false;
  });
  const statusLabel = useMemo(() => {
    if (completionSent) return "Completed";
    if (!createdAgentId) {
      return !promptReviewPassed
        ? "System prompt review required"
        : "Create the agent in Agent Commons";
    }
    if (unmetRequirements.length) {
      return `${unmetRequirements.length} required workspace step${unmetRequirements.length === 1 ? "" : "s"} remaining`;
    }
    return "Agent is ready to finish";
  }, [
    completionSent,
    createdAgentId,
    promptReviewPassed,
    unmetRequirements.length,
  ]);

  useEffect(() => {
    if (!authenticated) {
      setSandboxLoading(false);
      return;
    }
    let cancelled = false;
    async function loadSandboxState() {
      try {
        const response = await fetch(
          `/api/skills/${courseSlug}/sandbox?challengeId=${encodeURIComponent(challengeId)}`,
        ).catch(() => null);
        if (!response?.ok) return;
        const payload = (await response.json().catch(() => ({}))) as {
          state?: SandboxResumeState | null;
        };
        if (cancelled || !payload.state) return;
        applySandboxState(payload.state);
      } finally {
        if (!cancelled) setSandboxLoading(false);
      }
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
      clearGuideHighlight(highlightedElementRef);
      setHighlightRect(null);
      return;
    }

    let frameId = 0;
    let active = true;
    const primarySelector =
      activeStep.targetSelector?.trim() ||
      defaultGuideSelector(activeStep.target);
    const panel =
      targetToPanel[activeStep.target as keyof typeof targetToPanel];
    const railSelector = panel ? `[data-sandbox-target="rail-${panel}"]` : null;

    // Use React state — not CSS position — to decide whether the primary element is
    // currently accessible. This avoids a flicker on load where getBoundingClientRect
    // fires before the CSS transform is applied and returns a stale on-screen position.
    const primaryIsVisible = !panel || activePanel === panel;

    const measure = () => {
      if (!active) return;
      let finalEl: HTMLElement | null = null;

      if (primaryIsVisible) {
        const el = primarySelector
          ? document.querySelector(primarySelector)
          : null;
        if (el instanceof HTMLElement && el.getBoundingClientRect().width > 0)
          finalEl = el;
      }

      // Drawer is closed or showing a different panel — highlight the rail icon instead
      if (!finalEl && railSelector) {
        const el = document.querySelector(railSelector);
        if (el instanceof HTMLElement) finalEl = el;
      }

      applyGuideHighlight(finalEl, highlightedElementRef);

      if (finalEl) {
        const r = finalEl.getBoundingClientRect();
        const isInViewport =
          r.bottom > 0 &&
          r.right > 0 &&
          r.top < window.innerHeight &&
          r.left < window.innerWidth;
        setHighlightRect(
          isInViewport
            ? { top: r.top, left: r.left, width: r.width, height: r.height }
            : null,
        );
      } else {
        clearGuideHighlight(highlightedElementRef);
        setHighlightRect(null);
      }
    };

    // When the primary element is NOT accessible, snap the rail icon highlight
    // into place immediately — no timeout — so there is zero flicker on load.
    if (!primaryIsVisible) measure();

    // Poll for 600ms so the drawer slide-in animation fully settles before locking position
    const startMs = performance.now();
    const tick = () => {
      if (!active) return;
      measure();
      if (performance.now() - startMs < 600)
        frameId = requestAnimationFrame(tick);
    };

    const onViewUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };

    const timeout = window.setTimeout(() => {
      if (primaryIsVisible) {
        const el = primarySelector
          ? document.querySelector(primarySelector)
          : null;
        if (el instanceof HTMLElement) {
          el.scrollIntoView({
            block: "nearest",
            inline: "nearest",
            behavior: "smooth",
          });
        }
      }
      frameId = requestAnimationFrame(tick);
    }, 100);

    window.addEventListener("resize", onViewUpdate);
    window.addEventListener("scroll", onViewUpdate, true);

    return () => {
      active = false;
      clearGuideHighlight(highlightedElementRef);
      window.clearTimeout(timeout);
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onViewUpdate);
      window.removeEventListener("scroll", onViewUpdate, true);
    };
  }, [activeStep, guideVisible, activePanel]);

  // Hold the correct screen until server state is known — prevents the intro
  // screen from flashing before we discover the user already has a saved agent.
  if (sandboxLoading) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-white">
        <SandboxLoader className="h-5 w-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (introOpen && !completed) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-white text-slate-950">
        <SandboxIntro
          intro={config.intro}
          title={config.title}
          brief={config.brief}
          onStart={startSandboxInteraction}
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
    addLog({
      level: "info",
      message: "Creating a real Agent Commons agent...",
    });

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
          tasks: selectedTasks,
          workflowId: selectedWorkflowId,
          memoryEntries,
          computerCommand,
          computerOutput,
          taskTitle,
          message: chatInput,
        },
        sandboxState: buildSandboxState(),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setCreating(false);

    if (!response.ok || !payload.agentId || payload.simulated) {
      addLog({
        level: "error",
        message: formatApiError(
          payload,
          "Agent Commons did not create a real agent. The lesson cannot continue with a mock agent.",
        ),
      });
      return;
    }

    setCreatedAgentId(payload.agentId);
    setCreditReward(payload.creditReward || config.creditReward || 0);
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
    statePatch?: Partial<SandboxResumeState>,
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
          tasks: selectedTasks,
          workflowId: selectedWorkflowId,
          memoryEntries,
          computerCommand,
          computerOutput,
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
          "Could not save this agent change yet.",
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

    const userMessage: ChatMessage = {
      role: "user",
      content: chatInput.trim(),
    };
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
          addLog({
            level: "success",
            message: `Tool call finished: ${toolName}.`,
          });
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
      const message =
        error instanceof Error ? error.message : "The agent run failed.";
      setMessages((current) => [
        ...current.filter(
          (item, index) => item.content || index < current.length - 1,
        ),
        { role: "assistant", content: `Run failed: ${message}` },
      ]);
      addLog({ level: "error", message });
    } finally {
      setSending(false);
      setRunActivity(undefined);
    }
  }

  async function finishSandbox() {
    if (
      requireAuth() ||
      finishing ||
      !createdAgentId ||
      unmetRequirements.length > 0
    ) {
      return;
    }
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
                `${skill.name}\n${skillInstructions[skill.id] || skill.instructions}`,
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

  function startSandboxInteraction() {
    setIntroOpen(false);
    setGuideIndex(0);
    setGuideVisible(true);
    openGuideIndex(0);
  }

  function openGuideIndex(index: number) {
    const step = guide[index];
    const panel = step?.target ? targetToPanel[step.target] : undefined;
    if (panel && visibleSections.includes(panel)) {
      setActivePanel(panel);
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
      await syncAgent("Saved changes before moving on.", {
        guideIndex: nextIndex,
      });
    }
    openGuideIndex(nextIndex);
  }

  async function previousGuideStep() {
    const nextIndex = Math.max(guideIndex - 1, 0);
    setGuideIndex(nextIndex);
    setGuideVisible(true);
    if (createdAgentId) {
      await syncAgent("Saved changes before moving back.", {
        guideIndex: nextIndex,
      });
    }
    openGuideIndex(nextIndex);
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-white text-slate-950">
      <ConfigRail
        sections={visibleSections}
        activeSection={activePanel}
        agentName={agentName}
        courseTitle={courseTitle}
        challengeTitle={challengeTitle || config.title}
        completed={completionSent}
        onOpenSection={setActivePanel}
        onExit={onExit}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {activePanel === "chat" ? (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <WorkspaceHeader
                title="New session"
                subtitle="Create the agent, then test it through a live Agent Commons session."
                agentStudioUrl={agentStudioUrl}
              />
              <ChatSurface
                messages={messages}
                sending={sending}
                chatInput={chatInput}
                createdAgentId={createdAgentId}
                agentName={agentName}
                brief={config.brief}
                chatEndRef={chatEndRef}
                activityLabel={runActivity}
                placeholder={config.placeholders?.chatInput}
                onInputChange={setChatInput}
                onSend={sendMessage}
              />
            </section>
          ) : activePanel === "logs" ? (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <WorkspaceHeader
                title="Observability"
                subtitle="Inspect agent, tool, and sandbox activity as you work."
                agentStudioUrl={agentStudioUrl}
              />
              <LogsPanel logs={logs} showHeader={false} />
            </section>
          ) : (
            <div className="min-h-0 min-w-0 flex-1">
              <ConfigDrawer panel={activePanel as ConfigPanel}>
                {renderConfigPanel()}
              </ConfigDrawer>
            </div>
          )}
          {completionSent ? (
            <div className="pointer-events-auto absolute inset-x-3 top-3 z-30 sm:inset-x-auto sm:right-3 sm:w-80">
              <SandboxCompletion
                completion={config.completion}
                creditReward={
                  visibleCapabilities.has("credits") ? creditReward : 0
                }
                onContinue={onContinue}
              />
            </div>
          ) : null}
        </div>

        <BottomGuide
          statusLabel={statusLabel}
          completed={completionSent}
          creditReward={visibleCapabilities.has("credits") ? creditReward : 0}
          activeStep={activeStep}
          guideIndex={guideIndex}
          guideLength={guide.length}
          guideVisible={guideVisible}
          canCreate={canCreate}
          creating={creating}
          createdAgentId={createdAgentId}
          onOpenStep={openGuideStep}
          onPreviousStep={() => void previousGuideStep()}
          onNextStep={() => void nextGuideStep()}
          onToggleGuide={() => setGuideVisible((v) => !v)}
          onCreate={createAgent}
          onSync={() => void syncAgent()}
          onFinish={() => void finishSandbox()}
          syncing={syncing}
          canSync={Boolean(createdAgentId) && !syncing}
          finishing={finishing}
          canFinish={
            Boolean(createdAgentId) &&
            unmetRequirements.length === 0 &&
            !completionSent
          }
        />
      </main>
      <GuideTour
        rect={highlightRect}
        step={activeStep}
        guideIndex={guideIndex}
        guideLength={guide.length}
        placement={activeStep?.placement}
        visible={guideVisible && Boolean(activeStep)}
        onPrevious={() => void previousGuideStep()}
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
          showIdentity={visibleCapabilities.has("identity")}
          showSystemPrompt={visibleCapabilities.has("system_prompt")}
          placeholders={config.placeholders}
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
          placeholder={config.placeholders?.skillInstructions}
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
          onAddSkill={(value) => {
            const id = `custom-skill-${Date.now()}`;
            setSkillInstructions((current) => ({
              ...current,
              [id]: value.trim(),
            }));
            setSelectedSkills([id]);
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
    if (activePanel === "tasks") {
      return (
        <TasksPanel
          tasks={config.taskTemplates || []}
          selected={selectedTasks}
          onChange={setSelectedTasks}
        />
      );
    }
    if (activePanel === "workflows") {
      return (
        <WorkflowPanel
          workflows={config.workflowTemplates || []}
          selectedId={selectedWorkflowId}
          result={workflowResult}
          onSelect={setSelectedWorkflowId}
          onRun={runWorkflowSimulation}
        />
      );
    }
    if (activePanel === "memory") {
      return (
        <MemoryPanel
          memories={config.memoryTemplates || []}
          entries={memoryEntries}
          onChange={(id, value) =>
            setMemoryEntries((current) => ({ ...current, [id]: value }))
          }
        />
      );
    }
    if (activePanel === "computer") {
      return (
        <ComputerPanel
          template={config.computerTemplate}
          command={computerCommand}
          output={computerOutput}
          onCommandChange={setComputerCommand}
          onRun={runComputerCommand}
        />
      );
    }
    return null;
  }

  function runWorkflowSimulation() {
    const workflow =
      config.workflowTemplates?.find(
        (item) => item.id === selectedWorkflowId,
      ) || config.workflowTemplates?.[0];
    if (!workflow) return;
    const lines = [
      `trigger -> ${workflow.trigger}`,
      ...workflow.nodes.map((node, index) => `node ${index + 1} -> ${node}`),
      ...workflow.edges.map((edge, index) => `edge ${index + 1} -> ${edge}`),
      "simulation -> completed inside the learning sandbox",
    ];
    setWorkflowResult(lines);
    addLog({
      level: "success",
      message: `Simulated workflow: ${workflow.name}.`,
    });
  }

  function runComputerCommand() {
    const files = config.computerTemplate?.files || [];
    const command =
      computerCommand.trim() || config.computerTemplate?.starterCommand || "ls";
    let output = "";
    if (command === "ls" || command === "ls .") {
      output =
        files.map((file) => file.path).join("\n") || "workspace is empty";
    } else if (["run team", "node runtime.js", "npm start"].includes(command)) {
      const workflow =
        config.workflowTemplates?.find(
          (item) => item.id === selectedWorkflowId,
        ) || config.workflowTemplates?.[0];
      const selectedRoleNames = (config.skillTemplates || [])
        .filter((skill) => selectedSkills.includes(skill.id))
        .map((skill) => skill.name);
      const selectedTaskNames = (config.taskTemplates || [])
        .filter((task) => selectedTasks.includes(task.id))
        .map((task) => task.title);
      const memoryLabels = (config.memoryTemplates || [])
        .filter((memory) => memoryEntries[memory.id]?.trim())
        .map((memory) => memory.label);
      output = [
        "$ run team",
        `workspace: /${config.computerTemplate?.workspaceName || "sandbox-workspace"}`,
        `architecture: ${workflow?.name || "Learner-defined multi-agent workflow"}`,
        `roles: ${selectedRoleNames.join(", ") || "No focused roles selected"}`,
        `scheduled tasks: ${selectedTaskNames.join(", ") || "No routine selected"}`,
        `shared memory records: ${memoryLabels.join(", ") || "No memory records"}`,
        "1. Lead agent receives the shared goal.",
        "2. Focused agents work in separate contexts.",
        "3. Useful results move through the workflow.",
        "4. The lead agent combines the result and asks for review.",
        "simulation -> completed inside the lightweight learning runtime",
      ].join("\n");
    } else if (command.startsWith("cat ")) {
      const target = command.slice(4).trim();
      const file = files.find((item) => item.path === target);
      output =
        file?.content || `cat: ${target}: no such file in sandbox workspace`;
    } else if (command === "pwd") {
      output = `/${config.computerTemplate?.workspaceName || "sandbox-workspace"}`;
    } else {
      output = [
        `$ ${command}`,
        "Command accepted by the lightweight sandbox runtime.",
        "This practice environment is scoped and simulated for learning.",
      ].join("\n");
    }
    setComputerOutput(output);
    addLog({
      level: "success",
      message: `Ran lightweight computer command: ${command}.`,
    });
  }

  function buildSandboxState(
    patch: Partial<SandboxResumeState> = {},
  ): SandboxResumeState {
    return {
      agentName,
      persona,
      systemPrompt,
      selectedSkills,
      skillInstructions,
      selectedTools,
      selectedTasks,
      selectedWorkflowId,
      workflowResult,
      memoryEntries,
      computerCommand,
      computerOutput,
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
    if (state.selectedTasks) setSelectedTasks(state.selectedTasks);
    if (typeof state.selectedWorkflowId === "string") {
      setSelectedWorkflowId(state.selectedWorkflowId);
    }
    if (state.workflowResult) setWorkflowResult(state.workflowResult);
    if (state.memoryEntries) setMemoryEntries(state.memoryEntries);
    if (typeof state.computerCommand === "string") {
      setComputerCommand(state.computerCommand);
    }
    if (typeof state.computerOutput === "string") {
      setComputerOutput(state.computerOutput);
    }
    if (state.taskTitle) setTaskTitle(state.taskTitle);
    if (state.activePanel && visibleSections.includes(state.activePanel)) {
      setActivePanel(state.activePanel);
    }
    if (typeof state.guideIndex === "number") setGuideIndex(state.guideIndex);
    if (state.createdAgentId) {
      setCreatedAgentId(state.createdAgentId);
      setIntroOpen(false);
    }
    if (typeof state.completionSent === "boolean") {
      setCompletionSent(state.completionSent || completed);
    }
    if (typeof state.creditReward === "number")
      setCreditReward(state.creditReward);
    if (typeof state.chatInput === "string") setChatInput(state.chatInput);
    if (state.messages?.length) setMessages(state.messages);
    if (state.logs?.length) setLogs(state.logs);
    if (state.reviews) setReviews(state.reviews);
  }
}

function WorkspaceHeader({
  title,
  subtitle,
  agentStudioUrl,
}: {
  title: string;
  subtitle: string;
  agentStudioUrl?: string;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-medium tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="mt-1 hidden truncate text-sm text-slate-500 sm:block">
          {subtitle}
        </p>
      </div>
      {agentStudioUrl ? (
        <a
          href={agentStudioUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Open in Agent Commons</span>
          <span className="sm:hidden">Open</span>
        </a>
      ) : null}
    </header>
  );
}

const sandboxSectionOrder: SandboxSection[] = [
  "identity",
  "chat",
  "computer",
  "tasks",
  "tools",
  "skills",
  "workflows",
  "memory",
  "logs",
];

function sandboxSections(config: AgentSandboxConfig): SandboxSection[] {
  const capabilities = new Set(config.capabilities || []);
  const visible = sandboxSectionOrder.filter((section) => {
    if (section === "identity") {
      return capabilities.has("identity") || capabilities.has("system_prompt");
    }
    if (section === "tools") {
      return capabilities.has("tools") || capabilities.has("connectors");
    }
    return capabilities.has(section);
  });
  return visible.length ? visible : ["identity"];
}

function firstSandboxSection(config: AgentSandboxConfig): SandboxSection {
  return sandboxSections(config)[0];
}

function replaceLastAssistant(
  messages: ChatMessage[],
  content: string,
): ChatMessage[] {
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
    tools: '[data-sandbox-target="tool-google-calendar"]',
    connectors: '[data-sandbox-target="connect-google"]',
    workflows: '[data-sandbox-target="workflows"]',
    tasks: '[data-sandbox-target="tasks"]',
    memory: '[data-sandbox-target="memory"]',
    computer: '[data-sandbox-target="computer"]',
    chat: '[data-sandbox-target="chat-input"]',
    logs: '[data-sandbox-target="logs-panel"]',
    publish: '[data-sandbox-target="finish-sandbox"]',
  };
  return target ? selectors[target] : "";
}

function applyGuideHighlight(
  element: HTMLElement | null,
  ref: MutableRefObject<{
    element: HTMLElement;
    boxShadow: string;
    position: string;
    zIndex: string;
    borderRadius: string;
    outline: string;
    outlineOffset: string;
  } | null>,
) {
  if (!element) {
    clearGuideHighlight(ref);
    return;
  }
  if (ref.current?.element === element) return;
  clearGuideHighlight(ref);
  ref.current = {
    element,
    boxShadow: element.style.boxShadow,
    position: element.style.position,
    zIndex: element.style.zIndex,
    borderRadius: element.style.borderRadius,
    outline: element.style.outline,
    outlineOffset: element.style.outlineOffset,
  };
  if (getComputedStyle(element).position === "static") {
    element.style.position = "relative";
  }
  element.style.zIndex = element.style.zIndex || "1";
  element.style.borderRadius = element.style.borderRadius || "0.75rem";
  element.style.outline = "2px solid rgba(14,165,233,0.95)";
  element.style.outlineOffset = "2px";
  element.style.boxShadow = "0 0 0 5px rgba(14,165,233,0.14)";
}

function clearGuideHighlight(
  ref: MutableRefObject<{
    element: HTMLElement;
    boxShadow: string;
    position: string;
    zIndex: string;
    borderRadius: string;
    outline: string;
    outlineOffset: string;
  } | null>,
) {
  const current = ref.current;
  if (!current) return;
  current.element.style.boxShadow = current.boxShadow;
  current.element.style.position = current.position;
  current.element.style.zIndex = current.zIndex;
  current.element.style.borderRadius = current.borderRadius;
  current.element.style.outline = current.outline;
  current.element.style.outlineOffset = current.outlineOffset;
  ref.current = null;
}

function GuideTour({
  rect,
  step,
  guideIndex,
  guideLength,
  placement = "auto",
  visible,
  onPrevious,
  onNext,
  onDismiss,
}: {
  rect: HighlightRect | null;
  step?: { title: string; body: string };
  guideIndex: number;
  guideLength: number;
  placement?: "top" | "right" | "bottom" | "left" | "auto";
  visible: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onDismiss: () => void;
}) {
  if (!visible || !rect || !step) return null;
  if (typeof window === "undefined") return null;

  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dialogW = 216;
  const dialogH = 132;

  const isMobile = vw < 640;

  // Keep the dialog above the chat input row so it never covers the Send button
  // or the message input. Query the actual send button position at render time.
  const sendEl = document.querySelector('[data-sandbox-target="send-button"]');
  const safeBottom =
    sendEl instanceof HTMLElement
      ? sendEl.getBoundingClientRect().top - 8
      : vh - 70;

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

  const style = isMobile
    ? {}
    : tourDialogStyle(rect, resolved, gap, dialogW, dialogH, vw, safeBottom);
  const isLast = guideIndex + 1 >= guideLength;

  if (isMobile) {
    return (
      <div className="pointer-events-none fixed inset-x-3 bottom-[82px] z-50">
        <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 p-3 text-slate-950 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3">
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
          <p className="mt-1.5 text-sm font-bold leading-snug">{step.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {step.body}
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onPrevious}
              disabled={guideIndex === 0}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-35"
            >
              Back
            </button>
            <button
              type="button"
              onClick={isLast ? onDismiss : onNext}
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
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
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {step.body}
          </p>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <button
            type="button"
            onClick={onPrevious}
            disabled={guideIndex === 0}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 disabled:opacity-35"
          >
            Back
          </button>
          <button
            type="button"
            onClick={isLast ? onDismiss : onNext}
            className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
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
  safeBottom: number,
) {
  const clampX = (v: number) => Math.max(12, Math.min(v, vw - dialogW - 12));
  // Never let the dialog's bottom edge reach the chat input / send button row
  const clampY = (v: number) => Math.max(12, Math.min(v, safeBottom - dialogH));
  const cx = rect.left + rect.width / 2 - dialogW / 2;
  const cy = rect.top + rect.height / 2 - dialogH / 2;
  if (placement === "top")
    return { left: clampX(cx), top: clampY(rect.top - dialogH - gap) };
  if (placement === "right")
    return { left: clampX(rect.left + rect.width + gap), top: clampY(cy) };
  if (placement === "left")
    return { left: clampX(rect.left - dialogW - gap), top: clampY(cy) };
  return { left: clampX(cx), top: clampY(rect.top + rect.height + gap) };
}
