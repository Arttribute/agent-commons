"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Coins,
  Hammer,
  Layers3,
  Loader2,
  MessageSquareText,
  Play,
  ScrollText,
  Sparkles,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AgentSandboxCapability,
  AgentSandboxConfig,
  AgentSandboxStepTarget,
} from "@/types/skills";

type SandboxLog = {
  level: "success" | "warning" | "info" | "error";
  message: string;
};

type ReviewResult = {
  score: number;
  passed: boolean;
  summary: string;
  strengths: string[];
  improvements: string[];
  nextRevision: string;
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
};

const capabilityLabels: Record<AgentSandboxCapability, string> = {
  identity: "Identity",
  system_prompt: "System prompt",
  skills: "Skills",
  tools: "Tools",
  connectors: "Connectors",
  tasks: "Tasks",
  workflows: "Workflows",
  chat: "Run",
  logs: "Logs",
  credits: "Credits",
};

const capabilityIcons: Record<AgentSandboxCapability, typeof Bot> = {
  identity: Bot,
  system_prompt: ScrollText,
  skills: Sparkles,
  tools: Hammer,
  connectors: Layers3,
  tasks: ClipboardList,
  workflows: Workflow,
  chat: MessageSquareText,
  logs: ScrollText,
  credits: Coins,
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
    config.starterAgent?.name || "My first useful agent"
  );
  const [persona, setPersona] = useState(
    config.starterAgent?.persona || "A practical helper for planning my week"
  );
  const [systemPrompt, setSystemPrompt] = useState(
    config.starterAgent?.systemPrompt ||
      "You are a calm, practical learning assistant. Help me plan clearly, ask short follow-up questions when needed, and explain your reasoning simply."
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    (config.skillTemplates || []).slice(0, 1).map((skill) => skill.id)
  );
  const [selectedTools, setSelectedTools] = useState<string[]>(
    (config.toolTemplates || []).slice(0, 1).map((tool) => tool.id)
  );
  const [taskTitle, setTaskTitle] = useState("Plan tomorrow from my calendar");
  const [message, setMessage] = useState(
    "Check my day, find one focus block, and suggest the first useful next step."
  );
  const [guideIndex, setGuideIndex] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewResult>>({});
  const [logs, setLogs] = useState<SandboxLog[]>([
    { level: "info", message: "Sandbox ready. Guided steps will highlight what to configure." },
  ]);
  const [createdAgentId, setCreatedAgentId] = useState<string | undefined>();

  const guide = config.guideSteps || [];
  const activeStep = guide[guideIndex];
  const activeTarget = activeStep?.target;
  const enabled = new Set(config.capabilities || []);
  const visibleCapabilities = (config.capabilities || []).filter(
    (capability) => capability !== "credits"
  );
  const required = new Set(config.requiredCapabilities || []);
  const reviewTargets = config.review?.enabled ? config.review.targets || [] : [];
  const reviewsPassed = reviewTargets.every((target) => reviews[target]?.passed);
  const canPublish =
    agentName.trim().length > 1 &&
    systemPrompt.trim().length > 40 &&
    (!required.has("skills") || selectedSkills.length > 0) &&
    (!required.has("tools") || selectedTools.length > 0) &&
    (!required.has("tasks") || taskTitle.trim().length > 2) &&
    (!required.has("chat") || message.trim().length > 8) &&
    reviewsPassed;

  const simulatedRun = useMemo(
    () => [
      `Loaded identity for ${agentName || "your agent"}.`,
      selectedSkills.length
        ? `Applied ${selectedSkills.length} skill instruction set.`
        : "No skill instruction selected yet.",
      selectedTools.length
        ? `Connected ${selectedTools.length} learning tool template.`
        : "No tool selected yet.",
      `Drafted response to: "${message.slice(0, 80)}${message.length > 80 ? "..." : ""}"`,
    ],
    [agentName, message, selectedSkills.length, selectedTools.length]
  );

  function isHighlighted(target: AgentSandboxStepTarget) {
    return activeTarget === target;
  }

  async function publishAgent() {
    if (!authenticated) {
      window.location.href = signInHref;
      return;
    }
    if (!canPublish || publishing) return;

    setPublishing(true);
    setLogs((current) => [
      { level: "info", message: "Creating learner agent in the shared Agent Commons account..." },
      ...current,
    ]);
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
          message,
        },
      }),
    });
    const payload = await response.json();
    setPublishing(false);

    if (!response.ok) {
      setLogs((current) => [
        { level: "error", message: payload.error || "Could not create the agent yet." },
        ...current,
      ]);
      return;
    }

    setCreatedAgentId(payload.agentId);
    setLogs((current) => [
      {
        level: payload.simulated ? "warning" : "success",
        message: payload.simulated
          ? "Saved a sandbox draft. Link Commons Identity/API credentials to create a platform agent."
          : `Created Agent Commons agent ${payload.agentId}. It will appear in the main dashboard for this identity.`,
      },
      { level: "success", message: "Sandbox task completed and progress saved." },
      ...simulatedRun.map((message): SandboxLog => ({ level: "info", message })),
      ...current,
    ]);
    onComplete({
      agentId: payload.agentId,
      simulated: Boolean(payload.simulated),
      creditReward: payload.creditReward || config.creditReward || 0,
    });
  }

  async function reviewTarget(target: "system_prompt" | "skills") {
    if (!authenticated) {
      window.location.href = signInHref;
      return;
    }
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
        context: {
          agentName,
          persona,
          selectedSkills,
        },
      }),
    });
    const payload = await response.json();
    setReviewing(null);
    if (!response.ok) {
      setLogs((current) => [
        { level: "error", message: payload.error || "Could not review this yet." },
        ...current,
      ]);
      return;
    }
    const result = payload.data as ReviewResult;
    setReviews((current) => ({ ...current, [target]: result }));
    setLogs((current) => [
      {
        level: result.passed ? "success" : "warning",
        message: `${target === "system_prompt" ? "System prompt" : "Skill"} review: ${result.score}/100. ${result.summary}`,
      },
      ...current,
    ]);
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Agent learner sandbox
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {config.title || "Create your first agent"}
            </h2>
            {config.brief ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {config.brief}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {visibleCapabilities.map((capability) => {
              const Icon = capabilityIcons[capability];
              return (
                <span
                  key={capability}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {capabilityLabels[capability]}
                </span>
              );
            })}
          </div>
        </div>

        {activeStep ? (
          <div className="mt-4 rounded-lg border border-slate-950 bg-slate-950 p-3 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/50">
                  Step {guideIndex + 1} of {guide.length}
                </p>
                <p className="mt-1 text-sm font-black">{activeStep.title}</p>
                <p className="mt-1 text-sm leading-6 text-white/75">{activeStep.body}</p>
              </div>
              <button
                type="button"
                onClick={() => setGuideIndex((index) => (index + 1) % guide.length)}
                className="shrink-0 rounded-md bg-white px-3 py-2 text-xs font-black text-slate-950"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
        <div className="space-y-4">
          {enabled.has("identity") ? (
            <SandboxPanel highlighted={isHighlighted("identity")} title="Identity" icon={Bot}>
              <Field label="Agent name" value={agentName} onChange={setAgentName} />
              <Field label="Role" value={persona} onChange={setPersona} />
            </SandboxPanel>
          ) : null}

          {enabled.has("system_prompt") ? (
            <SandboxPanel
              highlighted={isHighlighted("system_prompt")}
              title="System prompt"
              icon={ScrollText}
            >
              <textarea
                value={systemPrompt}
                onChange={(event) => {
                  setSystemPrompt(event.target.value);
                  setReviews((current) => {
                    const rest = { ...current };
                    delete rest.system_prompt;
                    return rest;
                  });
                }}
                className="min-h-36 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
              />
              {reviewTargets.includes("system_prompt") ? (
                <ReviewBox
                  targetLabel="system prompt"
                  result={reviews.system_prompt}
                  loading={reviewing === "system_prompt"}
                  onReview={() => reviewTarget("system_prompt")}
                />
              ) : null}
            </SandboxPanel>
          ) : null}

          {enabled.has("skills") ? (
            <SandboxPanel highlighted={isHighlighted("skills")} title="Skills" icon={Sparkles}>
              <Picker
                items={(config.skillTemplates || []).map((skill) => ({
                  id: skill.id,
                  name: skill.name,
                  description: skill.instructions,
                }))}
                selected={selectedSkills}
                onChange={(items) => {
                  setSelectedSkills(items);
                  setReviews((current) => {
                    const rest = { ...current };
                    delete rest.skills;
                    return rest;
                  });
                }}
              />
              {reviewTargets.includes("skills") ? (
                <ReviewBox
                  targetLabel="skills"
                  result={reviews.skills}
                  loading={reviewing === "skills"}
                  onReview={() => reviewTarget("skills")}
                />
              ) : null}
            </SandboxPanel>
          ) : null}

          {(enabled.has("tools") || enabled.has("connectors")) ? (
            <SandboxPanel
              highlighted={isHighlighted("tools") || isHighlighted("connectors")}
              title="Tools and connectors"
              icon={Hammer}
            >
              <Picker
                items={(config.toolTemplates || []).map((tool) => ({
                  id: tool.id,
                  name: tool.name,
                  connectorKind: tool.connectorKind,
                  description:
                    tool.description ||
                    (tool.simulated ? "Simulated for this lesson" : "Connected tool"),
                }))}
                selected={selectedTools}
                onChange={setSelectedTools}
              />
            </SandboxPanel>
          ) : null}
        </div>

        <div className="space-y-4">
          {enabled.has("tasks") ? (
            <SandboxPanel highlighted={isHighlighted("tasks")} title="Task" icon={ClipboardList}>
              <Field label="First task" value={taskTitle} onChange={setTaskTitle} />
            </SandboxPanel>
          ) : null}

          {enabled.has("workflows") ? (
            <SandboxPanel highlighted={isHighlighted("workflows")} title="Workflow" icon={Workflow}>
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-xs font-bold text-slate-700">
                <WorkflowNode label="Prompt" />
                <span className="h-px bg-slate-300" />
                <WorkflowNode label="Tool" />
                <span className="h-px bg-slate-300" />
                <WorkflowNode label="Answer" />
              </div>
            </SandboxPanel>
          ) : null}

          {enabled.has("chat") ? (
            <SandboxPanel highlighted={isHighlighted("chat")} title="Run preview" icon={Play}>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-400"
              />
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {simulatedRun.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </SandboxPanel>
          ) : null}

          {enabled.has("logs") ? (
            <SandboxPanel highlighted={isHighlighted("logs")} title="Logs" icon={ScrollText}>
              <div className="max-h-52 space-y-2 overflow-y-auto">
                {logs.map((log, index) => (
                  <div
                    key={`${log.message}:${index}`}
                    className={cn(
                      "rounded-md px-3 py-2 text-xs leading-5",
                      log.level === "success" && "bg-green-50 text-green-800",
                      log.level === "warning" && "bg-amber-50 text-amber-800",
                      log.level === "error" && "bg-rose-50 text-rose-700",
                      log.level === "info" && "bg-slate-50 text-slate-600"
                    )}
                  >
                    {log.message}
                  </div>
                ))}
              </div>
            </SandboxPanel>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {completed ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Completed
            </>
          ) : createdAgentId ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Agent created
            </>
          ) : config.creditReward ? (
            <>
              <Coins className="h-4 w-4 text-amber-500" />
              Earn {config.creditReward} credits
            </>
          ) : (
            <>
              <CalendarDays className="h-4 w-4 text-slate-400" />
              Configure the required parts to finish
            </>
          )}
          {config.review?.enabled && !reviewsPassed ? (
            <span className="text-xs font-semibold text-amber-700">
              Complete the AI review before creating the agent.
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={publishAgent}
          disabled={!canPublish || publishing || completed}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {completed ? "Completed" : "Create agent"}
        </button>
      </div>
    </div>
  );
}

function SandboxPanel({
  highlighted,
  title,
  icon: Icon,
  children,
}: {
  highlighted: boolean;
  title: string;
  icon: typeof Bot;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-white p-4 transition-all",
        highlighted
          ? "border-slate-950 shadow-[0_0_0_3px_rgba(15,23,42,0.12)]"
          : "border-slate-200"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
      />
    </label>
  );
}

function ReviewBox({
  targetLabel,
  result,
  loading,
  onReview,
}: {
  targetLabel: string;
  result?: ReviewResult;
  loading: boolean;
  onReview: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">
            AI review
          </p>
          {result ? (
            <p className="mt-1 text-sm font-bold text-slate-950">
              {result.score}/100 - {result.passed ? "Ready" : "Revise"}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Get feedback before continuing.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onReview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Review {targetLabel}
        </button>
      </div>
      {result ? (
        <div className="mt-3 space-y-2 text-xs leading-5 text-slate-700">
          <p>{result.summary}</p>
          {result.strengths.length ? (
            <p>
              <span className="font-bold text-green-700">Strengths:</span>{" "}
              {result.strengths.join(" ")}
            </p>
          ) : null}
          {result.improvements.length ? (
            <p>
              <span className="font-bold text-amber-700">Improve:</span>{" "}
              {result.improvements.join(" ")}
            </p>
          ) : null}
          {result.nextRevision ? (
            <p className="rounded-md bg-white px-2 py-1.5 font-semibold">
              {result.nextRevision}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Picker({
  items,
  selected,
  onChange,
}: {
  items: Array<{
    id: string;
    name: string;
    description?: string;
    connectorKind?: string;
  }>;
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  if (!items.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
        No templates configured for this lesson.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              onChange(
                checked
                  ? selected.filter((id) => id !== item.id)
                  : [...selected, item.id]
              )
            }
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
              checked
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            )}
          >
            <ConnectorLogo kind={item.connectorKind} />
            <span className="min-w-0">
              <span className="block text-sm font-bold">{item.name}</span>
              {item.description ? (
                <span className={cn("mt-1 block line-clamp-2 text-xs leading-5", checked ? "text-white/65" : "text-slate-500")}>
                  {item.description}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ConnectorLogo({ kind }: { kind?: string }) {
  if (!kind?.startsWith("google_") && kind !== "gmail") {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Hammer className="h-4 w-4" />
      </span>
    );
  }

  const label =
    kind === "gmail"
      ? "M"
      : kind === "google_calendar"
        ? "31"
        : kind === "google_drive"
          ? ""
          : "S";

  if (kind === "google_drive") {
    return (
      <span className="relative h-9 w-9 shrink-0 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <span className="absolute left-[15px] top-1 h-6 w-2 rotate-[30deg] rounded-sm bg-[#0F9D58]" />
        <span className="absolute bottom-1 left-2 h-2 w-6 rounded-sm bg-[#4285F4]" />
        <span className="absolute right-2 top-1 h-6 w-2 -rotate-[30deg] rounded-sm bg-[#F4B400]" />
      </span>
    );
  }

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-[11px] font-black text-slate-700 shadow-sm ring-1 ring-slate-200">
      <span className="absolute inset-x-0 top-0 h-1.5 bg-[#4285F4]" />
      <span className="absolute inset-y-0 left-0 w-1.5 bg-[#34A853]" />
      <span className="absolute inset-y-0 right-0 w-1.5 bg-[#FBBC04]" />
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-[#EA4335]" />
      {label}
    </span>
  );
}

function WorkflowNode({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center">
      {label}
    </div>
  );
}
