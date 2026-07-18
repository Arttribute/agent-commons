import { Bot } from "lucide-react";
import { BrandLogo } from "./brand-logo";

function TrafficLights() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
    </span>
  );
}

/**
 * A miniature agent computer: terminal + browser panes under one window
 * chrome, with an "always on" status and a small app dock.
 */
export function ComputerVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-4 py-2.5">
        <TrafficLights />
        <span className="font-space text-[11px] text-stone-500">
          scout — agent computer
        </span>
        <span className="flex items-center gap-1.5 font-space text-[10px] text-emerald-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          always on
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_1fr]">
        <div className="bg-stone-950 p-4 font-space text-[11px] leading-5 text-stone-400">
          <p>
            <span className="text-stone-600">$</span>{" "}
            <span className="text-stone-100">agc task run morning-brief</span>
          </p>
          <p>▸ reading inbox — 12 new messages</p>
          <p>▸ drafting summary…</p>
          <p className="text-emerald-400">✓ brief posted to #general</p>
          <p>
            <span className="text-stone-600">$</span>{" "}
            <span className="ml-0.5 inline-block h-3 w-[7px] animate-caret-blink bg-stone-500 align-middle" />
          </p>
        </div>
        <div className="hidden flex-col border-l border-stone-200 bg-white sm:flex">
          <div className="mx-3 my-2 rounded-md bg-stone-100 px-2.5 py-1 font-space text-[10px] text-stone-500">
            agentcommons.io/preview
          </div>
          <div className="flex-1 space-y-2 px-3 pb-3">
            <div className="h-14 rounded-md bg-brand-mint/30" />
            <div className="h-2 w-3/4 rounded bg-stone-200" />
            <div className="h-2 w-1/2 rounded bg-stone-200" />
            <div className="h-2 w-2/3 rounded bg-stone-100" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-stone-200 bg-stone-50/70 py-2">
        {["github-icon", "google-gmail", "google-drive", "slack-icon", "postgresql"].map(
          (name) => (
            <span
              key={name}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200 bg-white"
            >
              <BrandLogo name={name} size={12} />
            </span>
          ),
        )}
      </div>
    </div>
  );
}

function CanvasNode({
  logo,
  icon,
  title,
  subtitle,
  className,
}: {
  logo?: string;
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-card ${className ?? ""}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-stone-100 bg-stone-50">
        {logo ? <BrandLogo name={logo} size={14} /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-stone-800">
          {title}
        </span>
        <span className="block truncate font-space text-[10px] text-stone-500">
          {subtitle}
        </span>
      </span>
    </div>
  );
}

/**
 * A small slice of the workflow editor: trigger → agent → app actions on a
 * dotted canvas with dashed edges.
 */
export function WorkflowVisual() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-card sm:p-8"
      style={{
        backgroundImage:
          "radial-gradient(circle, #e7e5e4 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <span className="absolute left-4 top-4 rounded-full border border-stone-200 bg-white px-2.5 py-1 font-space text-[10px] text-stone-500">
        runs on every new email
      </span>
      <div className="mt-8 grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <CanvasNode
          logo="google-gmail"
          title="New email"
          subtitle="trigger · gmail"
        />
        <Edge />
        <CanvasNode
          icon={<Bot className="h-4 w-4 text-stone-700" />}
          title="Scout triages"
          subtitle="agent step"
        />
        <Edge />
        <div className="space-y-3">
          <CanvasNode
            logo="linear-icon"
            title="Create issue"
            subtitle="action · linear"
          />
          <CanvasNode
            logo="slack-icon"
            title="Notify #support"
            subtitle="action · slack"
          />
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end">
        <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-space text-[10px] text-stone-500">
          last run · 2m ago
        </span>
      </div>
    </div>
  );
}

function Edge() {
  return (
    <span
      aria-hidden
      className="mx-auto hidden h-px w-10 border-t-2 border-dashed border-stone-300 sm:block"
    />
  );
}

/** Dark terminal card showing the agc CLI in action. */
export function TerminalVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 shadow-card">
      <div className="flex items-center justify-between border-b border-stone-800/80 px-4 py-2.5">
        <TrafficLights />
        <span className="font-space text-[11px] text-stone-500">terminal</span>
        <span className="w-10" />
      </div>
      <div className="space-y-1 p-5 font-space text-[12px] leading-6 sm:text-[12.5px]">
        <p className="text-stone-300">
          <span className="text-stone-600">$</span> npm install -g
          @agent-commons/cli
        </p>
        <p className="text-stone-300">
          <span className="text-stone-600">$</span> agc chat
        </p>
        <p className="text-stone-500">◇ session with scout</p>
        <p className="text-stone-300">
          <span className="text-brand-cyan">you</span>
          <span className="text-stone-600"> › </span>
          set up a daily briefing at 7am
        </p>
        <p className="text-stone-300">
          <span className="text-brand-mint">scout</span>
          <span className="text-stone-600"> › </span>
          created workflow “morning-brief”
        </p>
        <p className="text-emerald-400">
          ✓ scheduled · weekdays 07:00
          <span className="ml-1.5 inline-block h-3 w-[7px] animate-caret-blink bg-stone-600 align-middle" />
        </p>
      </div>
    </div>
  );
}

/** Light code card showing the TypeScript SDK. */
export function SdkVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-4 py-2.5">
        <span className="font-space text-[11px] text-stone-500">
          briefing.ts
        </span>
        <span className="rounded-full border border-stone-200 bg-white px-2 py-0.5 font-space text-[10px] text-stone-500">
          @agent-commons/sdk
        </span>
      </div>
      <pre className="overflow-x-auto p-5 font-space text-[12px] leading-6 text-stone-700 sm:text-[12.5px]">
        <code>
          <span className="text-indigo-600">import</span>
          {" { CommonsClient } "}
          <span className="text-indigo-600">from</span>{" "}
          <span className="text-emerald-600">&quot;@agent-commons/sdk&quot;</span>
          ;{"\n\n"}
          <span className="text-indigo-600">const</span>
          {" commons = "}
          <span className="text-indigo-600">new</span>
          {" CommonsClient({ apiKey });\n\n"}
          <span className="text-indigo-600">await</span>
          {" commons.agents.run({\n"}
          {"  agent: "}
          <span className="text-emerald-600">&quot;scout&quot;</span>
          {",\n  input: "}
          <span className="text-emerald-600">
            &quot;Summarize this week&apos;s PRs&quot;
          </span>
          {",\n});"}
        </code>
      </pre>
    </div>
  );
}
