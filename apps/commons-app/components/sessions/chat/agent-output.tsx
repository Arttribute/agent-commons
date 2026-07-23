"use client";

import type React from "react";

import { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import type { StreamActivity } from "@/context/AgentContext";
import { MiniComputer } from "@/components/computers/mini-computer";
import type { AgentComputer } from "@/components/computers/computer-types";
import { ArtifactCard } from "@/components/artifacts/artifact-card";
import { collectArtifactRefs, type ArtifactRef } from "@/lib/artifacts";
import {
  AlertCircle,
  Brain,
  Check,
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
  /** The agent's persistent computer, used by the inline mini computer window. */
  computer?: AgentComputer | null;
  /** Agent identity for the small header above the response. */
  agentName?: string | null;
  agentAvatar?: string | null;
  /**
   * Show the agent identity row above this message. The caller sets it on the
   * first agent message after a user turn, so consecutive agent messages
   * don't repeat the avatar.
   */
  showAgentHeader?: boolean;
  onOpenArtifact?: (artifact: ArtifactRef) => void;
}

export default function AgentOutput({
  content,
  metadata,
  className,
  isStreaming,
  computer,
  agentName,
  agentAvatar,
  showAgentHeader = false,
  onOpenArtifact,
}: AgentOutputProps) {
  const computerToolCalls = getComputerToolCalls(metadata?.toolCalls ?? []);
  const activities = normalizeActivities(
    metadata?.activity,
    metadata?.toolCalls,
  );
  const computerActivities = activities.filter(
    (activity) => activity.kind === "computer",
  );
  const hasComputerUse =
    computerActivities.length > 0 || computerToolCalls.length > 0;
  const durationMs = metadata?.durationMs;
  const generatedArtifacts = useMemo(
    () =>
      collectArtifactRefs(
        (metadata?.toolCalls ?? [])
          .filter((call) => isArtifactCreationTool(call.name))
          .map((call) => call.result),
      ),
    [metadata?.toolCalls],
  );

  if (
    !content &&
    !isStreaming &&
    computerToolCalls.length === 0 &&
    activities.length === 0
  ) {
    return (
      <div
        className={cn(
          "post-content prose prose-sm md:prose-base lg:prose-lg dark:prose-invert",
          className,
        )}
      ></div>
    );
  }

  return (
    <div className={cn("prose max-w-none my-3", className)}>
      {showAgentHeader && (
        <div className="not-prose mb-2 flex items-center gap-2">
          <AgentAvatar name={agentName} src={agentAvatar} size={20} />
          {agentName && (
            <span className="text-xs text-muted-foreground">{agentName}</span>
          )}
        </div>
      )}
      <div>
        <div className="min-w-0">
          <ActivityTimeline
            activities={activities}
            durationMs={durationMs}
            isStreaming={Boolean(isStreaming)}
            hasContent={Boolean(content)}
          />
          {hasComputerUse && (
            <MiniComputer
              activities={computerActivities}
              toolCalls={computerToolCalls}
              computer={computer}
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
                return (
                  <td className="border border-border px-4 py-2" {...props} />
                );
              },
            }}
          >
            {content}
          </ReactMarkdown>
          {onOpenArtifact && generatedArtifacts.length > 0 && (
            <div className="not-prose mt-3 grid gap-2">
              {generatedArtifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact.fileId}
                  artifact={artifact}
                  onOpen={onOpenArtifact}
                />
              ))}
            </div>
          )}
          {isStreaming && Boolean(content) && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-indigo-400 align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}

function isArtifactCreationTool(name: string) {
  return (
    /^(create.*File|generateImage|save.*ToLibrary)$/i.test(name) ||
    name === "publishCodeProject"
  );
}

