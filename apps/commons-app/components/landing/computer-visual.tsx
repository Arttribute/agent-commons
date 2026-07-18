"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Check,
  FileCode2,
  FileText,
  Folder,
  Globe2,
  MoreHorizontal,
  SquareTerminal,
} from "lucide-react";

function TrafficLights() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
      <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
    </span>
  );
}

const COMPUTER_TABS = ["files", "terminal", "browser"] as const;
type ComputerTab = (typeof COMPUTER_TABS)[number];

export function ComputerVisual() {
  const [tab, setTab] = useState<ComputerTab>("files");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTab((current) => {
        const index = COMPUTER_TABS.indexOf(current);
        return COMPUTER_TABS[(index + 1) % COMPUTER_TABS.length];
      });
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#e9ecec] shadow-[0_28px_80px_-38px_rgba(28,25,23,0.35)]">
      <div className="flex h-11 items-center justify-between border-b border-black/10 bg-white/90 px-4">
        <TrafficLights />
        <span className="text-xs font-medium text-stone-600">
          Scout&apos;s computer
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Running
        </span>
      </div>

      <div className="grid min-h-[390px] grid-cols-[58px_1fr] sm:grid-cols-[72px_1fr]">
        <div className="flex flex-col items-center gap-2 border-r border-black/10 bg-stone-900 py-4">
          {[
            ["files", Folder],
            ["terminal", SquareTerminal],
            ["browser", Globe2],
          ].map(([name, Icon]) => (
            <button
              key={name as string}
              type="button"
              onClick={() => setTab(name as ComputerTab)}
              aria-label={`Show ${name}`}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                tab === name
                  ? "bg-white text-stone-950"
                  : "text-stone-500 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          ))}
          <div className="mt-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand-mint text-xs font-bold text-stone-900">
            S
          </div>
        </div>

        <div className="relative m-3 overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl sm:m-5">
          {tab === "files" && <FilesScreen />}
          {tab === "terminal" && <TerminalScreen />}
          {tab === "browser" && <BrowserScreen />}
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-black/10 bg-white/80 py-2.5">
        {[
          ["files", Folder],
          ["terminal", SquareTerminal],
          ["browser", Globe2],
        ].map(([name, Icon]) => (
          <button
            key={name as string}
            type="button"
            onClick={() => setTab(name as ComputerTab)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
              tab === name
                ? "bg-stone-900 text-white"
                : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            <Icon className="h-3 w-3" />
            {name as string}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilesScreen() {
  return (
    <div className="grid h-full min-h-[350px] grid-cols-[128px_1fr] text-stone-700 sm:grid-cols-[170px_1fr]">
      <aside className="border-r border-stone-200 bg-stone-50 p-3">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
          Explorer
        </p>
        <div className="space-y-1 text-[11px]">
          <p className="flex items-center gap-1.5 rounded-md bg-stone-200/70 px-2 py-1.5 font-medium">
            <Folder className="h-3 w-3" /> morning-brief
          </p>
          <p className="flex items-center gap-1.5 px-3 py-1">
            <FileCode2 className="h-3 w-3 text-blue-500" />
            index.ts
          </p>
          <p className="flex items-center gap-1.5 px-3 py-1">
            <FileText className="h-3 w-3 text-amber-500" />
            brief.md
          </p>
          <p className="flex items-center gap-1.5 px-3 py-1">
            <FileCode2 className="h-3 w-3 text-violet-500" />
            schedule.json
          </p>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="flex h-9 items-center border-b border-stone-200 bg-stone-50 px-3 text-[10px] text-stone-500">
          <FileCode2 className="mr-1.5 h-3 w-3 text-blue-500" /> index.ts{" "}
          <span className="ml-auto">Saved</span>
        </div>
        <pre className="overflow-hidden p-4 font-mono text-[10px] leading-5 text-stone-600 sm:text-[11px]">
          <code>
            <span className="text-violet-600">import</span>
            {" { inbox, slack } "}
            <span className="text-violet-600">from</span>{" "}
            <span className="text-emerald-700">&quot;@commons/tools&quot;</span>
            {";\n\n"}
            <span className="text-violet-600">export async function</span>
            {" morningBrief() {\n  "}
            <span className="text-violet-600">const</span>
            {" messages = "}
            <span className="text-violet-600">await</span>
            {" inbox.unread();\n  "}
            <span className="text-violet-600">const</span>
            {" brief = "}
            <span className="text-violet-600">await</span>
            {" agent.summarize(messages);\n\n  "}
            <span className="text-violet-600">await</span>
            {" slack.post({\n    channel: "}
            <span className="text-emerald-700">&quot;team-updates&quot;</span>
            {",\n    text: brief,\n  });\n}"}
          </code>
        </pre>
      </div>
    </div>
  );
}

function TerminalScreen() {
  return (
    <div className="min-h-[350px] bg-[#111211] p-5 font-mono text-[11px] leading-6 text-stone-400 sm:p-7 sm:text-xs">
      <p className="text-stone-200">
        <span className="text-emerald-400">scout</span>{" "}
        <span className="text-stone-600">~/morning-brief</span> $ pnpm run
        deploy
      </p>
      <p className="mt-3">Preparing always-on workspace…</p>
      <p>Connecting Gmail and Slack tools…</p>
      <p>Installing 4 agent skills…</p>
      <p className="mt-3 flex items-center gap-2 text-emerald-400">
        <Check className="h-3.5 w-3.5" /> Computer is ready
      </p>
      <p className="flex items-center gap-2 text-emerald-400">
        <Check className="h-3.5 w-3.5" /> Workflow scheduled · weekdays 07:00
      </p>
      <p className="mt-4 text-stone-200">
        <span className="text-emerald-400">scout</span>{" "}
        <span className="text-stone-600">~/morning-brief</span> ${" "}
        <span className="inline-block h-3 w-1.5 animate-caret-blink bg-stone-400 align-middle" />
      </p>
    </div>
  );
}

function BrowserScreen() {
  return (
    <div className="min-h-[350px] bg-white">
      <div className="flex h-10 items-center gap-2 border-b border-stone-200 bg-stone-50 px-3">
        <span className="flex-1 rounded-md bg-white px-3 py-1.5 text-[10px] text-stone-400 ring-1 ring-stone-200">
          preview.agentcommons.site
        </span>
        <MoreHorizontal className="h-4 w-4 text-stone-400" />
      </div>
      <div className="relative h-[310px] overflow-hidden">
        <Image
          src="/landing/coastal-architecture.webp"
          alt="A generated preview of a modern architecture website"
          fill
          sizes="(max-width: 768px) 80vw, 600px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/55 to-transparent" />
        <div className="absolute left-6 top-7 max-w-[230px] sm:left-9 sm:top-10">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-600">
            Atelier North
          </p>
          <h3 className="mt-4 text-2xl font-semibold leading-[1.05] tracking-[-0.04em] text-stone-950 sm:text-3xl">
            Space, shaped by nature.
          </h3>
          <p className="mt-3 text-[10px] leading-4 text-stone-600">
            Quiet homes designed for the landscapes they inhabit.
          </p>
          <span className="mt-5 inline-flex rounded-full bg-stone-950 px-3 py-1.5 text-[9px] font-medium text-white">
            View projects
          </span>
        </div>
      </div>
    </div>
  );
}
