"use client";

import { useState } from "react";
import { Check, FileCode2, SquareTerminal } from "lucide-react";
import { WindowFrame } from "@/components/computers/desktop-window";

type View = "cli" | "sdk";

export function DeveloperVisual() {
  const [view, setView] = useState<View>("cli");

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-[#ecefed] shadow-[0_28px_80px_-44px_rgba(28,25,23,0.35)]">
      <div className="flex h-12 items-center justify-between border-b border-stone-200 bg-white/90 px-3">
        <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
          {[
            ["cli", SquareTerminal, "CLI"],
            ["sdk", FileCode2, "TypeScript"],
          ].map(([id, Icon, label]) => (
            <button
              key={id as string}
              type="button"
              onClick={() => setView(id as View)}
              className={`flex h-8 items-center gap-2 rounded-md px-3 text-[11px] font-medium transition-colors ${
                view === id
                  ? "bg-white text-stone-900 shadow-sm ring-1 ring-black/5"
                  : "text-stone-500"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label as string}
            </button>
          ))}
        </div>
        <span className="hidden rounded-md bg-teal-200 px-2 py-1 text-[10px] font-semibold text-stone-800 sm:inline">
          CLI + SDK
        </span>
      </div>

      <div className="relative min-h-[390px] bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.96),transparent_34%),linear-gradient(135deg,#eef2f2_0%,#e5e8e7_55%,#f2f0ed_100%)] p-3 sm:p-5">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(#a8a29e_0.7px,transparent_0.7px)] [background-size:22px_22px]" />
        <div className="relative mx-auto h-[350px] max-w-3xl">
          {view === "cli" ? <CliWindow /> : <SdkWindow />}
        </div>
      </div>
    </div>
  );
}

function CliWindow() {
  return (
    <WindowFrame
      icon={<SquareTerminal className="h-3 w-3 text-zinc-400" />}
      title="agent-commons · zsh"
      className="h-full"
      bodyClassName="bg-zinc-950/95"
    >
      <div className="h-full p-5 font-mono text-[11px] leading-6 text-zinc-400 sm:p-7 sm:text-xs">
        <p className="text-zinc-200">
          <span className="text-emerald-400">❯</span> npm install -g
          @agent-commons/cli
        </p>
        <p className="mt-4 text-zinc-200">
          <span className="text-emerald-400">❯</span> agc agents create --name
          Scout
        </p>
        <div className="mt-3 border-l border-zinc-700 pl-4">
          <p className="flex items-center gap-2 font-sans text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Agent created
          </p>
          <p className="mt-1 grid max-w-xs grid-cols-[72px_1fr] gap-x-3">
            <span className="text-zinc-600">Name</span>
            <span className="text-zinc-300">Scout</span>
            <span className="text-zinc-600">Runtime</span>
            <span className="text-zinc-300">native</span>
          </p>
        </div>
        <p className="mt-5 text-zinc-200">
          <span className="text-emerald-400">❯</span> agc agents list
        </p>
        <div className="mt-3 grid max-w-lg grid-cols-[1.2fr_1fr_1fr] border-y border-white/10 py-2 text-[10px] sm:text-[11px]">
          <span className="text-zinc-600">NAME</span>
          <span className="text-zinc-600">RUNTIME</span>
          <span className="text-zinc-600">STATUS</span>
          <span className="mt-1 text-zinc-200">Scout</span>
          <span className="mt-1 text-zinc-400">native</span>
          <span className="mt-1 text-emerald-400">ready</span>
        </div>
      </div>
    </WindowFrame>
  );
}

function SdkWindow() {
  const lines = [
    <>
      <span className="text-violet-600">import</span> {"{ CommonsClient }"}{" "}
      <span className="text-violet-600">from</span>{" "}
      <span className="text-emerald-700">&quot;@agent-commons/sdk&quot;</span>;
    </>,
    <>&nbsp;</>,
    <>
      <span className="text-violet-600">const</span> commons ={" "}
      <span className="text-violet-600">new</span> CommonsClient({"{"}
    </>,
    <> apiKey: process.env.AGENT_COMMONS_API_KEY,</>,
    <> initiator: teamId,</>,
    <>{"}"});</>,
    <>&nbsp;</>,
    <>
      <span className="text-violet-600">const</span> {"{ data: agent }"} ={" "}
      <span className="text-violet-600">await</span> commons.agents.create({"{"}
    </>,
    <>
      {"  name: "}
      <span className="text-emerald-700">&quot;Scout&quot;</span>,
    </>,
    <> owner: teamId,</>,
    <> modelProvider,</>,
    <> modelId,</>,
    <>{"}"});</>,
    <>&nbsp;</>,
    <>
      <span className="text-violet-600">await</span>{" "}
      commons.agents.deployRuntime(agent.agentId);
    </>,
  ];

  return (
    <WindowFrame
      tone="light"
      icon={<FileCode2 className="h-3 w-3 text-zinc-400" />}
      title="agent.ts"
      className="h-full"
      bodyClassName="bg-white"
    >
      <div className="h-full overflow-hidden p-4 font-mono text-[10px] leading-5 text-zinc-700 sm:p-6 sm:text-[11px]">
        {lines.map((line, index) => (
          <div
            key={index}
            className="grid grid-cols-[24px_1fr] sm:grid-cols-[30px_1fr]"
          >
            <span className="select-none pr-3 text-right text-zinc-300">
              {index + 1}
            </span>
            <code className="whitespace-pre">{line}</code>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}