function ActivityTimeline({
  activities,
  durationMs,
  isStreaming,
  hasContent,
}: {
  activities: StreamActivity[];
  durationMs?: number;
  isStreaming: boolean;
  hasContent: boolean;
}) {
  const visible = activities.filter((activity) => !isRoutineActivity(activity));

  if (isStreaming) {
    const running = visible.some((activity) => activity.status === "running");
    // Model is working with nothing on screen yet — show the shimmer line.
    const thinking = !hasContent && !running;
    if (!visible.length) {
      return thinking ? (
        <div className="not-prose mb-3">
          <span className="text-shimmer text-[13px] leading-5">Thinking…</span>
        </div>
      ) : null;
    }
    return <StreamingSteps activities={visible} thinking={thinking} />;
  }

  // A plain reply with no real steps gets no chrome at all.
  if (!visible.length) return null;
  return (
    <CompletedActivitySummary activities={visible} durationMs={durationMs} />
  );
}

/**
 * While a run is in flight only the current step shows — one shimmering line.
 * Clicking it expands to the full timeline of earlier steps; clicking
 * anywhere in the expanded list collapses it again.
 */
function StreamingSteps({
  activities,
  thinking,
}: {
  activities: StreamActivity[];
  thinking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = thinking
    ? undefined
    : ([...activities]
        .reverse()
        .find((activity) => activity.status === "running") ??
      activities[activities.length - 1]);
  const hasHistory = activities.length > (current ? 1 : 0);

  return (
    <div className="not-prose mb-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="block w-full cursor-pointer text-left"
        title={open ? "Hide steps" : hasHistory ? "Show all steps" : undefined}
      >
        {open ? (
          <ActivityList activities={activities} thinking={thinking} />
        ) : (
          <span className="flex items-center gap-2.5">
            {(() => {
              const Icon = current ? iconForActivity(current) : CircleDashed;
              const running = !current || current.status === "running";
              return (
                <>
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      current?.status === "failed"
                        ? "text-red-500"
                        : "text-muted-foreground/70",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px] leading-5",
                      running ? "text-shimmer" : "text-muted-foreground",
                    )}
                  >
                    {current?.title ?? "Thinking…"}
                    {current?.detail ? (
                      <span
                        className={
                          running ? undefined : "text-muted-foreground/60"
                        }
                      >
                        {" "}
                        · {current.detail}
                      </span>
                    ) : null}
                  </span>
                  {hasHistory && (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  )}
                </>
              );
            })()}
          </span>
        )}
      </button>
    </div>
  );
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
        className="group inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 text-muted-foreground/60 transition-transform group-hover:text-foreground",
            open && "rotate-180",
          )}
        />
      </button>
      {open && visible.length > 0 && (
        <div className="mt-2.5">
          <ActivityList activities={visible} />
        </div>
      )}
    </div>
  );
}

/**
 * Minimal vertical timeline: small muted icons joined by a hairline, one
 * quiet line of text per step. The in-flight step shimmers; nothing else
 * carries color except a failed step's icon.
 */
