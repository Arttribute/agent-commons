"use client";

import type React from "react";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { StreamActivity } from "@/context/AgentContext";
import { MiniComputer } from "@/components/computers/mini-computer";
import type { AgentComputer } from "@/components/computers/computer-types";
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Copy,
  FileText,
  Monitor,
  Wrench,
} from "lucide-react";

interface ToolCall {
  name: string;
  args: any;
  result?: any;
  status?: "success" | "error" | string;
  timestamp?: string;
}

interface AgentCall {
  agentId: string;
  message: string;
  response?: any;
  sessionId?: string;
}

interface AgentOutputProps {
  content: string;
  metadata?: {
    activity?: StreamActivity[];
    durationMs?: number;
    toolCalls?: ToolCall[];
    agentCalls?: AgentCall[];
  };
  className?: string;
  isStreaming?: boolean;
  /** Live session computers, used by the inline mini computer window. */
  computers?: AgentComputer[];
}

export default function AgentOutput({
  content,
  metadata,
  className,
  isStreaming,
  computers,
}: AgentOutputProps) {
  const computerToolCalls = getComputerToolCalls(metadata?.toolCalls ?? []);
  const activities = normalizeActivities(metadata?.activity, metadata?.toolCalls);
  const computerActivities = activities.filter((activity) => activity.kind === "computer");
  const hasComputerUse = computerActivities.length > 0 || computerToolCalls.length > 0;
  const activeComputer = pickComputer(computers, computerActivities);
  const durationMs = metadata?.durationMs;

  if (!content && !isStreaming && computerToolCalls.length === 0 && activities.length === 0) {
    return (
      <div
        className={cn(
          "post-content prose prose-sm md:prose-base lg:prose-lg dark:prose-invert",
          className
        )}
      ></div>
    );
  }

  return (
    <div className={cn("prose max-w-none my-3", className)}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0 h-6 w-6 rounded-full bg-indigo-50 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 text-indigo-500" />
        </div>
        <div className="flex-1 min-w-0">
          <ActivityTimeline
            activities={activities}
            durationMs={durationMs}
            isStreaming={Boolean(isStreaming)}
          />
          {hasComputerUse && (
            <MiniComputer
              activities={computerActivities}
              toolCalls={computerToolCalls}
              computer={activeComputer}
              live={Boolean(isStreaming)}
            />
          )}
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              h1: ({ node, ...props }) => (
                <h1
                  className="text-2xl font-bold mt-4 mb-2 pb-1 border-b"
                  {...props}
                />
              ),
              h2: ({ node, ...props }) => (
                <h2 className="text-xl font-bold mt-3 mb-2" {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-lg font-bold mt-2 mb-1" {...props} />
              ),
              h4: ({ node, ...props }) => (
                <h4 className=" font-bold mt-2 mb-1" {...props} />
              ),
              p: ({ node, ...props }) => (
                <p className="text-sm my-2 leading-relaxed" {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul className="text-sm my-2 ml-1 list-disc" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="text-sm my-2 ml-1 list-decimal" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="text-sm my-1" {...props} />
              ),
              blockquote: ({ node, ...props }) => (
                <blockquote
                  className="text-sm border-l-4 border-muted pl-4 italic my-4"
                  {...props}
                />
              ),
              code({
                inline,
                className,
                children,
                ...props
              }: {
                inline?: boolean;
                className?: string;
                children?: React.ReactNode;
              }) {
                const match = /language-(\w+)/.exec(className || "");
                const language = match ? match[1] : "";
                const isExecutable =
                  language === "js" ||
                  language === "javascript" ||
                  language === "typescript";

                return !inline && match ? (
                  <CodeBlock
                    language={language}
                    code={String(children).replace(/\n$/, "")}
                  >
                    {/* {isExecutable && (
                      <div
                        ref={codeExecutorRef}
                        className="mt-2 p-4 bg-muted rounded-md font-mono text-sm"
                        data-code-output="true"
                      >
                        <div className="text-muted-foreground">
                          Output will appear here when you run the code
                        </div>
                      </div>
                    )} */}
                  </CodeBlock>
                ) : (
                  <code className="rounded text-sm font-mono " {...props}>
                    {children}
                  </code>
                );
              },
              img({ node, ...props }) {
                return (
                  <img
                    className="rounded-md my-6 max-w-full h-auto"
                    {...props}
                    loading="lazy"
                  />
                );
              },
              a({ node, ...props }) {
                return (
                  <a
                    className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  />
                );
              },
              table({ node, ...props }) {
                return (
                  <div className="my-6 overflow-x-auto">
                    <table className="border-collapse w-full" {...props} />
                  </div>
                );
              },
              th({ node, ...props }) {
                return (
                  <th
                    className="border border-border px-4 py-2 bg-muted font-bold text-left"
                    {...props}
                  />
                );
              },
              td({ node, ...props }) {
                return <td className="border border-border px-4 py-2" {...props} />;
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 rounded-sm animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityTimeline({
  activities,
  durationMs,
  isStreaming,
}: {
  activities: StreamActivity[];
  durationMs?: number;
  isStreaming: boolean;
}) {
  const visible = activities.filter((activity) => !isRoutineActivity(activity));
  if (!visible.length && (!durationMs || isStreaming)) return null;

  if (isStreaming) {
    const current =
      [...visible].reverse().find((activity) => activity.status === "running") ??
      visible[visible.length - 1];
    if (!current) return null;
    return (
      <div className="not-prose mb-3">
        <ActivityRow activity={current} compact />
      </div>
    );
  }

  return <CompletedActivitySummary activities={visible} durationMs={durationMs} />;
}

function CompletedActivitySummary({
  activities,
  durationMs,
}: {
  activities: StreamActivity[];
  durationMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const label = `Worked for ${formatDuration(durationMs, activities)}`;
  const visible = activities.slice(-12);
  return (
    <div className="not-prose mb-3">
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-muted/25 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span>{label}</span>
        {visible.length > 0 && (
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        )}
      </button>
      {open && visible.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {visible.map((activity) => (
            <ActivityRow key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  activity,
  compact = false,
}: {
  activity: StreamActivity;
  compact?: boolean;
}) {
  const Icon = iconForActivity(activity);
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-border/70 bg-muted/25 px-3 py-2 text-xs",
        compact && "inline-flex max-w-full",
        activity.status === "failed" && "border-destructive/30 bg-destructive/5"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground",
          activity.status === "running" && "text-indigo-500",
          activity.status === "completed" && "text-emerald-600",
          activity.status === "failed" && "text-destructive"
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            activity.status === "running" && "animate-pulse"
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">
          {activity.title}
        </span>
        {activity.detail ? (
          <span className="mt-0.5 block truncate text-muted-foreground">
            {activity.detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function iconForActivity(activity: StreamActivity) {
  if (activity.status === "failed") return AlertCircle;
  if (activity.status === "completed") return CheckCircle2;
  if (activity.kind === "computer") return Monitor;
  if (activity.kind === "file") return FileText;
  if (activity.kind === "model") return Brain;
  if (activity.kind === "tool") return Wrench;
  return CircleDashed;
}

function isRoutineActivity(activity: StreamActivity) {
  return ["request", "agent", "session", "tools", "context"].includes(activity.stage ?? "");
}

function normalizeActivities(
  activities: StreamActivity[] | undefined,
  toolCalls: ToolCall[] | undefined,
) {
  if (Array.isArray(activities) && activities.length > 0) return activities;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
  return toolCalls.map((call, index) => {
    const result = unwrapToolResult(call.result);
    const isComputer = getComputerToolCalls([call]).length > 0;
    return {
      id: `persisted-tool:${call.name}:${index}`,
      stage: "tool",
      title: titleForToolCall(call.name, call.status ?? result?.status),
      detail: detailForToolCall(call, result),
      status: call.status === "error" || result?.error ? "failed" : "completed",
      kind: isComputer ? "computer" : "tool",
      toolName: call.name,
      timestamp: call.timestamp,
      // Mirror the live streaming payload shape ({ args, output }) so the mini
      // computer's scene builder reconstructs terminal/browser/editor faces
      // identically whether the run is streaming or reloaded from history.
      payload: { args: call.args, output: call.result },
    } satisfies StreamActivity;
  });
}

function titleForToolCall(name: string, status?: string) {
  const failed = status === "error" || status === "failed";
  if (name === "startAgentComputer") return failed ? "Agent computer failed" : "Agent computer ready";
  if (name === "listAgentComputers") return "Checked agent computers";
  if (name === "runComputerCommand") return failed ? "Terminal command failed" : "Ran terminal command";
  if (name === "readComputerFile") return failed ? "File read failed" : "Read computer file";
  if (name === "openComputerBrowser") return failed ? "Browser action failed" : "Updated browser";
  if (name === "readUploadedFile") return failed ? "File read failed" : "Read uploaded file";
  if (name === "runWorkflow") return failed ? "Workflow failed" : "Ran workflow";
  return failed ? `Failed ${name}` : `Used ${name}`;
}

function detailForToolCall(call: ToolCall, result: any) {
  if (call.name === "runComputerCommand") return call.args?.command ?? result?.command;
  if (call.name === "readComputerFile" || call.name === "readUploadedFile") {
    return result?.path ?? result?.name ?? call.args?.path ?? call.args?.fileId;
  }
  if (call.name === "openComputerBrowser") return result?.browser?.url ?? call.args?.url;
  if (call.name === "startAgentComputer") {
    return [result?.name, result?.status, result?.lifecycle].filter(Boolean).join(" · ") || result?.computerId;
  }
  if (call.name === "runWorkflow") return result?.workflowId ?? call.args?.workflowId;
  return result?.error ?? call.args?.reason ?? "";
}

function formatDuration(durationMs: number | undefined, activities: StreamActivity[]) {
  const fallbackMs = estimateDurationFromActivities(activities);
  const ms = durationMs && durationMs > 0 ? durationMs : fallbackMs;
  if (!ms || ms < 1000) return "a moment";
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function estimateDurationFromActivities(activities: StreamActivity[]) {
  const times = activities
    .map((activity) => activity.timestamp ? new Date(activity.timestamp).getTime() : NaN)
    .filter((value) => Number.isFinite(value));
  if (times.length < 2) return undefined;
  return Math.max(...times) - Math.min(...times);
}

function getComputerToolCalls(toolCalls: ToolCall[]) {
  const names = new Set([
    "startAgentComputer",
    "listAgentComputers",
    "runComputerCommand",
    "readComputerFile",
    "openComputerBrowser",
  ]);
  return toolCalls.filter((call) => names.has(call.name));
}

/**
 * Choose the computer whose live state (screenshot, status) backs the mini
 * window: prefer one referenced by the activities, else the busiest one.
 */
function pickComputer(
  computers: AgentComputer[] | undefined,
  activities: StreamActivity[],
): AgentComputer | null {
  if (!computers?.length) return null;
  for (let i = activities.length - 1; i >= 0; i -= 1) {
    const payload = activities[i].payload;
    const out = payload?.output ?? payload?.result ?? payload;
    const unwrapped = out?.data ?? out?.toolData ?? out;
    const id =
      payload?.computerId ??
      unwrapped?.computerId ??
      unwrapped?.computer?.computerId ??
      payload?.args?.computerId;
    const match = computers.find((computer) => computer.computerId === id);
    if (match) return match;
  }
  const active = computers.filter((computer) =>
    ["provisioning", "starting", "running", "idle"].includes(computer.status),
  );
  const pool = active.length ? active : computers;
  return [...pool].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0];
}

function unwrapToolResult(result: any) {
  if (result?.data !== undefined) return result.data;
  if (result?.toolData !== undefined) return result.toolData;
  return result ?? {};
}

interface CodeBlockProps {
  language: string;
  code: string;
  children?: React.ReactNode;
}

function CodeBlock({ language, code, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div className="my-4 rounded-md overflow-hidden">
      <div className="flex items-center justify-between bg-muted text-muted-foreground px-4 py-2 text-xs font-mono">
        <span>{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={copyToClipboard}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 mr-1" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        style={atomDark}
        language={language}
        PreTag="div"
        className="rounded-b-md"
        showLineNumbers
      >
        {code}
      </SyntaxHighlighter>
      {children}
    </div>
  );
}
