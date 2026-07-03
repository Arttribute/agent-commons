"use client";

import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "@agent-commons/sdk";
import { ArrowUp, FileText, ImageIcon, Loader2, Monitor, Plus, Table2, X } from "lucide-react";
import { useAgentContext } from "@/context/AgentContext";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { cn } from "@/lib/utils";

type UploadedAttachment = {
  localId: string;
  fileId?: string;
  name: string;
  mimeType: string;
  kind?: string;
  sizeBytes: number;
  status: "uploading" | "uploaded" | "error";
  textPreview?: string | null;
  error?: string;
  previewUrl?: string;
};

type ComputerConfigState = {
  enabled?: boolean;
  allowUserSelect?: boolean;
  defaultMode?: "persistent" | "ephemeral";
};

export default function ChatInputBox({
  agentId,
  sessionId,
  userId,
  disabled,
  onSessionCreated,
}: {
  agentId: string;
  sessionId: string;
  userId: string;
  disabled?: boolean;
  onSessionCreated?: (sessionId: string, title?: string) => void;
}) {
  const accumulatedRef = useRef("");
  const activitySequenceRef = useRef(0);
  const runningToolActivitiesRef = useRef<Map<string, string[]>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [computerConfig, setComputerConfig] = useState<ComputerConfigState | null>(null);
  const [computerEnabled, setComputerEnabled] = useState(false);
  const {
    addMessage,
    updateStreamingMessage,
    upsertStreamingActivity,
    finalizeStreamingMessage,
    inputText,
    setInputText,
  } =
    useAgentContext();

  const { stream, streaming } = useAgentStream(userId, {
    onToken: (token) => {
      accumulatedRef.current += token;
      updateStreamingMessage(accumulatedRef.current);
    },
    onStatus: (event) => {
      const activity = statusEventToActivity(event);
      if (activity) upsertStreamingActivity(activity);
      if (event.stage === "computer") {
        notifyComputerActivity({
          tab: "files",
          computerId: event.payload?.computerId,
        });
      }
    },
    onFinal: (payload) => {
      const content = payload?.content ?? payload?.data?.content ?? accumulatedRef.current;
      finalizeStreamingMessage(content, payload?.metadata);
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        onSessionCreated?.(payload.sessionId, payload.title ?? "");
      }
    },
    onToolStart: (toolName, input) => {
      const activityId = `tool:${toolName || "tool"}:${++activitySequenceRef.current}`;
      const queue = runningToolActivitiesRef.current.get(toolName) ?? [];
      runningToolActivitiesRef.current.set(toolName, [...queue, activityId]);
      if (isComputerTool(toolName)) {
        notifyComputerActivity({
          tab: computerTabForTool(toolName),
          input,
        });
      }
      upsertStreamingActivity({
        id: activityId,
        kind: isComputerTool(toolName) ? "computer" : "tool",
        stage: "tool",
        toolName,
        title: describeToolTitle(toolName, "running"),
        detail: summarizeToolInput(input),
        status: "running",
        timestamp: new Date().toISOString(),
      });
    },
    onTool: (event) => {
      const toolName = event.toolName ?? event.tool ?? event.name ?? "tool";
      const queue = runningToolActivitiesRef.current.get(toolName) ?? [];
      const activityId = queue.shift() ?? `tool:${toolName}:${++activitySequenceRef.current}`;
      runningToolActivitiesRef.current.set(toolName, queue);
      if (isComputerTool(toolName)) {
        notifyComputerActivity({
          tab: computerTabForTool(toolName),
          computerId: extractComputerId(event.output ?? event.result ?? event.payload),
        });
      }
      upsertStreamingActivity({
        id: activityId,
        kind: isComputerTool(toolName) ? "computer" : "tool",
        stage: "tool",
        toolName,
        title: describeToolTitle(toolName, event.status === "error" ? "failed" : "completed"),
        detail: summarizeToolResult(event.output ?? event.result ?? event.payload),
        status: event.status === "error" ? "failed" : "completed",
        timestamp: event.timestamp ?? new Date().toISOString(),
        payload: event,
      });
    },
    onToolEnd: (output, event) => {
      const toolName = event.toolName ?? "tool";
      const queue = runningToolActivitiesRef.current.get(toolName) ?? [];
      const activityId = queue[0];
      if (!activityId) return;
      upsertStreamingActivity({
        id: activityId,
        kind: isComputerTool(toolName) ? "computer" : "tool",
        stage: "tool",
        toolName,
        title: describeToolTitle(toolName, "completed"),
        detail: summarizeToolResult(output),
        status: "completed",
        timestamp: event.timestamp ?? new Date().toISOString(),
      });
    },
    onCliToolRequest: (event) => {
      const toolName = event.tool ?? event.toolName ?? "local tool";
      upsertStreamingActivity({
        id: `cli:${event.requestId ?? ++activitySequenceRef.current}`,
        kind: "tool",
        stage: "tool",
        toolName,
        title: describeToolTitle(toolName, "running"),
        detail: "Waiting for local tool execution",
        status: "running",
        timestamp: event.timestamp ?? new Date().toISOString(),
        payload: event,
      });
    },
    onAgentStep: (event) => {
      upsertStreamingActivity({
        id: `agent-step:${event.payload?.stepId ?? ++activitySequenceRef.current}`,
        kind: "status",
        stage: "agent_step",
        title: event.message ?? event.payload?.message ?? "Agent step completed",
        detail: event.payload?.name,
        status: "completed",
        timestamp: event.timestamp ?? new Date().toISOString(),
        payload: event.payload,
      });
    },
    onError: (message) => {
      upsertStreamingActivity({
        id: `error:${++activitySequenceRef.current}`,
        kind: "status",
        stage: "error",
        title: "Run interrupted",
        detail: message,
        status: "failed",
        timestamp: new Date().toISOString(),
      });
      finalizeStreamingMessage(accumulatedRef.current, { error: message });
      addMessage({
        role: "system",
        content: `Error: ${message}`,
        timestamp: new Date().toISOString(),
      });
    },
  });

  const isLoading = streaming || disabled;
  const isUploading = attachments.some((attachment) => attachment.status === "uploading");
  const canUseComputer = Boolean(computerConfig?.enabled && computerConfig?.allowUserSelect);
  const uploadedAttachments = attachments.filter(
    (attachment) => attachment.status === "uploaded" && attachment.fileId
  );

  useEffect(() => {
    let cancelled = false;
    async function loadComputerConfig() {
      try {
        const response = await fetch(`/api/agents/${agentId}/computer/config`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setComputerConfig(payload?.data ?? null);
      } catch {
        if (!cancelled) setComputerConfig(null);
      }
    }
    loadComputerConfig();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    if (computerConfig && (!computerConfig.enabled || !computerConfig.allowUserSelect)) {
      setComputerEnabled(false);
    }
  }, [computerConfig]);

  const handleSend = async () => {
    if ((!inputText.trim() && uploadedAttachments.length === 0) || isLoading || isUploading) return;

    const userMessage = inputText.trim() || "Please review the attached file(s).";
    const computerRequest = computerEnabled
      ? {
          enabled: true,
          lifecycle: computerConfig?.defaultMode === "persistent" ? "persistent" as const : "ephemeral" as const,
        }
      : undefined;
    const messageAttachments = uploadedAttachments.map((attachment) => ({
      fileId: attachment.fileId!,
      name: attachment.name,
      mimeType: attachment.mimeType,
      kind: attachment.kind,
      sizeBytes: attachment.sizeBytes,
      textPreview: attachment.textPreview,
    }));
    setInputText("");
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    previewUrlsRef.current.clear();
    setAttachments([]);
    setComputerEnabled(false);
    accumulatedRef.current = "";
    runningToolActivitiesRef.current.clear();

    addMessage({
      role: "human",
      content: userMessage,
      metadata: { attachments: messageAttachments, computerRequest },
      timestamp: new Date().toISOString(),
    });

    // Placeholder for the streaming AI message
    addMessage({
      role: "ai",
      content: "",
      metadata: {},
      timestamp: new Date().toISOString(),
      isStreaming: true,
    });

    await stream({
      agentId,
      sessionId,
      messages: [{ role: "user", content: userMessage }],
      attachments: messageAttachments.map((attachment) => ({
        fileId: attachment.fileId,
      })),
      computerRequest,
    });
  };

  const openFilePicker = () => {
    if (isLoading) return;
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (isLoading) return;
    const selected = Array.from(files).filter((file) => file.size > 0);
    if (!selected.length) return;

    const localAttachments: UploadedAttachment[] = selected.map((file) => {
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrlsRef.current.add(previewUrl);
      return {
        localId: createLocalId(),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        status: "uploading",
        previewUrl,
      };
    });

    setAttachments((current) => [...current, ...localAttachments]);

    const formData = new FormData();
    formData.set("agentId", agentId);
    if (sessionId) formData.set("sessionId", sessionId);
    selected.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "File upload failed");
      }
      const uploaded = (payload?.data ?? []) as Array<{
        fileId: string;
        name: string;
        mimeType: string;
        kind: string;
        sizeBytes: number;
        status: string;
        textPreview?: string | null;
      }>;
      setAttachments((current) =>
        current.map((attachment) => {
          const index = localAttachments.findIndex(
            (local) => local.localId === attachment.localId
          );
          if (index < 0) return attachment;
          const uploadedAttachment = uploaded[index];
          if (!uploadedAttachment) {
            return { ...attachment, status: "error", error: "Upload response was incomplete" };
          }
          return {
            ...attachment,
            fileId: uploadedAttachment.fileId,
            name: uploadedAttachment.name,
            mimeType: uploadedAttachment.mimeType,
            kind: uploadedAttachment.kind,
            sizeBytes: uploadedAttachment.sizeBytes,
            status: "uploaded",
            textPreview: uploadedAttachment.textPreview,
          };
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "File upload failed";
      setAttachments((current) =>
        current.map((attachment) =>
          localAttachments.some((local) => local.localId === attachment.localId)
            ? { ...attachment, status: "error", error: message }
            : attachment
        )
      );
    }
  };

  const removeAttachment = (localId: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.localId === localId);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.localId !== localId);
    });
  };

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrlsRef.current.clear();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative rounded-2xl bg-background border border-border shadow-sm transition-colors",
        isDragging && "border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20"
      )}
      onDragOver={(event) => {
        if (isLoading) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        if (isLoading) return;
        event.preventDefault();
        setIsDragging(false);
        uploadFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.xlsx,.xls"
        onChange={(event) => {
          if (event.target.files) uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {(computerEnabled || attachments.length > 0) && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {computerEnabled && (
            <div className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground">
                <Monitor className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block max-w-44 truncate text-foreground">Agent computer</span>
                <span className="block text-muted-foreground">
                  {computerConfig?.defaultMode === "persistent" ? "Persistent" : "Ephemeral"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setComputerEnabled(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                title="Remove"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
            />
          ))}
        </div>
      )}
      <textarea
        placeholder="Ask me something..."
        className="text-sm w-full h-16 p-3 rounded-2xl resize-none focus:outline-none bg-transparent placeholder:text-muted-foreground/60"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={isLoading}
      />
      <div className="flex justify-between items-center px-2 pb-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={!!isLoading}
            title="Add photos & files"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute bottom-9 left-0 z-10 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={openFilePicker}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-popover-foreground hover:bg-muted"
              >
                <Plus className="h-4 w-4" />
                <span>Add photos & files</span>
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (!canUseComputer) return;
                  setComputerEnabled((enabled) => !enabled);
                  setMenuOpen(false);
                }}
                disabled={!canUseComputer}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-popover-foreground hover:bg-muted",
                  !canUseComputer && "cursor-not-allowed opacity-50 hover:bg-transparent"
                )}
              >
                <Monitor className="h-4 w-4" />
                <span>{canUseComputer ? "Agent computer" : "Agent computer unavailable"}</span>
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleSend}
          disabled={(!inputText.trim() && uploadedAttachments.length === 0) || !!isLoading || isUploading}
          className="bg-foreground rounded-lg p-1.5 text-background transition-opacity disabled:opacity-40 hover:opacity-80"
        >
          {isLoading || isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: UploadedAttachment;
  onRemove: () => void;
}) {
  const Icon = attachment.mimeType.startsWith("image/")
    ? ImageIcon
    : attachment.kind === "spreadsheet" || attachment.name.match(/\.(xlsx|xls|csv)$/i)
      ? Table2
      : FileText;

  return (
    <div className="flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-xs">
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-7 w-7 rounded-md object-cover"
        />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block max-w-44 truncate text-foreground">{attachment.name}</span>
        <span className="block text-muted-foreground">
          {attachment.status === "uploading"
            ? "Uploading..."
            : attachment.status === "error"
              ? attachment.error || "Upload failed"
              : formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      {attachment.status === "uploading" && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
        title="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusEventToActivity(event: StreamEvent) {
  const stage = event.stage ?? "status";
  if (["request", "agent", "session", "tools", "context"].includes(stage)) {
    return null;
  }
  const status = normalizeActivityStatus(event.status);
  return {
    id: `status:${stage}:${event.payload?.taskId ?? event.payload?.computerId ?? ""}`,
    kind: stageToActivityKind(stage),
    stage,
    title: event.message ?? titleFromStage(stage, status),
    detail: event.content ?? event.payload?.detail ?? event.detail,
    status,
    timestamp: event.timestamp ?? new Date().toISOString(),
    payload: event.payload,
  } as const;
}

function normalizeActivityStatus(status: unknown): "queued" | "running" | "completed" | "failed" {
  if (status === "queued" || status === "running" || status === "completed" || status === "failed") {
    return status;
  }
  return "running";
}

function stageToActivityKind(stage: string): "status" | "tool" | "computer" | "file" | "model" | "task" {
  if (stage.includes("computer")) return "computer";
  if (stage.includes("file")) return "file";
  if (stage.includes("model")) return "model";
  if (stage.includes("task")) return "task";
  return "status";
}

function titleFromStage(stage: string, status: string) {
  const label = stage
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  if (status === "completed") return `${label || "Step"} complete`;
  if (status === "failed") return `${label || "Step"} failed`;
  return label || "Working";
}

function describeToolTitle(toolName: string, status: "running" | "completed" | "failed") {
  const verb =
    status === "running" ? "Using" : status === "failed" ? "Failed" : "Used";
  if (toolName === "readUploadedFile") return status === "running" ? "Reading uploaded file" : "Read uploaded file";
  if (toolName === "startAgentComputer") return status === "running" ? "Starting agent computer" : "Agent computer ready";
  if (toolName === "runComputerCommand") return status === "running" ? "Running terminal command" : "Terminal command finished";
  if (toolName === "readComputerFile") return status === "running" ? "Reading computer file" : "Read computer file";
  if (toolName === "openComputerBrowser") return status === "running" ? "Opening browser" : "Browser updated";
  return `${verb} ${humanizeToolName(toolName)}`;
}

function humanizeToolName(toolName: string) {
  return (toolName || "tool")
    .replace(/^cli_/, "local ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function summarizeToolInput(input: unknown) {
  if (!input) return undefined;
  const text = typeof input === "string" ? input : JSON.stringify(input);
  return truncateSingleLine(text, 180);
}

function summarizeToolResult(result: unknown) {
  if (!result) return undefined;
  const data = (result as any)?.data ?? (result as any)?.toolData ?? result;
  const detail =
    (data as any)?.name ??
    (data as any)?.path ??
    (data as any)?.summary ??
    (data as any)?.status ??
    (data as any)?.response ??
    (typeof data === "string" ? data : undefined);
  if (detail) return truncateSingleLine(String(detail), 180);
  if ((data as any)?.computerId) return truncateSingleLine(String((data as any).computerId), 180);
  return truncateSingleLine(JSON.stringify(data), 180);
}

function truncateSingleLine(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function isComputerTool(toolName: string) {
  return [
    "startAgentComputer",
    "listAgentComputers",
    "runComputerCommand",
    "readComputerFile",
    "openComputerBrowser",
  ].includes(toolName);
}

function computerTabForTool(toolName: string): "files" | "browser" | "terminal" {
  if (toolName === "openComputerBrowser") return "browser";
  if (toolName === "runComputerCommand") return "terminal";
  return "files";
}

function extractComputerId(value: unknown): string | undefined {
  const data = (value as any)?.data ?? (value as any)?.toolData ?? value;
  const computerId =
    (data as any)?.computerId ??
    (data as any)?.computer?.computerId ??
    (data as any)?.payload?.computerId;
  return typeof computerId === "string" ? computerId : undefined;
}

function notifyComputerActivity(detail: {
  tab?: "files" | "browser" | "terminal";
  computerId?: string;
  input?: unknown;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("agent-computer-activity", { detail }));
}
