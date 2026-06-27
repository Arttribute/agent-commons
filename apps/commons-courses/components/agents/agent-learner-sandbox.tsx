"use client";

import { useMemo, useRef, useState } from "react";
import { ExternalLink, PanelRight } from "lucide-react";
import { ChatSurface } from "./agent-sandbox/chat-surface";
import {
  IdentityPanel,
  PromptPanel,
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
  const [selectedTools, setSelectedTools] = useState<string[]>(
    (config.toolTemplates || []).slice(0, 1).map((tool) => tool.id)
  );
  const [taskTitle, setTaskTitle] = useState("Plan a realistic study week");
  const [activePanel, setActivePanel] = useState<ConfigPanel>("identity");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const [guideIndex, setGuideIndex] = useState(0);
  const [creating, setCreating] = useState(false);
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
  const reviewsPassed = reviewTargets.every((target) => reviews[target]?.passed);
  const needsGoogleConnection = selectedTools.some((toolId) => {
    const tool = config.toolTemplates?.find((item) => item.id === toolId);
    return tool?.connectorKind?.startsWith("google_") || tool?.connectorKind === "gmail";
  });
  const appUrl =
    process.env.NEXT_PUBLIC_AGENT_COMMONS_APP_URL || "https://www.agentcommons.io";
  const googleConnectUrl = `${appUrl.replace(/\/$/, "")}/oauth/connect?provider=google_workspace&returnUrl=/studio`;
  const agentStudioUrl = createdAgentId
    ? `${appUrl.replace(/\/$/, "")}/studio/agents/${createdAgentId}`
    : "";

  const canCreate =
    agentName.trim().length > 1 &&
    systemPrompt.trim().length > 40 &&
    selectedSkills.length > 0 &&
    selectedTools.length > 0 &&
    reviewsPassed;

  const statusLabel = useMemo(() => {
    if (completionSent) return "Completed";
    if (createdAgentId) return "Agent created. Test it in chat.";
    if (!reviewsPassed && reviewTargets.length) return "AI review required";
    return "Create the agent in Agent Commons";
  }, [completionSent, createdAgentId, reviewTargets.length, reviewsPassed]);

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
        message:
          payload.error ||
          "Agent Commons did not create a real agent. The lesson cannot continue with a mock agent.",
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
    if (needsGoogleConnection) {
      addLog({
        level: "warning",
        message:
          "Google tools require a real Google Workspace connection before the agent can use Google data.",
      });
    }
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
      const error = payload.error || payload.message || "The agent run failed.";
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
            .map((skill) => `${skill.name}\n${skill.instructions}`)
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
        message: payload.error || "Could not review this yet.",
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
    const panel = activeStep?.target ? targetToPanel[activeStep.target] : undefined;
    if (panel) {
      setActivePanel(panel);
      setDrawerOpen(true);
    }
  }

  return (
    <div className="relative flex h-[calc(100dvh-11rem)] min-h-[620px] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-950">
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
            onNameChange={setAgentName}
            onPersonaChange={setPersona}
          />
        ) : null}
        {activePanel === "prompt" ? (
          <PromptPanel
            systemPrompt={systemPrompt}
            onChange={(value) => {
              setSystemPrompt(value);
              setReviews((current) => {
                const rest = { ...current };
                delete rest.system_prompt;
                return rest;
              });
            }}
            reviewEnabled={reviewTargets.includes("system_prompt")}
            review={reviews.system_prompt}
            reviewing={reviewing === "system_prompt"}
            onReview={() => reviewTarget("system_prompt")}
          />
        ) : null}
        {activePanel === "skills" ? (
          <SkillsPanel
            skills={config.skillTemplates || []}
            selected={selectedSkills}
            onChange={(items) => {
              setSelectedSkills(items);
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

      <main className="flex min-w-0 flex-1 flex-col">
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

        <div className="flex min-h-0 flex-1">
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
            <div className="absolute inset-x-14 bottom-[76px] z-20 max-h-72 overflow-hidden border-t border-slate-200 bg-white shadow-2xl lg:hidden">
              <LogsPanel logs={logs} />
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
          onNextStep={() =>
            setGuideIndex((index) => (index + 1) % Math.max(guide.length, 1))
          }
          onCreate={createAgent}
          needsGoogleConnection={needsGoogleConnection}
          googleConnectUrl={googleConnectUrl}
        />
      </main>
    </div>
  );
}
