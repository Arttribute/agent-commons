import { FileCode2, FolderClosed, Globe, SquareTerminal } from "lucide-react";

/**
 * The agent computer at carousel scale: the same idea as the full desktop on
 * the old page — a live machine with apps and a workspace — drawn small enough
 * that every label stays crisp instead of being scaled into a blur.
 */
const APPS = [
  { icon: FolderClosed, active: true },
  { icon: SquareTerminal, active: false },
  { icon: Globe, active: false },
  { icon: FileCode2, active: false },
];

const FILES = [
  { name: "research", folder: true },
  { name: "briefs", folder: true },
  { name: "site", folder: true },
  { name: "launch-plan.md", folder: false },
  { name: "sources.json", folder: false },
  { name: "homepage.tsx", folder: false },
];

export function ComputerMiniVisual() {
  return (
    <div className="w-[420px] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-stone-200" />
          <span className="h-2 w-2 rounded-full bg-stone-200" />
          <span className="h-2 w-2 rounded-full bg-stone-200" />
        </span>
        <span className="ml-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-[11px] font-medium text-stone-700">
            Scout&apos;s computer
          </span>
          <span className="text-[9px] uppercase tracking-wide text-stone-400">
            Running
          </span>
        </span>
      </div>

      <div className="flex">
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-stone-50/70 py-2.5">
          {APPS.map(({ icon: Icon, active }, i) => (
            <span
              key={i}
              className={`flex h-6 w-6 items-center justify-center rounded-md ${
                active ? "bg-white shadow-card text-stone-700" : "text-stone-400"
              }`}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="border-b border-stone-100 px-3 py-1.5 font-mono text-[9px] text-stone-400">
            workspace / projects
          </div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 px-3 py-3">
            {FILES.map((file) => (
              <span key={file.name} className="flex items-center gap-1.5">
                <span
                  className={`h-3.5 w-3 shrink-0 rounded-[2px] border ${
                    file.folder
                      ? "border-stone-300 bg-stone-100"
                      : "border-stone-200 bg-white"
                  }`}
                />
                <span className="truncate text-[10px] text-stone-600">
                  {file.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
