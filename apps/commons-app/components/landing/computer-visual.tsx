"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FileCode2,
  FolderClosed,
  Globe,
  Moon,
  RefreshCw,
  Settings2,
  SquareTerminal,
} from "lucide-react";
import {
  TrafficLights,
  WindowFrame,
} from "@/components/computers/desktop-window";
import { MacFileIcon, MacFolderIcon } from "@/components/computers/mac-icons";

const APPS = [
  { id: "browser", label: "Browser", icon: Globe },
  { id: "code", label: "Code", icon: FileCode2 },
  { id: "files", label: "Files", icon: FolderClosed },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
] as const;

const ROTATION = ["files", "terminal", "browser", "code"] as const;
type ComputerApp = (typeof APPS)[number]["id"];

export function ComputerVisual() {
  const [app, setApp] = useState<ComputerApp>("files");

  useEffect(() => {
    const timer = window.setInterval(() => {
      setApp((current) => {
        const index = ROTATION.indexOf(current);
        return ROTATION[(index + 1) % ROTATION.length];
      });
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-stone-200 bg-white shadow-[0_28px_80px_-38px_rgba(28,25,23,0.35)]">
      <div className="flex h-11 items-center gap-2 border-b border-zinc-200/80 bg-white/90 px-2.5 backdrop-blur">
        <TrafficLights className="mr-1 hidden sm:flex" tone="light" />
        <button
          type="button"
          onClick={() => setApp("files")}
          className="flex min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left shadow-sm"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-[11px] font-medium text-zinc-800">
              Scout&apos;s computer
            </span>
            <span className="truncate text-[9px] uppercase tracking-wide text-zinc-400">
              running
            </span>
          </span>
        </button>

        <span className="h-5 w-px bg-zinc-200" />

        <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5">
          {APPS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={`Show ${label}`}
              onClick={() => setApp(id)}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                app === id
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-black/5"
                  : "text-zinc-400 hover:text-zinc-700"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-0.5 sm:flex">
          {[Moon, RefreshCw, Settings2].map((Icon, index) => (
            <span
              key={index}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400"
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-h-[390px] overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.96),transparent_32%),linear-gradient(135deg,#eef2f2_0%,#e5e8e7_48%,#f2f0ed_100%)] p-3 sm:p-5">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(#a8a29e_0.7px,transparent_0.7px)] [background-size:22px_22px]" />
        <div className="relative mx-auto h-[354px] max-w-[650px]">
          {app === "files" && <FilesWindow />}
          {app === "terminal" && <TerminalWindow />}
          {app === "browser" && <BrowserWindow />}
          {app === "code" && <CodeWindow />}
        </div>
      </div>
    </div>
  );
}

function FilesWindow() {
  const files = [
    { name: "research", folder: true },
    { name: "briefs", folder: true },
    { name: "site", folder: true },
    { name: "launch-plan.md", folder: false },
    { name: "sources.json", folder: false },
    { name: "homepage.tsx", folder: false },
  ];

  return (
    <WindowFrame
      tone="light"
      icon={<FolderClosed className="h-3 w-3 text-zinc-400" />}
      title="Workspace"
      className="h-full"
      bodyClassName="bg-white"
      toolbar={
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50/90 px-2 py-1.5">
          <span className="flex h-6 w-6 items-center justify-center rounded text-zinc-400">
            <ArrowLeft className="h-3.5 w-3.5" />
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px] text-zinc-500">
            workspace <ChevronRight className="h-3 w-3 opacity-60" /> projects
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        <aside className="hidden w-36 shrink-0 border-r border-zinc-200 bg-zinc-50/80 p-2 sm:block">
          <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Favorites
          </p>
          <p className="mt-1 flex items-center gap-2 rounded-md bg-zinc-200/70 px-2 py-1.5 text-[11px] font-medium text-zinc-700">
            <FolderClosed className="h-3.5 w-3.5 text-indigo-400" /> Workspace
          </p>
        </aside>
        <div className="grid flex-1 grid-cols-3 content-start gap-1 p-4 sm:grid-cols-4">
          {files.map((file) => (
            <div
              key={file.name}
              className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center"
            >
              <span className="flex h-12 items-center justify-center">
                {file.folder ? (
                  <MacFolderIcon className="h-11 w-auto" />
                ) : (
                  <MacFileIcon name={file.name} className="h-12 w-auto" />
                )}
              </span>
              <span className="line-clamp-2 max-w-full break-all text-[10px] leading-tight text-zinc-700">
                {file.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </WindowFrame>
  );
}

function TerminalWindow() {
  return (
    <WindowFrame
      icon={<SquareTerminal className="h-3 w-3 text-zinc-400" />}
      title="agent@scout · zsh"
      className="h-full"
      bodyClassName="bg-zinc-950/95"
    >
      <div className="flex h-full flex-col font-mono text-[11px] leading-6 text-zinc-400 sm:text-xs">
        <div className="flex-1 p-5 sm:p-6">
          <p className="text-zinc-200">
            <span className="text-emerald-400">❯</span> pnpm run build
          </p>
          <p className="mt-2 text-zinc-500">
            $ next build --project site
          </p>
          <p className="mt-2">
            ✓ Compiled <span className="text-zinc-300">homepage.tsx</span>,{" "}
            <span className="text-zinc-300">projects.tsx</span> (2.1s)
          </p>
          <p>✓ Generated 14 static pages</p>
          <p className="text-zinc-500">
            route / 92.4 kB · route /projects 87.1 kB
          </p>
          <p className="mt-3 text-zinc-200">
            <span className="text-emerald-400">❯</span> pnpm run deploy
          </p>
          <p className="mt-2">Uploading build to preview.agentcommons.site…</p>
          <p className="flex items-center gap-2 text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Deployed in 6.8s
          </p>
          <p className="flex items-center gap-2 text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Morning brief scheduled for 07:00
          </p>
        </div>
        <div className="flex items-center gap-2 border-t border-white/[0.07] bg-black/40 px-3 py-2">
          <span className="text-emerald-400">❯</span>
          <span className="inline-block h-3 w-1.5 animate-caret-blink bg-zinc-500" />
        </div>
      </div>
    </WindowFrame>
  );
}

function BrowserWindow() {
  return (
    <WindowFrame
      tone="light"
      icon={<Globe className="h-3 w-3 text-zinc-400" />}
      title="Atelier North"
      className="h-full"
      bodyClassName="bg-white"
      toolbar={
        <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-zinc-50 px-2 py-1.5">
          <span className="flex items-center gap-1 px-1 text-zinc-400">
            <ArrowLeft className="h-3.5 w-3.5" />
            <ArrowRight className="h-3.5 w-3.5" />
            <RefreshCw className="ml-1 h-3.5 w-3.5" />
          </span>
          <div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 font-mono text-[10px] text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            preview.agentcommons.site
          </div>
        </div>
      }
    >
      <div className="relative h-full min-h-[300px] overflow-hidden">
        <Image
          src="/landing/coastal-architecture.webp"
          alt="A generated preview of a modern architecture website"
          fill
          sizes="(max-width: 768px) 90vw, 650px"
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
    </WindowFrame>
  );
}

function CodeLines() {
  const v = (text: string) => (
    <span className="text-violet-600">{text}</span>
  );
  const s = (text: string) => (
    <span className="text-emerald-700">{text}</span>
  );
  const lines: React.ReactNode[] = [
    <>
      {v("import")} {"{ Hero, ProjectGrid }"} {v("from")}{" "}
      {s('"@/components/site"')};
    </>,
    <>
      {v("import")} {"{ getProjects }"} {v("from")} {s('"@/lib/cms"')};
    </>,
    <>&nbsp;</>,
    <>
      {v("export const")} revalidate = 3600;
    </>,
    <>&nbsp;</>,
    <>
      {v("export default async function")} Home() {"{"}
    </>,
    <>
      {"  "}
      {v("const")} projects = {v("await")} getProjects({"{ featured: true }"});
    </>,
    <>&nbsp;</>,
    <>
      {"  "}
      {v("return")} (
    </>,
    <>{"    <main>"}</>,
    <>{"      <Hero"}</>,
    <>
      {"        title="}
      {s('"Space, shaped by nature."')}
    </>,
    <>
      {"        subtitle="}
      {s('"Quiet homes for wild places."')}
    </>,
    <>{"      />"}</>,
    <>{"      <ProjectGrid projects={projects} columns={3} />"}</>,
    <>{"    </main>"}</>,
    <>{"  );"}</>,
    <>{"}"}</>,
  ];

  return (
    <div className="overflow-hidden p-4 font-mono text-[10px] leading-[1.55] text-zinc-600 sm:text-[11px]">
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-[22px_1fr]">
          <span className="select-none pr-2 text-right text-zinc-300">
            {index + 1}
          </span>
          <code className="whitespace-pre">{line}</code>
        </div>
      ))}
    </div>
  );
}

function CodeWindow() {
  return (
    <WindowFrame
      tone="light"
      icon={<FileCode2 className="h-3 w-3 text-zinc-400" />}
      title="homepage.tsx"
      className="h-full"
      bodyClassName="bg-white"
    >
      <div className="grid h-full grid-cols-[112px_1fr] text-zinc-700 sm:grid-cols-[150px_1fr]">
        <aside className="border-r border-zinc-200 bg-zinc-50/80 p-3">
          <p className="mb-3 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
            Explorer
          </p>
          <p className="flex items-center gap-1.5 rounded-md bg-zinc-200/70 px-2 py-1.5 text-[10px] font-medium">
            <FolderClosed className="h-3 w-3" /> site
          </p>
          <p className="mt-1 flex items-center gap-1.5 px-3 py-1 text-[10px]">
            <FileCode2 className="h-3 w-3 text-blue-500" /> homepage.tsx
          </p>
        </aside>
        <CodeLines />
      </div>
    </WindowFrame>
  );
}
