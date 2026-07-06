"use client";

import { useEffect, useState } from "react";
import {
  ArrowUp,
  Award,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  Database,
  Globe,
  Hammer,
  Lock,
  Monitor,
  Play,
  Sparkles,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { chipStyles } from "@/lib/brand";

const railItems = [
  { icon: Bot, label: "Identity" },
  { icon: Sparkles, label: "Skills" },
  { icon: Hammer, label: "Tools" },
  { icon: CalendarClock, label: "Tasks" },
  { icon: Workflow, label: "Workflow" },
  { icon: Database, label: "Memory" },
  { icon: Monitor, label: "Computer" },
] as const;

type DemoStep = {
  title: string;
  body: string;
  /** Which rail icon is highlighted, or null when the focus is the main surface. */
  rail: number | null;
};

const steps: DemoStep[] = [
  {
    title: "Give your agent an identity",
    body: "Every learner starts from a lesson template — a name, an avatar, and a clear role.",
    rail: 0,
  },
  {
    title: "Write the system prompt",
    body: "Learners describe how the agent should think and behave. Educators can attach an AI review rubric.",
    rail: 0,
  },
  {
    title: "Attach permitted tools",
    body: "Learners only see the tools the educator allows. Everything else stays locked.",
    rail: 2,
  },
  {
    title: "Create the agent and chat",
    body: "The agent runs live in an isolated workspace, with sample data instead of production systems.",
    rail: null,
  },
  {
    title: "Review every run",
    body: "Tool calls, outputs, and logs are all observable — learners see exactly what happened and why.",
    rail: null,
  },
  {
    title: "Finish and earn the badge",
    body: "Completing the sandbox awards credits and counts toward the daily skill badge.",
    rail: null,
  },
];

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <div className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function IdentityPanel() {
  return (
    <div className="animate-rise space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            chipStyles[1]
          )}
        >
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-950">Research Scout</p>
          <p className="text-xs text-slate-500">Lesson 4 · Agent basics</p>
        </div>
      </div>
      <FieldRow label="Agent name" value="Research Scout" />
      <FieldRow
        label="Role"
        value="Finds and summarizes sources for a topic brief"
      />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          Personality
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {["Curious", "Precise", "Cites sources"].map((trait, i) => (
            <span
              key={trait}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs font-bold",
                chipStyles[i % chipStyles.length]
              )}
            >
              {trait}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PromptPanel() {
  return (
    <div className="animate-rise p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        System prompt
      </p>
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm leading-6 text-slate-800">
        You are Research Scout, a careful research assistant. When given a
        topic, search the permitted sources, pick the three most relevant
        results, and summarize each in two sentences with a link.
        <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-slate-950 align-middle" />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        AI review enabled — feedback against the educator&apos;s rubric before
        the agent is created.
      </div>
    </div>
  );
}

function ToolsPanel() {
  const tools = [
    { icon: Globe, name: "web_search", note: "Enabled by educator", on: true },
    { icon: Database, name: "save_note", note: "Enabled by educator", on: true },
    { icon: Lock, name: "send_email", note: "Locked in this sandbox", on: false },
  ];
  return (
    <div className="animate-rise space-y-2 p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        Permitted tools
      </p>
      {tools.map(({ icon: Icon, name, note, on }) => (
        <div
          key={name}
          className={cn(
            "flex items-center gap-3 rounded-lg border px-3 py-2.5",
            on ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"
          )}
        >
          <Icon
            className={cn("h-4 w-4 shrink-0", on ? "text-slate-900" : "text-slate-400")}
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-bold",
                on ? "text-slate-950" : "text-slate-400"
              )}
            >
              {name}
            </p>
            <p className="truncate text-xs text-slate-500">{note}</p>
          </div>
          <span
            className={cn(
              "flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors",
              on ? "justify-end border-[#A6E45E] bg-[#B8F56D]" : "justify-start border-slate-200 bg-slate-100"
            )}
          >
            <span className="h-3.5 w-3.5 rounded-full bg-white shadow-sm" />
          </span>
        </div>
      ))}
    </div>
  );
}

