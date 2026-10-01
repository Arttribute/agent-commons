"use client";

import { useEffect, useRef, useState } from "react";
import { ComposerSurface } from "@agent-commons/ui";
import "@agent-commons/ui/styles.css";
import type { StreamEvent } from "@agent-commons/sdk";
import Link from "next/link";
import {
  BatteryLow,
  Brain,
  Check,
  Gauge,
  FolderOpen,
  Globe2,
  HardDriveUpload,
  LibraryBig,
  Loader2,
  Mic,
  Monitor,
  Plus,
  Plug,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAgentContext } from "@/context/AgentContext";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { BRAVE_SEARCH_BASE_URL, hasConfiguredLocalWebSearch, type LocalSettings } from "@agent-commons/desktop-contract";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { useSessionRunStore } from "@/stores/session-run-store";
import { VoiceRecorderPanel } from "./voice-recorder";
import { ComposerSendButton, ComposerTextArea } from "./composer-controls";
import { cn } from "@/lib/utils";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { notifySessionsChanged } from "@/hooks/sessions/use-user-sessions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  readProvenancePreferences,
  writeProvenancePreferences,
  type ProvenancePreferences,
} from "@/lib/provenance-preferences";
import {
  LibraryPickerDialog,
  type LibraryPickerItem,
} from "./library-picker-dialog";

/** User-selectable model thinking depth for this conversation. */
const THINKING_LEVELS = [
  { key: "auto", label: "Auto", detail: "Let the agent decide" },
  { key: "low", label: "Quick", detail: "Fastest responses" },
  { key: "medium", label: "Balanced", detail: "Everyday tasks" },
  { key: "high", label: "Thorough", detail: "Harder problems" },
  { key: "xhigh", label: "Max", detail: "Deepest reasoning" },
] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number]["key"];

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

type KnowledgeSpaceOption = {
  spaceId: string;
  name: string;
  permission?: "read" | "write" | "manage";
  counts?: { documents?: number };
};

/** Everything a new chat needs to send its first message in the session view. */
export type ComposerLaunch = {
  text: string;
  attachments: Array<{
    fileId: string;
    name: string;
    mimeType: string;
    kind?: string;
    sizeBytes: number;
    textPreview?: string | null;
    previewUrl?: string;
  }>;
  knowledgeSpaceIds: string[];
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  webSearchEnabled?: boolean;
  mcpServerIds?: string[];
  workspaceRoot?: string | null;
};

