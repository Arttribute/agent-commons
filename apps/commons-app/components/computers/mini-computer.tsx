"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Globe2,
  Maximize2,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamActivity } from "@/context/AgentContext";
import type { AgentComputer, ComputerRuntimeTab } from "@/components/computers/computer-types";
import {
  useComputerTheme,
  type ComputerMode,
  type ComputerTokens,
} from "@/components/computers/computer-theme";

/**
 * MiniComputer — a small computer-window rendered inline in chat messages that
 * involve agent computer use. It shows the surface the agent is actually
 * working on (terminal, browser page, file in an editor, or the desktop while
 * booting) and opens the full computer drawer when clicked.
 */

interface ToolCallLike {
  name: string;
  args?: any;
  result?: any;
  status?: string;
  timestamp?: string;
}

type Scene =
  | { id: string; kind: "terminal"; command: string; output?: string; status: SceneStatus }
  | { id: string; kind: "editor"; path?: string; code: string; status: SceneStatus }
  | { id: string; kind: "browser"; url?: string; title?: string; status: SceneStatus }
  | { id: string; kind: "desktop"; label: string; detail?: string; status: SceneStatus };

type SceneStatus = "running" | "completed" | "failed";

const COMPUTER_TOOLS = new Set([
  "startAgentComputer",
  "runComputerCommand",
  "readComputerFile",
  "openComputerBrowser",
]);

