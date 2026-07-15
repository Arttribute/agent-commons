"use client";

import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "@agent-commons/sdk";
import {
  ArrowUp,
  FileText,
  ImageIcon,
  Loader2,
  Mic,
  Monitor,
  Plus,
  Table2,
  X,
} from "lucide-react";
import { useAgentContext } from "@/context/AgentContext";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { VoiceRecorderPanel } from "./voice-recorder";
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
};

export default function ChatInputBox({
  agentId,
  sessionId,
  userId,
  disabled,
  onSessionCreated,
  onLaunch,
  initialPrompt,
  onInitialPromptSent,
  footerLeft,
  placeholder = "Ask me something...",
}: {
  agentId: string;
  sessionId: string;
  userId: string;
  disabled?: boolean;
  onSessionCreated?: (sessionId: string, title?: string) => void;
  /**
   * Launch mode: when provided, submitting hands the typed message to this
   * callback instead of streaming inline. Used by the agents overview launcher
   * to route into an agent's new-session view. Streaming/attachment chrome is
   * suppressed so the box reads as a lightweight composer.
   */
  onLaunch?: (text: string) => void;
  /** Auto-send this message once on mount (destination of a launch). */
  initialPrompt?: string | null;
  /** Called after {@link initialPrompt} has been auto-sent. */
  onInitialPromptSent?: () => void;
  /** Replaces the "+" attachments menu in the footer (e.g. an agent selector). */
  footerLeft?: React.ReactNode;
  placeholder?: string;
}) {
  const isLaunchMode = Boolean(onLaunch);
  const accumulatedRef = useRef("");
  const activitySequenceRef = useRef(0);
  const runningToolActivitiesRef = useRef<Map<string, string[]>>(new Map());
  const activityArgsRef = useRef<Map<string, any>>(new Map());
  const progressActivityIdsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [computerConfig, setComputerConfig] =
    useState<ComputerConfigState | null>(null);
  const [computerEnabled, setComputerEnabled] = useState(false);
  const {
    addMessage,
    updateStreamingMessage,
    upsertStreamingActivity,
    finalizeStreamingMessage,
    inputText,
    setInputText,
  } = useAgentContext();

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
      const content =
        payload?.content ?? payload?.data?.content ?? accumulatedRef.current;
      finalizeStreamingMessage(content, payload?.metadata);
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        onSessionCreated?.(payload.sessionId, payload.title ?? "");
      }
    },
    onToolStart: (toolName, input) => {
      const activityId = `tool:${toolName || "tool"}:${++activitySequenceRef.current}`;
      const queue = runningToolActivitiesRef.current.get(toolName) ?? [];
      runningToolActivitiesRef.current.set(toolName, [...queue, activityId]);
      const parsedArgs = safeParseArgs(input);
      if (parsedArgs) activityArgsRef.current.set(activityId, parsedArgs);
      if (isCodeProjectTool(toolName)) {
        notifyCodeProjectActivity(extractProjectId(parsedArgs));
      } else if (isComputerTool(toolName)) {
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
        detail:
          computerToolDetail(toolName, parsedArgs) ?? summarizeToolInput(input),
        status: "running",
        timestamp: new Date().toISOString(),
        payload: parsedArgs ? { args: parsedArgs } : undefined,
      });
    },
    onTool: (event) => {
      const toolName = event.toolName ?? event.tool ?? event.name ?? "tool";
      const queue = runningToolActivitiesRef.current.get(toolName) ?? [];
      const activityId =
        queue.shift() ?? `tool:${toolName}:${++activitySequenceRef.current}`;
      runningToolActivitiesRef.current.set(toolName, queue);
      const progressActivityId = progressActivityIdForEvent(event);
      if (isCodeProjectTool(toolName)) {
        notifyCodeProjectActivity(
          extractProjectId(event.output ?? event.result ?? event.payload),
        );
      } else if (isComputerTool(toolName)) {
        notifyComputerActivity({
          tab: computerTabForTool(toolName),
          computerId: extractComputerId(
            event.output ?? event.result ?? event.payload,
          ),
        });
      }
      const completionDetail = describeToolActivityDetail(
        toolName,
        activityArgsRef.current.get(activityId),
        event.output ?? event.result ?? event.payload,
      );
      upsertStreamingActivity({
        id: activityId,
        kind: isComputerTool(toolName) ? "computer" : "tool",
        stage: "tool",
        toolName,
        title: describeToolTitle(
          toolName,
          event.status === "error" ? "failed" : "completed",
        ),
        detail: completionDetail,
        status: event.status === "error" ? "failed" : "completed",
        timestamp: event.timestamp ?? new Date().toISOString(),
        payload: { ...event, args: activityArgsRef.current.get(activityId) },
      });
      if (
        isComputerTool(toolName) &&
        progressActivityIdsRef.current.has(progressActivityId)
      ) {
        progressActivityIdsRef.current.delete(progressActivityId);
        upsertStreamingActivity({
          id: progressActivityId,
          kind: "computer",
          stage: event.stage ?? "tool",
          toolName,
          title: describeToolTitle(
            toolName,
            event.status === "error" ? "failed" : "completed",
          ),
          detail: completionDetail,
          status: event.status === "error" ? "failed" : "completed",
          timestamp: event.timestamp ?? new Date().toISOString(),
          payload: event,
        });
      }
    },
    onToolProgress: (event) => {
      const toolName =
        event.toolName ??
        event.tool ??
        event.name ??
        event.payload?.toolName ??
        "tool";
      const activity = toolProgressEventToActivity(event);
      progressActivityIdsRef.current.add(activity.id);
      if (isCodeProjectTool(toolName)) {
        notifyCodeProjectActivity(
          event.payload?.projectId ?? extractProjectId(event.payload),
        );
      } else if (isComputerTool(toolName) || activity.kind === "computer") {
        notifyComputerActivity({
          tab: computerTabForTool(toolName),
          computerId:
            event.payload?.computerId ?? extractComputerId(event.payload),
          input: event.payload?.summary ?? event.detail,
        });
      }
      upsertStreamingActivity(activity);
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
        detail: describeToolActivityDetail(
          toolName,
          activityArgsRef.current.get(activityId),
          output,
        ),
        status: "completed",
        timestamp: event.timestamp ?? new Date().toISOString(),
        payload: { output, args: activityArgsRef.current.get(activityId) },
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
        title:
          event.message ?? event.payload?.message ?? "Agent step completed",
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

  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voice = useVoiceRecorder({
    onTranscribed: (text) => {
      setInputText((current) =>
        current.trim() ? `${current.trimEnd()} ${text}` : text,
      );
    },
    onError: (message) => setVoiceError(message),
  });

  const isLoading = streaming || disabled;
  const isUploading = attachments.some(
    (attachment) => attachment.status === "uploading",
  );
  const canUseComputer = Boolean(
    computerConfig?.enabled && computerConfig?.allowUserSelect,
  );
  const uploadedAttachments = attachments.filter(
    (attachment) => attachment.status === "uploaded" && attachment.fileId,
  );

  useEffect(() => {
    if (isLaunchMode || !agentId) return;
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
  }, [agentId, isLaunchMode]);

  useEffect(() => {
    if (
      computerConfig &&
      (!computerConfig.enabled || !computerConfig.allowUserSelect)
    ) {
      setComputerEnabled(false);
    }
  }, [computerConfig]);

  const computerSessionRef = useRef({ agentId, sessionId });
  useEffect(() => {
    const previous = computerSessionRef.current;
    const adoptedCreatedSession =
      previous.agentId === agentId && !previous.sessionId && Boolean(sessionId);
    if (
      previous.agentId !== agentId ||
      (!adoptedCreatedSession && previous.sessionId !== sessionId)
    ) {
      setComputerEnabled(false);
    }
    computerSessionRef.current = { agentId, sessionId };
  }, [agentId, sessionId]);

  const handleSend = async (overrideText?: string) => {
    const baseText = (overrideText ?? inputText).trim();
    if (
      (!baseText && uploadedAttachments.length === 0) ||
      isLoading ||
      isUploading
    )
      return;

    const userMessage = baseText || "Please review the attached file(s).";

    // Launch mode: hand off the message and let the caller route into the
    // destination agent's session instead of streaming here.
    if (onLaunch) {
      setInputText("");
      onLaunch(userMessage);
      return;
    }

    const computerRequest = computerEnabled
      ? {
          enabled: true,
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
    previewUrlsRef.current.forEach((previewUrl) =>
      URL.revokeObjectURL(previewUrl),
    );
    previewUrlsRef.current.clear();
    setAttachments([]);
    accumulatedRef.current = "";
    runningToolActivitiesRef.current.clear();
    activityArgsRef.current.clear();

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

  // Auto-send a handed-off prompt exactly once (arriving from the launcher).
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (isLaunchMode || autoSentRef.current) return;
    if (!initialPrompt || !initialPrompt.trim()) return;
    autoSentRef.current = true;
    handleSend(initialPrompt);
    onInitialPromptSent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const openFilePicker = () => {
    if (isLoading) return;
    setMenuOpen(false);
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (isLoading || isLaunchMode) return;
    const selected = Array.from(files).filter((file) => file.size > 0);
    if (!selected.length) return;

    const localAttachments: UploadedAttachment[] = selected.map((file) => {
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
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
        throw new Error(
          payload?.message || payload?.error || "File upload failed",
        );
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
            (local) => local.localId === attachment.localId,
          );
          if (index < 0) return attachment;
          const uploadedAttachment = uploaded[index];
          if (!uploadedAttachment) {
            return {
              ...attachment,
              status: "error",
              error: "Upload response was incomplete",
            };
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
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "File upload failed";
      setAttachments((current) =>
        current.map((attachment) =>
          localAttachments.some((local) => local.localId === attachment.localId)
            ? { ...attachment, status: "error", error: message }
            : attachment,
        ),
      );
    }
  };

  const removeAttachment = (localId: string) => {
    setAttachments((current) => {
      const removed = current.find(
        (attachment) => attachment.localId === localId,
      );
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((attachment) => attachment.localId !== localId);
    });
  };

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((previewUrl) =>
        URL.revokeObjectURL(previewUrl),
      );
      previewUrlsRef.current.clear();
    };
  }, []);

  return (
    <div
      className={cn(
        "relative rounded-2xl bg-white border border-slate-300 shadow-sm transition-colors",
        isDragging && "border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20",
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
                <span className="block max-w-44 truncate text-foreground">
                  Agent&apos;s persistent computer
                </span>
                <span className="block text-muted-foreground">
                  Same workspace in every chat
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
      {voice.state !== "idle" ? (
        <VoiceRecorderPanel
          state={voice.state}
          elapsedMs={voice.elapsedMs}
          getLevel={voice.getLevel}
          onCancel={voice.cancel}
          onAccept={voice.accept}
        />
      ) : (
        <>
          <textarea
            placeholder={placeholder}
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
          {voiceError && (
            <p className="px-3 pb-1 text-xs text-red-500">{voiceError}</p>
          )}
          <div className="flex justify-between items-center px-2 pb-2">
            {footerLeft ? (
              <div className="min-w-0">{footerLeft}</div>
            ) : (
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
                        !canUseComputer &&
                          "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <Monitor className="h-4 w-4" />
                      <span>
                        {canUseComputer
                          ? "Use agent’s computer"
                          : "Agent computer unavailable"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setVoiceError(null);
                  voice.start();
                }}
                disabled={!!isLoading || isUploading}
                title="Dictate a message"
                aria-label="Dictate a message"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Mic className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleSend()}
                disabled={
                  (!inputText.trim() && uploadedAttachments.length === 0) ||
                  !!isLoading ||
                  isUploading
                }
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
        </>
      )}
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
    : attachment.kind === "spreadsheet" ||
        attachment.name.match(/\.(xlsx|xls|csv)$/i)
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
        <span className="block max-w-44 truncate text-foreground">
          {attachment.name}
        </span>
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
  // Routine plumbing stages ("Loading tools", "Model ready", "Thinking") are
  // noise in the timeline — the UI derives its own thinking state instead.
  if (
    ["request", "agent", "session", "tools", "context", "model"].includes(stage)
  ) {
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

function toolProgressEventToActivity(event: StreamEvent) {
  const toolName =
    event.toolName ??
    event.tool ??
    event.name ??
    event.payload?.toolName ??
    "tool";
  const stage = event.stage ?? (isComputerTool(toolName) ? "computer" : "tool");
  const status = normalizeActivityStatus(event.status);
  const titleStatus =
    status === "failed"
      ? "failed"
      : status === "completed"
        ? "completed"
        : "running";
  return {
    id: progressActivityIdForEvent(event),
    kind:
      isComputerTool(toolName) || stage.includes("computer")
        ? "computer"
        : "tool",
    stage,
    toolName,
    title: event.message ?? describeToolTitle(toolName, titleStatus),
    detail:
      event.detail ??
      event.payload?.responsePreview ??
      event.payload?.summary ??
      event.payload?.commonOsStatus,
    status,
    timestamp: event.timestamp ?? new Date().toISOString(),
    payload: event.payload,
  } as const;
}

function progressActivityIdForEvent(event: StreamEvent) {
  const key =
    event.payload?.toolCallId ??
    event.toolCallId ??
    event.payload?.progressId ??
    event.payload?.commonOsMessageId ??
    event.payload?.computerId ??
    `${event.toolName ?? event.tool ?? event.name ?? "tool"}:${event.stage ?? "progress"}`;
  return `tool-progress:${key}`;
}

function normalizeActivityStatus(
  status: unknown,
): "queued" | "running" | "completed" | "failed" {
  if (
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "failed"
  ) {
    return status;
  }
  return "running";
}

function stageToActivityKind(
  stage: string,
): "status" | "tool" | "computer" | "file" | "model" | "task" {
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

function describeToolTitle(
  toolName: string,
  status: "running" | "completed" | "failed",
) {
  const verb =
    status === "running" ? "Using" : status === "failed" ? "Failed" : "Used";
  if (toolName === "readUploadedFile")
    return status === "running"
      ? "Reading uploaded file"
      : "Read uploaded file";
  if (toolName === "startAgentComputer")
    return status === "running"
      ? "Starting agent computer"
      : "Agent computer ready";
  if (toolName === "runComputerCommand")
    return status === "running"
      ? "Running terminal command"
      : "Terminal command finished";
  if (toolName === "readComputerFile")
    return status === "running"
      ? "Reading computer file"
      : "Read computer file";
  if (toolName === "openComputerBrowser")
    return status === "running" ? "Opening browser" : "Browser updated";
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

/**
 * Generic acknowledgements some tools return as their status/response.
 * They tell the user nothing, so they never qualify as a step detail.
 */
const LOW_SIGNAL_DETAILS = new Set([
  "responded",
  "response",
  "success",
  "successful",
  "ok",
  "okay",
  "done",
  "completed",
  "complete",
  "finished",
  "true",
  "false",
]);

function summarizeToolResult(result: unknown) {
  if (!result) return undefined;
  const data = (result as any)?.data ?? (result as any)?.toolData ?? result;
  const candidates = [
    (data as any)?.name,
    (data as any)?.path,
    (data as any)?.summary,
    (data as any)?.command,
    (data as any)?.url ?? (data as any)?.browser?.url,
    (data as any)?.title,
    (data as any)?.message,
    (data as any)?.stdout,
    (data as any)?.output,
    (data as any)?.text,
    (data as any)?.response,
    (data as any)?.status,
    typeof data === "string" ? data : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" && typeof candidate !== "number")
      continue;
    const text = String(candidate).trim();
    if (!text || LOW_SIGNAL_DETAILS.has(text.toLowerCase())) continue;
    return truncateSingleLine(text, 180);
  }
  if ((data as any)?.computerId)
    return truncateSingleLine(String((data as any).computerId), 180);
  return undefined;
}

/**
 * Detail line for a finished tool step: prefer what the tool actually did
 * (the command / path / url it was called with), then a meaningful result
 * summary, then the raw input as a last resort.
 */
function describeToolActivityDetail(
  toolName: string,
  args: any,
  output: unknown,
) {
  return (
    computerToolDetail(toolName, args) ??
    summarizeToolResult(output) ??
    summarizeToolInput(args)
  );
}

function truncateSingleLine(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function safeParseArgs(input: unknown): any {
  if (input == null) return undefined;
  if (typeof input === "object") return input;
  if (typeof input !== "string" || !input.trim()) return undefined;
  try {
    const parsed = JSON.parse(input);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Human-readable detail for computer tools (the command/path/url itself). */
function computerToolDetail(toolName: string, args: any): string | undefined {
  if (!args) return undefined;
  if (toolName === "runComputerCommand" && typeof args.command === "string")
    return args.command;
  if (toolName === "readComputerFile" && typeof args.path === "string")
    return args.path;
  if (toolName === "writeComputerFiles")
    return args.files?.map((file: any) => file.path).join(", ");
  if (toolName === "openComputerBrowser" && typeof args.url === "string")
    return args.url;
  if (toolName === "testComputerBrowser")
    return args.url ?? "Current browser page";
  if (isCodeProjectTool(toolName)) {
    return args.projectId ?? args.name ?? args.files?.[0]?.path;
  }
  return undefined;
}

function isComputerTool(toolName: string) {
  return [
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
  ].includes(toolName);
}

function isCodeProjectTool(toolName: string) {
  return [
    "createCodeProject",
    "writeCodeProjectFiles",
    "readCodeProject",
    "publishCodeProject",
    "testCodeProject",
    "exportCodeProjectToComputer",
  ].includes(toolName);
}

function computerTabForTool(
  toolName: string,
): "files" | "browser" | "terminal" {
  if (toolName === "openComputerBrowser" || toolName === "testComputerBrowser")
    return "browser";
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

function extractProjectId(value: unknown): string | undefined {
  const data = (value as any)?.data ?? (value as any)?.toolData ?? value;
  const projectId =
    (data as any)?.projectId ?? (data as any)?.payload?.projectId;
  return typeof projectId === "string" ? projectId : undefined;
}

function notifyComputerActivity(detail: {
  tab?: "files" | "browser" | "terminal";
  computerId?: string;
  input?: unknown;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("agent-computer-activity", { detail }));
}

function notifyCodeProjectActivity(projectId?: string) {
  if (typeof window === "undefined" || !projectId) return;
  window.dispatchEvent(
    new CustomEvent("code-project-activity", { detail: { projectId } }),
  );
}