function ActivityList({
  activities,
  thinking = false,
}: {
  activities: StreamActivity[];
  thinking?: boolean;
}) {
  const rows: Array<{ key: string; activity?: StreamActivity }> =
    activities.map((activity) => ({ key: activity.id, activity }));
  if (thinking) rows.push({ key: "thinking" });

  return (
    <div>
      {rows.map(({ key, activity }, index) => {
        const isLast = index === rows.length - 1;
        const Icon = activity ? iconForActivity(activity) : CircleDashed;
        const running = !activity || activity.status === "running";
        return (
          <div key={key} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <Icon
                className={cn(
                  "mt-[3px] h-3.5 w-3.5 shrink-0",
                  activity?.status === "failed"
                    ? "text-red-500"
                    : "text-muted-foreground/70",
                )}
              />
              {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className={cn("min-w-0 flex-1", !isLast && "pb-2")}>
              <span
                className={cn(
                  "block truncate text-[13px] leading-5",
                  running ? "text-shimmer" : "text-muted-foreground",
                )}
              >
                {activity?.title ?? "Thinking…"}
                {activity?.detail ? (
                  <span
                    className={running ? undefined : "text-muted-foreground/60"}
                  >
                    {" "}
                    · {activity.detail}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function iconForActivity(activity: StreamActivity) {
  if (activity.status === "failed") return AlertCircle;
  if (activity.kind === "computer") return Monitor;
  if (activity.kind === "file") return FileText;
  if (activity.kind === "model") return Brain;
  if (activity.kind === "tool") return Wrench;
  return CircleDashed;
}

function isRoutineActivity(activity: StreamActivity) {
  return ["request", "agent", "session", "tools", "context", "model"].includes(
    activity.stage ?? "",
  );
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
  if (name === "startAgentComputer")
    return failed ? "Agent computer failed" : "Agent computer ready";
  if (name === "listAgentComputers") return "Checked agent computers";
  if (name === "runComputerCommand")
    return failed ? "Terminal command failed" : "Ran terminal command";
  if (name === "readComputerFile")
    return failed ? "File read failed" : "Read computer file";
  if (name === "writeComputerFiles")
    return failed ? "File write failed" : "Updated computer files";
  if (name === "openComputerBrowser")
    return failed ? "Browser action failed" : "Updated browser";
  if (name === "testComputerBrowser")
    return failed ? "Browser tests found issues" : "Tested application";
  if (name === "createCodeProject")
    return failed ? "Project creation failed" : "Created code project";
  if (name === "writeCodeProjectFiles")
    return failed ? "Project update failed" : "Updated project files";
  if (name === "readCodeProject")
    return failed ? "Project read failed" : "Read code project";
  if (name === "publishCodeProject")
    return failed ? "Prototype build failed" : "Published prototype";
  if (name === "testCodeProject")
    return failed ? "Prototype tests found issues" : "Tested prototype";
  if (name === "exportCodeProjectToComputer")
    return failed ? "Project export failed" : "Moved project to computer";
  if (name === "readUploadedFile")
    return failed ? "File read failed" : "Read uploaded file";
  if (name === "runWorkflow")
    return failed ? "Workflow failed" : "Ran workflow";
  return failed ? `Failed ${name}` : `Used ${name}`;
}

function detailForToolCall(call: ToolCall, result: any) {
  if (call.name === "runComputerCommand")
    return call.args?.command ?? result?.command;
  if (call.name === "readComputerFile" || call.name === "readUploadedFile") {
    return result?.path ?? result?.name ?? call.args?.path ?? call.args?.fileId;
  }
  if (call.name === "writeComputerFiles")
    return call.args?.files?.map((file: any) => file.path).join(", ");
  if (
    call.name === "openComputerBrowser" ||
    call.name === "testComputerBrowser"
  )
    return result?.browser?.url ?? call.args?.url;
  if (
    ["createCodeProject", "writeCodeProjectFiles", "readCodeProject"].includes(
      call.name,
    )
  ) {
    return (
      result?.name ??
      result?.projectId ??
      call.args?.projectId ??
      call.args?.name
    );
  }
  if (["publishCodeProject", "testCodeProject"].includes(call.name)) {
    return result?.publicUrl ?? result?.url ?? call.args?.projectId;
  }
  if (call.name === "exportCodeProjectToComputer")
    return result?.directory ?? call.args?.projectId;
  if (call.name === "startAgentComputer") {
    return (
      [result?.name, result?.status].filter(Boolean).join(" · ") ||
      result?.computerId
    );
  }
  if (call.name === "runWorkflow")
    return result?.workflowId ?? call.args?.workflowId;
  return result?.error ?? call.args?.reason ?? "";
}

function formatDuration(
  durationMs: number | undefined,
  activities: StreamActivity[],
) {
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
    .map((activity) =>
      activity.timestamp ? new Date(activity.timestamp).getTime() : NaN,
    )
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
    "writeComputerFiles",
    "openComputerBrowser",
    "testComputerBrowser",
    "createCodeProject",
    "writeCodeProjectFiles",
    "readCodeProject",
    "publishCodeProject",
    "testCodeProject",
    "exportCodeProjectToComputer",
  ]);
  return toolCalls.filter((call) => names.has(call.name));
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