function ChatPanel() {
  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex-1 space-y-3 overflow-hidden">
        <div className="flex justify-end">
          <p className="animate-rise max-w-[85%] rounded-2xl rounded-br-md bg-slate-950 px-3.5 py-2 text-sm leading-6 text-white">
            Find three recent papers on agent memory and summarize them.
          </p>
        </div>
        <div
          className="animate-rise inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600"
          style={{ animationDelay: "0.35s" }}
        >
          <Globe className="h-3 w-3" /> web_search · 3 results
        </div>
        <div className="flex">
          <div
            className="animate-rise max-w-[90%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2 text-sm leading-6 text-slate-800"
            style={{ animationDelay: "0.7s" }}
          >
            Found three strong candidates. The most cited one proposes
            organizing agent memory into working, episodic, semantic, and
            procedural stores…
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <p className="flex-1 truncate text-sm text-slate-400">
          Ask your agent anything…
        </p>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950">
          <ArrowUp className="h-3.5 w-3.5 text-white" />
        </span>
      </div>
    </div>
  );
}

function LogsPanel() {
  const lines = [
    ["run #42 started", "0.0s"],
    ["tool call · web_search(“agent memory papers”)", "1.2s"],
    ["3 sources fetched and ranked", "2.6s"],
    ["summary generated · 214 tokens", "3.8s"],
    ["run completed", "4.1s"],
  ];
  return (
    <div className="animate-rise p-4 sm:p-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        Run history
      </p>
      <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {lines.map(([text, time], i) => (
          <div
            key={text}
            className="animate-rise flex items-center gap-2.5 px-3 py-2 text-sm"
            style={{ animationDelay: `${i * 0.12}s` }}
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span className="min-w-0 flex-1 truncate text-slate-800">{text}</span>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonePanel() {
  return (
    <div className="flex h-full items-center justify-center p-4 sm:p-5">
      <div className="animate-rise w-full max-w-sm rounded-xl border border-green-200 bg-white p-5 text-center shadow-sm">
        <div
          className={cn(
            "mx-auto flex h-12 w-12 items-center justify-center rounded-full border",
            chipStyles[0]
          )}
        >
          <Award className="h-6 w-6" />
        </div>
        <h4 className="mt-3 text-base font-black text-slate-950">
          Sandbox complete
        </h4>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Agent created, tested, and reviewed.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-950">
          <Coins className="h-3.5 w-3.5 text-amber-500" /> +50 credits · badge
          day 3 of 5
        </p>
      </div>
    </div>
  );
}

export function SandboxDemo() {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(
      () => setStep((s) => (s + 1) % steps.length),
      5000
    );
    return () => window.clearInterval(id);
  }, [auto]);

  const goTo = (next: number) => {
    setAuto(false);
    setStep(((next % steps.length) + steps.length) % steps.length);
  };

  const active = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_-32px_rgba(2,6,23,0.25)]">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F3A2B4]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FFE177]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#B8F56D]" />
        </div>
        <p className="min-w-0 flex-1 truncate text-center text-xs font-bold text-slate-500">
          CommonLab · Guided sandbox
        </p>
        <span className="hidden rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 sm:block">
          Safe practice
        </span>
      </div>

      <div className="flex">
        {/* Config rail */}
        <aside className="flex w-11 shrink-0 flex-col items-center gap-1.5 border-r border-slate-200 bg-slate-50 py-3 sm:w-12">
          {railItems.map(({ icon: Icon, label }, i) => (
            <span
              key={label}
              title={label}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                active.rail === i
                  ? "bg-slate-950 text-white"
                  : "text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
          ))}
        </aside>

        {/* Main surface */}
        <div className="relative min-w-0 flex-1">
          <div className="h-[340px] overflow-hidden bg-slate-50/60 sm:h-[360px]">
            <div key={step} className="h-full">
              {step === 0 && <IdentityPanel />}
              {step === 1 && <PromptPanel />}
              {step === 2 && <ToolsPanel />}
              {step === 3 && <ChatPanel />}
              {step === 4 && <LogsPanel />}
              {step === 5 && <DonePanel />}
            </div>
          </div>

          {/* Guide card — mirrors the real sandbox step guide */}
          <div className="border-t border-slate-200 bg-white px-3 py-2.5 sm:px-4">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 rounded-md border px-2 py-0.5 text-xs font-black tabular-nums",
                  chipStyles[step % chipStyles.length]
                )}
              >
                {step + 1}/{steps.length}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-950">
                  {active.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-600 sm:line-clamp-none">
                  {active.body}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  aria-label="Previous step"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goTo(step + 1)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-800"
                >
                  {isLast ? (
                    <>
                      Replay <Play className="h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              {steps.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === step
                      ? "w-6 bg-slate-950"
                      : "w-2.5 bg-slate-200 hover:bg-slate-300"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
