"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  FlaskConical,
  Globe2,
  Loader2,
  Monitor,
  RefreshCw,
  Rocket,
  Smartphone,
  Moon,
  Sun,
  Github,
  X,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CodeProject, CodeProjectFile } from "./code-project-types";

type WorkspaceView = "code" | "preview";
type PreviewSize = "desktop" | "mobile";

export function CodeProjectSurface({
  agentId,
  projectId,
  autoRefresh = false,
  onClose,
}: {
  agentId: string;
  projectId: string;
  autoRefresh?: boolean;
  onClose: () => void;
}) {
  const [project, setProject] = useState<CodeProject | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>("code");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("desktop");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<"publish" | "verify" | "github" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agents/${agentId}/projects/${projectId}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload?.message ?? payload?.error ?? "Could not load project",
        );
      setProject(payload.data);
      setActivePath(
        (current) =>
          current ??
          payload.data?.entryFile ??
          payload.data?.files?.[0]?.path ??
          null,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load project");
    } finally {
      setLoading(false);
    }
  }, [agentId, projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(load, 2500);
    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  const activeFile = useMemo(
    () => project?.files.find((file) => file.path === activePath) ?? null,
    [activePath, project?.files],
  );
  const latest = project?.deployments?.[0];

  const runAction = async (next: "publish" | "verify" | "github") => {
    setAction(next);
    setError(null);
    try {
      const response = await fetch(
        `/api/agents/${agentId}/projects/${projectId}/${next}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message ?? payload?.error ?? `${next} failed`);
      await load();
      if (next !== "github") setView("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : `${next} failed`);
    } finally {
      setAction(null);
    }
  };

  const copyLink = async () => {
    if (!project?.publicUrl) return;
    await navigator.clipboard.writeText(project.publicUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <aside className={cn("relative z-30 flex h-full min-h-0 w-[min(920px,72vw)] shrink-0 flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl max-md:absolute max-md:inset-0 max-md:w-full", theme === "light" && "code-project-light")}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/[0.08] px-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-300">
          <Code2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-100">
            {project?.name ?? "Code project"}
          </p>
          <p className="truncate text-[10px] text-zinc-500">
            {project?.framework ?? "React"} · {project?.status ?? "loading"}
          </p>
        </div>

        <div className="ml-2 flex items-center rounded-md bg-white/[0.05] p-0.5">
          <ViewButton
            active={view === "code"}
            title="Code"
            onClick={() => setView("code")}
          >
            <Code2 className="h-3.5 w-3.5" />
          </ViewButton>
          <ViewButton
            active={view === "preview"}
            title="Preview"
            onClick={() => setView("preview")}
          >
            <Globe2 className="h-3.5 w-3.5" />
          </ViewButton>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button type="button" title={`${theme === "light" ? "Dark" : "Light"} appearance`} onClick={() => setTheme((value) => value === "light" ? "dark" : "light")} className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white">{theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}</button>
          {project?.repositoryUrl ? <a href={project.repositoryUrl} target="_blank" rel="noreferrer" title="Open GitHub repository" className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"><Github className="h-3.5 w-3.5" /></a> : <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-zinc-300 hover:bg-white/10 hover:text-white" disabled={Boolean(action)} onClick={() => runAction("github")}>{action === "github" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Github className="h-3.5 w-3.5" />}GitHub</Button>}
          {project?.publicUrl && (
            <>
              <button
                type="button"
                title="Copy public link"
                onClick={copyLink}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <a
                href={project.publicUrl}
                target="_blank"
                rel="noreferrer"
                title="Open public prototype"
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
            disabled={!project?.publicUrl || Boolean(action)}
            onClick={() => runAction("verify")}
          >
            {action === "verify" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 bg-zinc-100 px-2 text-xs text-zinc-900 hover:bg-white"
            disabled={Boolean(action)}
            onClick={() => runAction("publish")}
          >
            {action === "publish" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Rocket className="h-3.5 w-3.5" />
            )}
            Publish
          </Button>
          <button
            type="button"
            title="Close project"
            onClick={onClose}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view === "code" ? (
          <>
            <nav className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-zinc-900/40">
              <div className="flex h-8 items-center border-b border-white/[0.07] px-3 text-[10px] font-medium uppercase text-zinc-500">
                Explorer
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="py-1.5">
                  {project?.files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setActivePath(file.path)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px]",
                        activePath === file.path
                          ? "bg-indigo-500/15 text-indigo-100"
                          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
                      )}
                    >
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      <span className="truncate">{file.path}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </nav>
            <div className="flex min-w-0 flex-1 flex-col bg-zinc-950">
              <div className="flex h-8 items-center border-b border-white/[0.07] bg-zinc-900/40 px-3 font-mono text-[11px] text-zinc-300">
                {activeFile?.path ?? "Select a file"}
                {activeFile && (
                  <span className="ml-auto text-[10px] text-zinc-600">
                    v{activeFile.version} · {formatBytes(activeFile.sizeBytes)}
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {loading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
                  </div>
                ) : activeFile ? (
                  <ProjectCode file={activeFile} theme={theme} />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-600">
                    No source file selected
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col bg-zinc-900/30">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.07] px-3">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  latest?.verification?.passed
                    ? "bg-emerald-400"
                    : latest?.verification
                      ? "bg-red-400"
                    : project?.status === "failed"
                      ? "bg-red-400"
                      : "bg-amber-400",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500">
                {project?.publicUrl ?? "Publish to create a public preview"}
              </span>
              <div className="flex items-center rounded-md bg-black/30 p-0.5">
                <ViewButton
                  active={previewSize === "desktop"}
                  title="Desktop viewport"
                  onClick={() => setPreviewSize("desktop")}
                >
                  <Monitor className="h-3.5 w-3.5" />
                </ViewButton>
                <ViewButton
                  active={previewSize === "mobile"}
                  title="Mobile viewport"
                  onClick={() => setPreviewSize("mobile")}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </ViewButton>
              </div>
              <button
                type="button"
                title="Reload preview"
                onClick={load}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-zinc-800/40 p-3">
              {project?.publicUrl ? (
                <iframe
                  key={`${project.publicUrl}:${project.updatedAt}`}
                  src={project.publicUrl}
                  title={`${project.name} preview`}
                  className={cn(
                    "h-full border-0 bg-white shadow-xl transition-[width]",
                    previewSize === "mobile"
                      ? "w-[390px] max-w-full"
                      : "w-full",
                  )}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                  <Globe2 className="h-7 w-7" />
                  <span className="text-xs">No public preview yet</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ViewButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-6 w-7 items-center justify-center rounded transition-colors",
        active
          ? "bg-zinc-700 text-white shadow-sm"
          : "text-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}

function ProjectCode({ file, theme }: { file: CodeProjectFile; theme: "light" | "dark" }) {
  return (
    <SyntaxHighlighter
      language={languageOf(file.path)}
      style={theme === "dark" ? oneDark : oneLight}
      showLineNumbers
      wrapLongLines={false}
      customStyle={{
        margin: 0,
        padding: "14px 18px",
        minHeight: "100%",
        background: "transparent",
        fontSize: 12,
        lineHeight: "20px",
      }}
      lineNumberStyle={{
        minWidth: "2.5em",
        paddingRight: "1em",
        opacity: 0.3,
        userSelect: "none",
      }}
      codeTagProps={{
        style: { fontFamily: "var(--font-mono, ui-monospace, monospace)" },
      }}
    >
      {file.content || " "}
    </SyntaxHighlighter>
  );
}

function languageOf(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx" || extension === "jsx") return "tsx";
  if (extension === "ts") return "typescript";
  if (extension === "css") return "css";
  if (extension === "json") return "json";
  if (extension === "html") return "markup";
  return "javascript";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