export type ExternalComposerPrompt = {
  id: string;
  text: string;
  mode?: "send" | "draft";
  attachment?: {
    fileId: string;
    name: string;
    mimeType: string;
    kind?: string;
    sizeBytes: number;
    textPreview?: string | null;
    previewUrl?: string;
  };
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
  allowComputer = true,
  uiContext,
  externalPrompt,
  initialLaunch,
  onInitialLaunchSent,
  projectId,
  launching = false,
}: {
  agentId: string;
  sessionId: string;
  userId: string;
  disabled?: boolean;
  onSessionCreated?: (sessionId: string, title?: string) => void;
  /**
   * Launch mode: submitting hands the message, attachments, and selected
   * Knowledge Spaces to this callback instead of streaming inline. Used by
   * launchers that open the new chat in its session view.
   */
  onLaunch?: (launch: ComposerLaunch) => void;
  /** Auto-send this launch once on mount (the destination of a launcher). */
  initialLaunch?: ComposerLaunch | null;
  onInitialLaunchSent?: () => void;
  /** Project for a chat started here without an existing session. */
  projectId?: string;
  /** Shows the send button as busy while a launcher opens the chat. */
  launching?: boolean;
  /** Auto-send this message once on mount (destination of a launch). */
  initialPrompt?: string | null;
  /** Called after {@link initialPrompt} has been auto-sent. */
  onInitialPromptSent?: () => void;
  /** Replaces the "+" attachments menu in the footer (e.g. an agent selector). */
  footerLeft?: React.ReactNode;
  placeholder?: string;
  allowComputer?: boolean;
  uiContext?: Record<string, unknown>;
  externalPrompt?: ExternalComposerPrompt | null;
}) {
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const isLaunchMode = Boolean(onLaunch);
  const accumulatedRef = useRef("");
  const activitySequenceRef = useRef(0);
  const runningToolActivitiesRef = useRef<Map<string, string[]>>(new Map());
  const activityArgsRef = useRef<Map<string, any>>(new Map());
  const progressActivityIdsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const restoreComposerFocusRef = useRef(false);
  const previewUrlsRef = useRef<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [knowledgeSpaces, setKnowledgeSpaces] = useState<
    KnowledgeSpaceOption[]
  >([]);
  const [knowledgeSpaceIds, setKnowledgeSpaceIds] = useState<string[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("auto");
  const [provenance, setProvenance] = useState<ProvenancePreferences>({
    mode: "metadata",
    onchain: false,
  });
  const [outOfCredits, setOutOfCredits] = useState(false);
  // Narrow surfaces (the copilot side panel) get the short one-line notice.
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    setProvenance(readProvenancePreferences());
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setKnowledgeLoading(true);
    if (local) {
      void window.agentCommonsLocal?.getState().then((state) => {
        if (cancelled) return;
        const spaces = state.spaces.map((space) => ({
          spaceId: space.id,
          name: space.name,
          permission: "manage" as const,
          counts: { documents: space.files.length },
        }));
        setKnowledgeSpaces(spaces);
        setKnowledgeSpaceIds((current) => current.filter((id) => spaces.some((space) => space.spaceId === id)));
      }).finally(() => { if (!cancelled) setKnowledgeLoading(false); });
      return () => { cancelled = true; };
    }
    fetch("/api/knowledge", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) return;
        const spaces = Array.isArray(payload?.data) ? payload.data : [];
        setKnowledgeSpaces(spaces);
        setKnowledgeSpaceIds((current) =>
          current.filter((id) =>
            spaces.some((space: KnowledgeSpaceOption) => space.spaceId === id),
          ),
        );
      })
      .finally(() => {
        if (!cancelled) setKnowledgeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isLaunchMode, userId, local]);

  const updateProvenance = (next: ProvenancePreferences) => {
    setProvenance(next);
    writeProvenancePreferences(next);
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      setIsNarrow(width > 0 && width < 400);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The composer is locked while out of credits, so re-check the balance
  // whenever the user comes back (e.g. after topping up in another tab).
  useEffect(() => {
    if (!outOfCredits || local) return;
    const recheck = async () => {
      try {
        const response = await fetch("/api/credits", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && (payload?.data?.balance?.available ?? 0) > 0) {
          setOutOfCredits(false);
        }
      } catch {
        // Keep the banner; the next focus tries again.
      }
    };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, [outOfCredits, local]);
  const [computerConfig, setComputerConfig] =
    useState<ComputerConfigState | null>(null);
  const [computerEnabled, setComputerEnabled] = useState(false);
  const [desktopWorkspace, setDesktopWorkspace] = useState<string | null>(null);
  const [webSearchConfigured, setWebSearchConfigured] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchDialogOpen, setWebSearchDialogOpen] = useState(false);
  const [webSearchProvider, setWebSearchProvider] = useState<"brave" | "searxng">("brave");
  const [webSearchUrl, setWebSearchUrl] = useState("");
  const [webSearchApiKey, setWebSearchApiKey] = useState("");
  const [webSearchSaving, setWebSearchSaving] = useState(false);
  const [webSearchError, setWebSearchError] = useState("");
  const [mcpServers, setMcpServers] = useState<NonNullable<LocalSettings["mcpServers"]>>([]);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [workspaceRemoved, setWorkspaceRemoved] = useState(false);
  useEffect(() => {
    if (!local || !initialLaunch || initialLaunch.workspaceRoot === undefined) return;
    setDesktopWorkspace(initialLaunch.workspaceRoot);
    setWorkspaceRemoved(initialLaunch.workspaceRoot === null);
  }, [initialLaunch, local]);
  useEffect(() => {
    if (local) {
      const bridge = window.agentCommonsLocal;
      void bridge?.getState().then((state) => {
        const conversation = state.conversations.find((item) => item.id === sessionId);
        if (initialLaunch?.workspaceRoot === undefined) setDesktopWorkspace(conversation?.workspaceRoot ?? null);
        setWebSearchConfigured(hasConfiguredLocalWebSearch(state.settings));
        setWebSearchEnabled(Boolean(hasConfiguredLocalWebSearch(state.settings) && (conversation?.webSearchEnabled ?? initialLaunch?.webSearchEnabled)));
        setMcpServers(state.settings.mcpServers ?? []);
      }).catch(() => undefined);
      return bridge?.onEvent((event) => {
        if (event.type === "state") {
          setWebSearchConfigured(hasConfiguredLocalWebSearch(event.state.settings));
          if (!hasConfiguredLocalWebSearch(event.state.settings)) setWebSearchEnabled(false);
          setMcpServers(event.state.settings.mcpServers ?? []);
        }
      });
    } else {
      void window.agentCommonsDesktop?.getWorkspace().then(setDesktopWorkspace).catch(() => undefined);
    }
  }, [local, sessionId, initialLaunch?.webSearchEnabled]);
  const setChatWebSearch = async (enabled: boolean) => {
    const bridge = window.agentCommonsLocal;
    if (!bridge) return;
    try {
      const state = await bridge.getState();
      if (enabled && !hasConfiguredLocalWebSearch(state.settings)) {
        openWebSearchSettings();
        return;
      }
      if (state.conversations.some((conversation) => conversation.id === sessionId)) {
        await bridge.setConversationWebSearch(sessionId, enabled);
      }
      setWebSearchEnabled(enabled);
    } catch (cause) {
      setWebSearchError(cause instanceof Error ? cause.message : "Could not save Web search for this chat.");
      setWebSearchDialogOpen(true);
    }
  };
  const openWebSearchSettings = () => {
    setWebSearchError("");
    setWebSearchDialogOpen(true);
    void window.agentCommonsLocal?.getState().then((state) => {
      setWebSearchProvider(state.settings.webSearchUrl === BRAVE_SEARCH_BASE_URL || !state.settings.webSearchUrl ? "brave" : "searxng");
      setWebSearchUrl(state.settings.webSearchUrl === BRAVE_SEARCH_BASE_URL ? "" : state.settings.webSearchUrl ?? "");
      setWebSearchApiKey(state.settings.webSearchApiKey ?? "");
    }).catch((cause) => setWebSearchError(cause instanceof Error ? cause.message : "Could not load web search settings."));
  };
  const saveWebSearchSettings = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window.agentCommonsLocal || webSearchSaving) return;
    setWebSearchSaving(true);
    setWebSearchError("");
    try {
      if (webSearchProvider === "brave" && !webSearchApiKey.trim()) throw new Error("Enter your Brave Search API key.");
      const state = await window.agentCommonsLocal.updateSettings({ webSearchUrl: webSearchProvider === "brave" ? BRAVE_SEARCH_BASE_URL : webSearchUrl, webSearchApiKey });
      const configured = hasConfiguredLocalWebSearch(state.settings);
      if (configured && state.conversations.some((conversation) => conversation.id === sessionId)) {
        await window.agentCommonsLocal.setConversationWebSearch(sessionId, true);
      }
      setWebSearchConfigured(configured);
      setWebSearchEnabled(configured);
      setWebSearchDialogOpen(false);
    } catch (cause) {
      setWebSearchError(cause instanceof Error ? cause.message : "Could not save web search settings.");
    } finally {
      setWebSearchSaving(false);
    }
  };
  const markRunning = useSessionRunStore((state) => state.markRunning);
  const markRunId = useSessionRunStore((state) => state.markRunId);
  const markCompleted = useSessionRunStore((state) => state.markCompleted);
  const sessionRunning = useSessionRunStore((state) => Boolean(sessionId && state.running[sessionId]));
  const activeCloudRunId = useSessionRunStore((state) => sessionId ? state.runIds[sessionId] : undefined);
  const activeRunSessionRef = useRef<string>("");
  // React state updates are asynchronous, so two clicks in the same frame can
  // both observe `streaming === false`. This synchronous lock guarantees only
  // one request can create/adopt a session at a time.
  const sendInFlightRef = useRef(false);
  const steerInFlightRef = useRef(false);
  const [steerError, setSteerError] = useState<string | null>(null);
  const {
    addMessage,
    updateStreamingMessage,
    upsertStreamingActivity,
    finalizeStreamingMessage,
    inputText,
    setInputText,
  } = useAgentContext();

  const { stream, streaming } = useAgentStream(userId, {
    onRunStarted: (runId) => markRunId(activeRunSessionRef.current, runId),
    onReset: () => {
      accumulatedRef.current = "";
      updateStreamingMessage("", activeRunSessionRef.current);
    },
    onToken: (token) => {
      accumulatedRef.current += token;
      updateStreamingMessage(accumulatedRef.current, activeRunSessionRef.current);
    },
    onStatus: (event) => {
      const activity = statusEventToActivity(event);
      if (activity) upsertStreamingActivity(activity, activeRunSessionRef.current);
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
      finalizeStreamingMessage(content, payload?.metadata, activeRunSessionRef.current);
      markCompleted(payload?.sessionId ?? activeRunSessionRef.current);
      notifySessionsChanged({ sessionId: payload?.sessionId ?? activeRunSessionRef.current, title: payload?.title });
      if (payload?.sessionId && payload.sessionId !== sessionId) {
        onSessionCreated?.(payload.sessionId, payload.title ?? "");
      }
    },
    onToolStart: (toolName, input) => {
      const activityId = `tool:${
        toolName || "tool"
      }:${++activitySequenceRef.current}`;
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
      }, activeRunSessionRef.current);
    },
    onTool: (event) => {
      const toolName = event.toolName ?? event.tool ?? event.name ?? "tool";
      if (
        [
          "proposeWorkflowChange",
          "proposeAgentChange",
          "proposeTaskChange",
          "proposeSkillChange",
          "proposeToolChange",
          "createTask",
        ].includes(toolName)
      ) {
        window.dispatchEvent(new CustomEvent("copilot-change-created"));
      }
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
      }, activeRunSessionRef.current);
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
        }, activeRunSessionRef.current);
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
      upsertStreamingActivity(activity, activeRunSessionRef.current);
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
      }, activeRunSessionRef.current);
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
      }, activeRunSessionRef.current);
    },
    onAgentStep: (event) => {
      upsertStreamingActivity({
        id: `agent-step:${
          event.payload?.stepId ?? ++activitySequenceRef.current
        }`,
        kind: "status",
        stage: "agent_step",
        title:
          event.message ?? event.payload?.message ?? "Agent step completed",
        detail: event.payload?.name,
        status: "completed",
        timestamp: event.timestamp ?? new Date().toISOString(),
        payload: event.payload,
      }, activeRunSessionRef.current);
    },
    onError: (message) => {
      markCompleted(activeRunSessionRef.current);
      if (/insufficient credits|payment required/i.test(message)) {
        setOutOfCredits(true);
      }
      upsertStreamingActivity({
        id: `error:${++activitySequenceRef.current}`,
        kind: "status",
        stage: "error",
        title: "Run interrupted",
        detail: message,
        status: "failed",
        timestamp: new Date().toISOString(),
      }, activeRunSessionRef.current);
      finalizeStreamingMessage(accumulatedRef.current, { error: message }, activeRunSessionRef.current);
      addMessage({
        role: "system",
        content: `Error: ${message}`,
        timestamp: new Date().toISOString(),
      }, activeRunSessionRef.current);
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

  const isRunning = streaming || sessionRunning;
  const isLoading = isRunning || disabled || launching;
  const isUploading = attachments.some(
    (attachment) => attachment.status === "uploading",
  );
  const canUseComputer = Boolean(
    allowComputer && computerConfig?.enabled && computerConfig?.allowUserSelect,
  );
  const uploadedAttachments = attachments.filter(
    (attachment) => attachment.status === "uploaded" && attachment.fileId,
  );

  useEffect(() => {
    if (!isLoading && restoreComposerFocusRef.current) {
      restoreComposerFocusRef.current = false;
      requestAnimationFrame(() => composerInputRef.current?.focus());
    }
  }, [isLoading]);

  useEffect(() => {
    if (local) { setComputerConfig(null); return; }
    if (isLaunchMode || !agentId || !allowComputer) return;
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
  }, [agentId, allowComputer, isLaunchMode, local]);

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

  const handleSend = async (overrideText?: string, launched?: ComposerLaunch) => {
    const baseText = (overrideText ?? launched?.text ?? inputText).trim();
    const sendAttachments = launched?.attachments ?? uploadedAttachments.map((attachment) => ({
      fileId: attachment.fileId!,
      name: attachment.name,
      mimeType: attachment.mimeType,
      kind: attachment.kind,
      sizeBytes: attachment.sizeBytes,
      textPreview: attachment.textPreview,
      previewUrl: attachment.previewUrl,
    }));
    if (
      (!baseText && sendAttachments.length === 0) ||
      disabled || launching ||
      (isLoading && !isRunning) ||
      isUploading ||
      (!local && outOfCredits)
    )
      return;

    const userMessage = baseText || "Please review the attached file(s).";

    if (isRunning && !onLaunch) {
      if (steerInFlightRef.current || !baseText || sendAttachments.length) return;
      const targetId = sessionId || activeRunSessionRef.current;
      if (!targetId) { setSteerError("Wait for the conversation to start, then send your prompt."); return; }
      steerInFlightRef.current = true;
      setSteerError(null);
      try {
        if (local) {
          await window.agentCommonsLocal?.steerConversation(targetId, baseText);
        } else {
          if (!activeCloudRunId) throw new Error("Wait for the agent run to start, then send your prompt.");
          const response = await fetch("/api/agents/run/stream/steer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: activeCloudRunId, prompt: baseText }) });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message ?? payload.error ?? "The agent could not accept this prompt.");
          }
        }
        addMessage({ role: "human", content: baseText, timestamp: new Date().toISOString(), metadata: {} }, targetId);
        setInputText("");
      } catch (cause) {
        setSteerError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        steerInFlightRef.current = false;
      }
      return;
    }

    // Launch mode: hand everything to the caller, which opens the new chat
    // in its session view and sends it there.
    if (onLaunch) {
      onLaunch({
        text: userMessage,
        attachments: sendAttachments,
        knowledgeSpaceIds: [...knowledgeSpaceIds],
        reasoningEffort: thinkingLevel === "auto" ? undefined : thinkingLevel,
        webSearchEnabled,
        mcpServerIds,
        workspaceRoot: workspaceRemoved ? null : desktopWorkspace ?? undefined,
      });
      setInputText("");
      setAttachments([]);
      setKnowledgeSpaceIds([]);
      return;
    }

    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    restoreComposerFocusRef.current = true;

    const computerRequest =
      allowComputer && computerEnabled
        ? {
            enabled: true,
          }
        : undefined;
    const messageAttachments = sendAttachments.map(({ previewUrl: _previewUrl, ...attachment }) => attachment);
    const selectedKnowledgeSpaceIds = launched?.knowledgeSpaceIds ?? [...knowledgeSpaceIds];
    const effort = launched?.reasoningEffort ?? (thinkingLevel === "auto" ? undefined : thinkingLevel);
    setInputText("");
    setOutOfCredits(false);
    previewUrlsRef.current.forEach((previewUrl) =>
      URL.revokeObjectURL(previewUrl),
    );
    previewUrlsRef.current.clear();
    setAttachments([]);
    setKnowledgeSpaceIds([]);
    accumulatedRef.current = "";
    runningToolActivitiesRef.current.clear();
    activityArgsRef.current.clear();
    activeRunSessionRef.current = sessionId;
    markRunning(sessionId);

    addMessage({
      role: "human",
      content: userMessage,
      metadata: {
        attachments: messageAttachments,
        computerRequest,
        knowledgeSpaceIds: selectedKnowledgeSpaceIds,
      },
      timestamp: new Date().toISOString(),
    }, sessionId);

    // Placeholder for the streaming AI message
    addMessage({
      role: "ai",
      content: "",
      metadata: {},
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }, sessionId);

    const cliContext = !local && desktopWorkspace
      ? await window.agentCommonsDesktop?.getToolContext().catch(() => null)
      : null;
    try {
      await stream({
        agentId,
        sessionId,
        uiContext: !local && window.agentCommonsDesktop
          ? { ...uiContext, desktopMode: "cloud" }
          : uiContext,
        messages: [{ role: "user", content: userMessage }],
        attachments: messageAttachments.map((attachment) => ({ fileId: attachment.fileId })),
        computerRequest,
        knowledgeSpaceIds: selectedKnowledgeSpaceIds,
        reasoningEffort: effort,
        webSearchEnabled: launched?.webSearchEnabled ?? webSearchEnabled,
        mcpServerIds: launched?.mcpServerIds ?? mcpServerIds,
        provenance,
        cliContext: cliContext ?? undefined,
        localWorkspaceRoot: local ? (launched?.workspaceRoot !== undefined ? launched.workspaceRoot : workspaceRemoved ? null : desktopWorkspace ?? undefined) : undefined,
        projectId: sessionId ? undefined : projectId,
      });
    } finally {
      sendInFlightRef.current = false;
    }
  };

  // Auto-send a handed-off prompt exactly once (arriving from a launcher).
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (isLaunchMode || autoSentRef.current) return;
    if (initialLaunch && (initialLaunch.text.trim() || initialLaunch.attachments.length)) {
      autoSentRef.current = true;
      void handleSend(undefined, initialLaunch);
      onInitialLaunchSent?.();
      return;
    }
    if (!initialPrompt || !initialPrompt.trim()) return;
    autoSentRef.current = true;
    handleSend(initialPrompt);
    onInitialPromptSent?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialLaunch]);

  const externalPromptIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      (!externalPrompt?.text && !externalPrompt?.attachment?.fileId) ||
      externalPromptIdRef.current === externalPrompt.id
    ) {
      return;
    }
    if (externalPrompt.attachment) {
      const incoming = externalPrompt.attachment;
      setAttachments((current) =>
        current.some((item) => item.fileId === incoming.fileId)
          ? current
          : [
              ...current,
              {
                localId: `external:${incoming.fileId}`,
                ...incoming,
                status: "uploaded",
              },
            ],
      );
    }
    if (externalPrompt.mode === "draft") {
      externalPromptIdRef.current = externalPrompt.id;
      const draft = externalPrompt.text.trim();
      if (!draft) return;
      setInputText((current) => {
        const existing = current.trimEnd();
        return existing ? `${existing}\n\n${draft}` : draft;
      });
      return;
    }
    if (isLoading) return;
    externalPromptIdRef.current = externalPrompt.id;
    handleSend(externalPrompt.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPrompt?.id, externalPrompt?.mode, isLoading, setInputText]);

  const openFilePicker = () => {
    if (isLoading) return;
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    if (isLoading) return;
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
    if (agentId) formData.set("agentId", agentId);
    if (sessionId) formData.set("sessionId", sessionId);
    selected.forEach((file) => formData.append("files", file));

    try {
      // Local mode keeps the file on this computer in the Local Library;
      // Cloud mode uploads it to the Commons Library.
      const response = await desktopApiFetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "File upload failed",
        );
      }
      const uploaded = ((payload?.data ?? []) as Array<{
        fileId?: string;
        itemId?: string;
        name: string;
        mimeType: string;
        kind: string;
        sizeBytes: number;
        status: string;
        textPreview?: string | null;
      }>).map((item) => ({ ...item, fileId: item.fileId ?? item.itemId ?? "" }));
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

  const addLibraryAttachments = (items: LibraryPickerItem[]) => {
    setAttachments((current) => {
      const attachedFileIds = new Set(
        current
          .map((attachment) => attachment.fileId)
          .filter((fileId): fileId is string => Boolean(fileId)),
      );
      const additions = items
        .filter((item) => !attachedFileIds.has(item.itemId))
        .map(
          (item): UploadedAttachment => ({
            localId: createLocalId(),
            fileId: item.itemId,
            name: item.name,
            mimeType: item.mimeType,
            kind: item.kind,
            sizeBytes: item.sizeBytes,
            status: "uploaded",
            textPreview: item.textPreview,
            previewUrl: item.previewUrl ?? undefined,
          }),
        );
      return [...current, ...additions];
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
    <ComposerSurface
      ref={containerRef}
      className={cn(
        "relative rounded-2xl bg-white border border-stone-300 shadow-composer transition-colors",
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
        onChange={(event) => {
          if (event.target.files) uploadFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <LibraryPickerDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        attachedFileIds={uploadedAttachments.map(
          (attachment) => attachment.fileId!,
        )}
        onAdd={addLibraryAttachments}
      />
      {local && <Dialog open={webSearchDialogOpen} onOpenChange={setWebSearchDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Web search</DialogTitle>
            <DialogDescription>Choose where web searches go. Every query asks for approval before it leaves this computer.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveWebSearchSettings} className="space-y-4">
            <label className="block space-y-1.5 text-sm">
              <span>Provider</span>
              <select value={webSearchProvider} onChange={(event) => { setWebSearchProvider(event.target.value as "brave" | "searxng"); setWebSearchApiKey(""); }} className="w-full rounded-md border border-border bg-background px-3 py-2">
                <option value="brave">Brave Search · API key</option>
                <option value="searxng">SearXNG · your endpoint</option>
              </select>
            </label>
            {webSearchProvider === "searxng" && <label className="block space-y-1.5 text-sm">
              <span>Search endpoint</span>
              <input type="url" required placeholder="https://search.example.com" value={webSearchUrl} onChange={(event) => setWebSearchUrl(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>}
            <label className="block space-y-1.5 text-sm">
              <span>API key {webSearchProvider === "searxng" && <span className="text-muted-foreground">(if required)</span>}</span>
              <input type="password" required={webSearchProvider === "brave"} autoComplete="off" value={webSearchApiKey} onChange={(event) => setWebSearchApiKey(event.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            {webSearchError && <p role="alert" className="text-xs text-destructive">{webSearchError}</p>}
            <DialogFooter>
              <button type="button" onClick={() => setWebSearchDialogOpen(false)} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              <button type="submit" disabled={webSearchSaving} className="rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50">{webSearchSaving ? "Saving…" : "Save and turn on"}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>}
      {outOfCredits && (
        <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-border bg-stone-50/80 px-3.5 py-2.5">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <BatteryLow className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate text-foreground">
              You&rsquo;re out of credits{isNarrow ? "" : "."}
            </span>
            {!isNarrow && (
              <span className="truncate text-muted-foreground">
                Top up or upgrade to keep your agents running.
              </span>
            )}
          </div>
          <Link
            href="/settings/billing"
            className="shrink-0 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-85"
          >
            {isNarrow ? "Top up" : "Get credits"}
          </Link>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.localId}
              attachment={attachment}
              onRemove={() => removeAttachment(attachment.localId)}
            />
          ))}
        </div>
      )}
      {knowledgeSpaceIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {knowledgeSpaceIds.map((spaceId) => {
            const space = knowledgeSpaces.find(
              (candidate) => candidate.spaceId === spaceId,
            );
            if (!space) return null;
            return (
              <span
                key={spaceId}
                className="flex max-w-full items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-900"
              >
                <Brain className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-44 truncate">{space.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setKnowledgeSpaceIds((current) =>
                      current.filter((id) => id !== spaceId),
                    )
                  }
                  className="rounded p-0.5 text-teal-700 hover:bg-teal-100"
                  aria-label={`Remove ${space.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
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
          <ComposerTextArea
            ref={composerInputRef}
            aria-label="Message your agent"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            placeholder={isRunning ? "Add a prompt while the agent works…" : placeholder}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={disabled || launching}
          />
          {steerError && <p className="px-3 pb-1 text-xs text-red-500">{steerError}</p>}
          {voiceError && (
            <p className="px-3 pb-1 text-xs text-red-500">{voiceError}</p>
          )}
          <div className="flex justify-between items-center px-2 pb-2">
            {(
              <div className="flex min-w-0 items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={!!isLoading}
                      title="Add photos & files"
                      aria-label="Add photos & files"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    className="w-72"
                  >
                    <DropdownMenuItem onSelect={openFilePicker}>
                      <HardDriveUpload className="mr-2 h-4 w-4" />
                      Upload from device
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setLibraryOpen(true)}>
                      <LibraryBig className="mr-2 h-4 w-4" />
                      Choose from Library
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Brain className="mr-2 h-4 w-4" />
                        Reference Knowledge
                        {knowledgeSpaceIds.length > 0 && (
                          <span className="ml-auto mr-1 text-xs text-teal-700">
                            {knowledgeSpaceIds.length}
                          </span>
                        )}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-64">
                        <DropdownMenuLabel>
                          <span className="block text-sm">
                            Knowledge Spaces
                          </span>
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            Use selected spaces for this message
                          </span>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {knowledgeSpaces.map((space) => (
                          <DropdownMenuCheckboxItem
                            key={space.spaceId}
                            checked={knowledgeSpaceIds.includes(space.spaceId)}
                            onCheckedChange={(checked) =>
                              setKnowledgeSpaceIds((current) =>
                                checked
                                  ? [...new Set([...current, space.spaceId])]
                                  : current.filter(
                                      (id) => id !== space.spaceId,
                                    ),
                              )
                            }
                          >
                            <span className="min-w-0">
                              <span className="block truncate">
                                {space.name}
                              </span>
                              <span className="block text-[11px] text-muted-foreground">
                                {space.counts?.documents || 0} notes
                              </span>
                            </span>
                          </DropdownMenuCheckboxItem>
                        ))}
                        {knowledgeLoading && (
                          <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading spaces
                          </div>
                        )}
                        {!knowledgeLoading && !knowledgeSpaces.length && (
                          <p className="px-2 py-3 text-xs text-muted-foreground">
                            No Knowledge Spaces available
                          </p>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    {local && <DropdownMenuCheckboxItem checked={webSearchEnabled} onCheckedChange={(checked) => { void setChatWebSearch(checked === true); }}>
                      <Globe2 className="mr-2 h-4 w-4" />
                      <span>Web search</span>
                    </DropdownMenuCheckboxItem>}
                    {local && webSearchConfigured && <DropdownMenuItem onSelect={openWebSearchSettings} className="pl-8 text-xs text-muted-foreground">Configure web search…</DropdownMenuItem>}
                    {local && <DropdownMenuSub>
                      <DropdownMenuSubTrigger><Plug className="mr-2 h-4 w-4" />MCP connectors</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="min-w-56">
                        <DropdownMenuLabel>Use in this chat</DropdownMenuLabel>
                        {mcpServers.filter((server) => server.enabled).map((server) => <DropdownMenuCheckboxItem key={server.id} checked={mcpServerIds.includes(server.id)} onCheckedChange={(checked) => setMcpServerIds((current) => checked === true ? [...new Set([...current, server.id])] : current.filter((id) => id !== server.id))}>{server.name} · {server.mode === "read" ? "Read" : "Write"}</DropdownMenuCheckboxItem>)}
                        {!mcpServers.some((server) => server.enabled) && <p className="px-2 py-2 text-xs text-muted-foreground">Set up a connector in Settings.</p>}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>}
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Provenance
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72">
                        <DropdownMenuLabel>Provenance for new runs</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={provenance.mode} onValueChange={(mode) => updateProvenance({ ...provenance, mode: mode as ProvenancePreferences["mode"] })}>
                          <DropdownMenuRadioItem value="metadata">Metadata only</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="full">Full disclosure</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="off">Off</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem checked={provenance.onchain} disabled={provenance.mode === "off"} onCheckedChange={(checked) => updateProvenance({ ...provenance, onchain: checked === true })}>
                          Request on-chain anchor
                        </DropdownMenuCheckboxItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
                {canUseComputer && (
                  <button
                    type="button"
                    onClick={() => setComputerEnabled((enabled) => !enabled)}
                    disabled={!!isLoading}
                    title={
                      computerEnabled
                        ? "Agent computer on — same workspace in every chat"
                        : "Use agent’s computer"
                    }
                    aria-label="Toggle agent computer"
                    aria-pressed={computerEnabled}
                    className={cn(
                      "relative rounded-lg p-1.5 transition-colors disabled:opacity-40",
                      computerEnabled
                        ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Monitor className="h-4 w-4" />
                    {computerEnabled && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    )}
                  </button>
                )}
                {typeof window !== "undefined" && window.agentCommonsDesktop && (
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void (local ? window.agentCommonsLocal?.chooseWorkspace() : window.agentCommonsDesktop?.chooseWorkspace())?.then((folder) => { if (folder) { setDesktopWorkspace(folder); setWorkspaceRemoved(false); } })}
                      disabled={!!isLoading}
                      title={desktopWorkspace ?? "Choose a local workspace for agent file access"}
                      aria-label="Choose local workspace"
                      className={cn("flex max-w-44 items-center gap-1 rounded-lg p-1.5 transition-colors disabled:opacity-40", desktopWorkspace ? "bg-indigo-50 text-indigo-600" : "text-muted-foreground hover:bg-muted")}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      {desktopWorkspace && <span className="truncate text-xs">{desktopWorkspace.split(/[\\/]/).filter(Boolean).at(-1)}</span>}
                    </button>
                    {desktopWorkspace && <button type="button" disabled={!!isLoading} onClick={() => { setDesktopWorkspace(null); setWorkspaceRemoved(true); }} title="Remove folder from this chat" aria-label="Remove folder from this chat" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><X className="h-3.5 w-3.5" /></button>}
                  </div>
                )}
                {footerLeft && <div className="ml-1 min-w-0">{footerLeft}</div>}
              </div>
            )}
            <div className="flex items-center gap-1">
              {(
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setThinkingMenuOpen((open) => !open)}
                    disabled={!!isLoading}
                    title="Thinking level"
                    aria-label="Thinking level"
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg p-1.5 transition-colors disabled:opacity-40",
                      thinkingLevel === "auto"
                        ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                        : "bg-muted/70 text-foreground hover:bg-muted",
                    )}
                  >
                    <Gauge className="h-4 w-4" />
                    {thinkingLevel !== "auto" && (
                      <span className="text-xs">
                        {
                          THINKING_LEVELS.find(
                            (level) => level.key === thinkingLevel,
                          )?.label
                        }
                      </span>
                    )}
                  </button>
                  {thinkingMenuOpen && (
                    <div className="absolute bottom-9 right-0 z-10 w-52 rounded-xl border border-border bg-popover p-1 shadow-floating">
                      <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Thinking
                      </p>
                      {THINKING_LEVELS.map((level) => (
                        <button
                          key={level.key}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setThinkingLevel(level.key);
                            setThinkingMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-muted"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block leading-tight">
                              {level.label}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {level.detail}
                            </span>
                          </span>
                          {thinkingLevel === level.key && (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setVoiceError(null);
                  voice.start();
                }}
                disabled={!!isLoading || isUploading || (!local && outOfCredits)}
                title="Dictate a message"
                aria-label="Dictate a message"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Mic className="h-4 w-4" />
              </button>
              <ComposerSendButton
                onClick={() => handleSend()}
                busy={Boolean((isLoading && !isRunning) || isUploading)}
                disabled={
                  (!inputText.trim() && uploadedAttachments.length === 0) ||
                  (isLoading && !isRunning) ||
                  (isRunning && !inputText.trim()) ||
                  isUploading ||
                  (!local && outOfCredits)
                }
              />
            </div>
          </div>
        </>
      )}
    </ComposerSurface>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: UploadedAttachment;
  onRemove: () => void;
}) {
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
          <ArtifactIcon artifact={attachment} className="h-4 w-4" />
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
    id: `status:${stage}:${
      event.payload?.taskId ?? event.payload?.computerId ?? ""
    }`,
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
    `${event.toolName ?? event.tool ?? event.name ?? "tool"}:${
      event.stage ?? "progress"
    }`;
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