export function MiniComputer({
  activities,
  toolCalls,
  computer,
  live = false,
  className,
}: {
  activities?: StreamActivity[];
  toolCalls?: ToolCallLike[];
  computer?: AgentComputer | null;
  live?: boolean;
  className?: string;
}) {
  const scenes = useMemo(
    () => buildScenes(activities, toolCalls),
    [activities, toolCalls],
  );
  const { mode, wallpaper, tokens, codeTheme } = useComputerTheme();
  const light = mode === "light";

  const [index, setIndex] = useState(scenes.length - 1);
  const [pinned, setPinned] = useState(false);

  // Follow the newest scene while the run is live, unless the user stepped back.
  useEffect(() => {
    if (!pinned) setIndex(scenes.length - 1);
  }, [scenes.length, pinned]);

  if (scenes.length === 0) return null;

  const scene = scenes[Math.min(Math.max(index, 0), scenes.length - 1)];
  const running = live && scenes.some((item) => item.status === "running");

  const open = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("agent-computer-open", {
        detail: {
          tab: tabForScene(scene),
          computerId: computer?.computerId,
        },
      }),
    );
  };

  const step = (delta: number) => {
    setPinned(true);
    setIndex((current) =>
      Math.min(Math.max(current + delta, 0), scenes.length - 1),
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      title="Open agent computer"
      className={cn(
        "not-prose group my-3 w-full max-w-xl cursor-pointer select-none overflow-hidden rounded-xl border text-left shadow-md transition-shadow hover:shadow-lg hover:ring-1 hover:ring-indigo-400/40",
        light ? "border-zinc-200 bg-white" : "border-zinc-800/90 bg-zinc-950",
        className,
      )}
    >
      {/* Titlebar */}
      <div className={cn("flex h-8 items-center gap-2 border-b px-3", tokens.topBar)}>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full transition-colors group-hover:bg-red-400/80", light ? "bg-zinc-300" : "bg-zinc-700")} />
          <span className={cn("h-2.5 w-2.5 rounded-full transition-colors group-hover:bg-amber-400/80", light ? "bg-zinc-300" : "bg-zinc-700")} />
          <span className={cn("h-2.5 w-2.5 rounded-full transition-colors group-hover:bg-emerald-400/80", light ? "bg-zinc-300" : "bg-zinc-700")} />
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-center font-mono text-[11px]", tokens.textDim)}>
          {titleForScene(scene, computer)}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              running ? "animate-pulse bg-emerald-400" : light ? "bg-zinc-300" : "bg-zinc-600",
            )}
          />
          <Maximize2 className={cn("h-3 w-3 transition-colors", light ? "text-zinc-400 group-hover:text-zinc-600" : "text-zinc-600 group-hover:text-zinc-300")} />
        </span>
      </div>

      {/* Screen — a scaled desktop; app scenes float as a window over the wallpaper. */}
      <div className="relative h-72 overflow-hidden" style={wallpaper}>
        {scene.kind === "desktop" ? (
          <DesktopFace scene={scene} computer={computer} mode={mode} tokens={tokens} />
        ) : (
          <div className="absolute inset-3 overflow-hidden rounded-xl ring-1 ring-black/10 shadow-lg">
            {scene.kind === "terminal" && <TerminalFace scene={scene} live={running} />}
            {scene.kind === "editor" && <EditorFace scene={scene} codeTheme={codeTheme} />}
            {scene.kind === "browser" && (
              <BrowserFace scene={scene} computer={computer} mode={mode} tokens={tokens} />
            )}
          </div>
        )}
      </div>

      {/* Footer — scene stepper */}
      {scenes.length > 1 && (
        <div
          className={cn("flex h-7 items-center justify-between border-t px-2", tokens.topBar)}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={cn("rounded p-0.5 disabled:opacity-30", tokens.iconBtn)}
            disabled={index <= 0}
            onClick={() => step(-1)}
            aria-label="Previous action"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className={cn("font-mono text-[10px]", tokens.textDim)}>
            {index + 1} / {scenes.length}
          </span>
          <button
            type="button"
            className={cn("rounded p-0.5 disabled:opacity-30", tokens.iconBtn)}
            disabled={index >= scenes.length - 1}
            onClick={() => step(1)}
            aria-label="Next action"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Faces ──────────────────────────────────────────────────────────────── */

function TerminalFace({
  scene,
  live,
}: {
  scene: Extract<Scene, { kind: "terminal" }>;
  live: boolean;
}) {
  const output = tailLines(scene.output ?? "", 7);
  return (
    <div className="flex h-full flex-col bg-zinc-950 p-3 font-mono text-[11px] leading-5">
      <div className="flex items-start gap-1.5">
        <span className="shrink-0 text-emerald-400">$</span>
        <span className="break-all text-zinc-100">{scene.command}</span>
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-hidden">
        {output ? (
          <pre className="whitespace-pre-wrap break-words text-zinc-400">{output}</pre>
        ) : scene.status === "running" ? null : (
          <span className="text-zinc-600">(no output)</span>
        )}
        {scene.status === "running" && (
          <span className={cn("mt-0.5 inline-block h-3.5 w-2 bg-zinc-300", live && "animate-pulse")} />
        )}
        {scene.status === "failed" && (
          <p className="mt-1 text-red-400">command failed</p>
        )}
      </div>
    </div>
  );
}

function EditorFace({
  scene,
  codeTheme,
}: {
  scene: Extract<Scene, { kind: "editor" }>;
  codeTheme: ComputerMode;
}) {
  const lines = scene.code.split("\n").slice(0, 12);
  const name = scene.path?.split("/").pop() ?? "untitled";
  const dark = codeTheme === "dark";
  return (
    <div className={cn("flex h-full flex-col font-mono text-[11px] leading-5", dark ? "bg-zinc-950" : "bg-white")}>
      <div className={cn("flex h-7 items-center gap-2 border-b px-2", dark ? "border-white/[0.06] bg-zinc-900/60" : "border-zinc-200 bg-zinc-100")}>
        <span className={cn("flex items-center gap-1.5 rounded-t border-b-2 border-indigo-400 px-2 py-1", dark ? "text-zinc-200" : "text-zinc-700")}>
          <FileCode2 className="h-3 w-3 text-indigo-400" />
          {name}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden px-1 py-1.5">
        <div className={cn("select-none pr-3 text-right", dark ? "text-zinc-700" : "text-zinc-300")}>
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className={cn("min-w-0 flex-1 overflow-hidden whitespace-pre", dark ? "text-zinc-300" : "text-zinc-600")}>
          {lines.join("\n")}
        </pre>
      </div>
    </div>
  );
}

function BrowserFace({
  scene,
  computer,
  mode,
  tokens,
}: {
  scene: Extract<Scene, { kind: "browser" }>;
  computer?: AgentComputer | null;
  mode: ComputerMode;
  tokens: ComputerTokens;
}) {
  const url = scene.url ?? computer?.browser?.url ?? "";
  const screenshot = computer?.browser?.screenshot ?? null;
  const light = mode === "light";
  return (
    <div className={cn("flex h-full flex-col", light ? "bg-white/80" : "bg-zinc-950/70")}>
      <div className={cn("flex h-7 items-center gap-2 border-b px-2", tokens.toolbar)}>
        <Globe2 className={cn("h-3 w-3 shrink-0", tokens.textDim)} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-2 py-0.5 font-mono text-[10px]",
            light ? "bg-zinc-100 text-zinc-500" : "bg-zinc-950/80 text-zinc-400",
          )}
        >
          {url || "about:blank"}
        </span>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden", light ? "bg-zinc-50" : "")}>
        {screenshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshot}
            alt={scene.title ?? "Agent browser page"}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
            <Globe2 className={cn("h-6 w-6", tokens.textDim)} />
            <p className={cn("line-clamp-2 text-xs", tokens.textDim)}>
              {scene.title ?? (scene.status === "running" ? "Loading page..." : hostOf(url) || "Browser session")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DesktopFace({
  scene,
  computer,
  mode,
  tokens,
}: {
  scene: Extract<Scene, { kind: "desktop" }>;
  computer?: AgentComputer | null;
  mode: ComputerMode;
  tokens: ComputerTokens;
}) {
  const status = computer?.status ?? (scene.status === "running" ? "starting" : "ready");
  const booting = ["provisioning", "starting"].includes(status) || scene.status === "running";
  const light = mode === "light";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Monitor className={cn("h-7 w-7", light ? "text-zinc-500" : "text-zinc-300/90", booting && "animate-pulse")} />
      <p className={cn("font-mono text-xs lowercase", tokens.text)}>
        {computer?.name ?? scene.label}
      </p>
      <p className={cn("font-mono text-[10px] lowercase", tokens.textDim)}>
        {scene.status === "failed" ? scene.detail ?? "failed to start" : status}
      </p>
    </div>
  );
}

/* ─── Scene derivation ───────────────────────────────────────────────────── */

function buildScenes(
  activities: StreamActivity[] | undefined,
  toolCalls: ToolCallLike[] | undefined,
): Scene[] {
  if (activities?.length) {
    const scenes: Scene[] = [];
    for (const activity of activities) {
      if (activity.kind !== "computer") continue;
      const toolName = activity.toolName ?? "";
      if (!COMPUTER_TOOLS.has(toolName)) continue;
      const args = activity.payload?.args ?? {};
      const result = unwrap(
        activity.payload?.output ?? activity.payload?.result ?? activity.payload,
      );
      const scene = sceneFor(
        activity.id,
        toolName,
        args,
        result,
        activity.status === "failed"
          ? "failed"
          : activity.status === "completed"
            ? "completed"
            : "running",
        activity.detail,
      );
      if (scene) upsertScene(scenes, scene);
    }
    return scenes;
  }

  if (toolCalls?.length) {
    const scenes: Scene[] = [];
    toolCalls.forEach((call, index) => {
      if (!COMPUTER_TOOLS.has(call.name)) return;
      const result = unwrap(call.result);
      const scene = sceneFor(
        `${call.name}:${index}`,
        call.name,
        call.args ?? {},
        result,
        call.status === "error" || result?.error ? "failed" : "completed",
      );
      if (scene) scenes.push(scene);
    });
    return scenes;
  }

  return [];
}

function sceneFor(
  id: string,
  toolName: string,
  args: any,
  result: any,
  status: SceneStatus,
  detail?: string,
): Scene | null {
  if (toolName === "runComputerCommand") {
    const command = firstString(args?.command, result?.command, detail) ?? "";
    const written = parseHeredoc(command);
    if (written) {
      return { id, kind: "editor", path: written.path, code: written.code, status };
    }
    return {
      id,
      kind: "terminal",
      command: command || "(command)",
      output: firstString(result?.response, result?.output, result?.error),
      status,
    };
  }
  if (toolName === "readComputerFile") {
    return {
      id,
      kind: "editor",
      path: firstString(result?.path, args?.path, detail),
      code: firstString(result?.content) ?? "",
      status,
    };
  }
  if (toolName === "openComputerBrowser") {
    return {
      id,
      kind: "browser",
      url: firstString(result?.browser?.url, args?.url, detail),
      title: firstString(result?.browser?.title),
      status,
    };
  }
  if (toolName === "startAgentComputer") {
    return {
      id,
      kind: "desktop",
      label: firstString(result?.name, "agent computer") ?? "agent computer",
      detail: firstString(result?.errorMessage, result?.status),
      status,
    };
  }
  return null;
}

/** Replace a scene emitted earlier for the same activity (running → completed). */
function upsertScene(scenes: Scene[], scene: Scene) {
  const existing = scenes.findIndex((item) => item.id === scene.id);
  if (existing >= 0) scenes[existing] = mergeScene(scenes[existing], scene);
  else scenes.push(scene);
}

/** Keep richer fields (command/code/url captured at start) when the completion event is sparse. */
function mergeScene(previous: Scene, next: Scene): Scene {
  if (previous.kind !== next.kind) return next;
  if (previous.kind === "terminal" && next.kind === "terminal") {
    return {
      ...next,
      command: next.command === "(command)" ? previous.command : next.command,
      output: next.output ?? previous.output,
    };
  }
  if (previous.kind === "editor" && next.kind === "editor") {
    return {
      ...next,
      path: next.path ?? previous.path,
      code: next.code || previous.code,
    };
  }
  if (previous.kind === "browser" && next.kind === "browser") {
    return {
      ...next,
      url: next.url ?? previous.url,
      title: next.title ?? previous.title,
    };
  }
  return next;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function tabForScene(scene: Scene): ComputerRuntimeTab {
  if (scene.kind === "browser") return "browser";
  if (scene.kind === "editor") return "files";
  if (scene.kind === "terminal") return "terminal";
  return "files";
}

function titleForScene(scene: Scene, computer?: AgentComputer | null) {
  const host = computer?.name ? slugify(computer.name) : "commonos";
  if (scene.kind === "terminal") return `agent@${host}:~`;
  if (scene.kind === "editor") {
    return scene.path ? `${scene.path.split("/").pop()} — editor` : "editor";
  }
  if (scene.kind === "browser") return hostOf(scene.url) || "browser";
  return `agent@${host}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "commonos";
}

function hostOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function unwrap(value: any) {
  if (value == null) return {};
  if (value.data !== undefined) return value.data;
  if (value.toolData !== undefined) return value.toolData;
  return value;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function tailLines(text: string, max: number) {
  const lines = text.replace(/\s+$/, "").split("\n");
  return lines.slice(-max).join("\n");
}

/**
 * Detects file-writing commands (heredocs) so codegen renders as an editor
 * face instead of a wall of shell text: `cat > app.ts << 'EOF' ... EOF`.
 */
function parseHeredoc(command: string): { path?: string; code: string } | null {
  const marker = command.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
  if (!marker) return null;
  const afterMarker = command.slice((marker.index ?? 0) + marker[0].length);
  const lines = afterMarker.split("\n").slice(1);
  const end = lines.findIndex((line) => line.trim() === marker[1]);
  const code = (end >= 0 ? lines.slice(0, end) : lines).join("\n");
  if (!code.trim()) return null;
  const path = command
    .slice(0, marker.index)
    .match(/>{1,2}\s*([\w@./~-]+)/)?.[1]
    ?? afterMarker.match(/^[^\n]*>{1,2}\s*([\w@./~-]+)/)?.[1];
  return { path, code };
}
