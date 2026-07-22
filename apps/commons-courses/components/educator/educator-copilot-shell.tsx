"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  FilePlus2,
  FlaskConical,
  Highlighter,
  Layers,
  LoaderCircle,
  MessageSquarePlus,
  Navigation,
  Paperclip,
  PenLine,
  Plug,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { RichTextRenderer } from "@/components/rich-text-renderer";
import { cn } from "@/lib/utils";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotConnector,
  EducatorCopilotMemory,
  EducatorCopilotMessage,
  EducatorCopilotPageContext,
  EducatorCopilotProfile,
  EducatorCopilotSessionSummary,
  EducatorCopilotToolActivity,
} from "@/types/educator-copilot";

type SessionDetail = EducatorCopilotSessionSummary & {
  messages: EducatorCopilotMessage[];
};

type CopilotStreamEvent = {
  type: "status" | "token" | "activity" | "error" | "final";
  content?: string;
  message?: string | (EducatorCopilotMessage & { actions?: EducatorCopilotAction[] });
  session?: SessionDetail;
  activity?: EducatorCopilotToolActivity;
};

const QUICK_PROMPTS = [
  "Give me a snapshot of my courses and learners",
  "What needs my attention as an educator this week?",
  "Help me improve this lesson for active learning",
  "Turn an uploaded PDF into a course, workbook, or skill pack",
];

const PANEL_WIDTH_KEY = "educator-copilot-panel-width";
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 560;
const PANEL_DEFAULT_WIDTH = 360;

function clampPanelWidth(value: number) {
  if (!Number.isFinite(value)) return PANEL_DEFAULT_WIDTH;
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(value)));
}

export function EducatorCopilotShell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"chat" | "sessions" | "settings">("chat");
  const [sessions, setSessions] = useState<EducatorCopilotSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [profile, setProfile] = useState<EducatorCopilotProfile | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<string | null>(null);
  const [streamActivity, setStreamActivity] = useState<EducatorCopilotToolActivity[]>([]);
  const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
  const autoApplied = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const actionMode: EducatorCopilotActionMode = profile?.actionMode || "manual";
  const messages = useMemo(() => activeSession?.messages || [], [activeSession?.messages]);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY));
    if (stored) setPanelWidth(clampPanelWidth(stored));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--educator-copilot-panel-width",
      `${panelWidth}px`
    );
  }, [panelWidth]);

  useEffect(() => {
    document.documentElement.classList.toggle("educator-copilot-open", open);
    return () => document.documentElement.classList.remove("educator-copilot-open");
  }, [open]);

  const startPanelResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    let width = startWidth;
    const onMove = (move: PointerEvent) => {
      width = clampPanelWidth(startWidth + (startX - move.clientX));
      setPanelWidth(width);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const updateLocalAction = useCallback(
    (
      actionId: string,
      patch: Partial<Pick<EducatorCopilotAction, "status" | "result">>
    ) => {
      setActiveSession((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.map((message) => ({
            ...message,
            actions: message.actions?.map((action) =>
              action.id === actionId
                ? ({ ...action, ...patch } as EducatorCopilotAction)
                : action
            ),
          })),
        };
      });
    },
    []
  );

  const runClientAction = useCallback(
    (action: EducatorCopilotAction) => {
      if (action.type === "navigate") {
        updateLocalAction(action.id, { status: "applied", result: "Opened page." });
        router.push(action.href);
        return;
      }
      if (action.type === "highlight") {
        const element = document.querySelector(action.selector);
        if (!element) {
          updateLocalAction(action.id, {
            status: "failed",
            result: "Could not find that element on this page.",
          });
          return;
        }
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("copilot-highlight-target");
        window.setTimeout(() => {
          element.classList.remove("copilot-highlight-target");
        }, 3200);
        updateLocalAction(action.id, { status: "applied", result: "Highlighted." });
      }
    },
    [router, updateLocalAction]
  );

  useEffect(() => {
    loadSessions();
    loadProfile();
  }, []);

  useEffect(() => {
    setActiveSession((current) =>
      current ? { ...current, currentPath: pathname || current.currentPath } : current
    );
  }, [pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamActivity, loading]);

  useEffect(() => {
    if (actionMode !== "auto") return;
    const actions = messages.flatMap((message) => message.actions || []);
    for (const action of actions) {
      if (
        action.status === "proposed" &&
        action.safety === "client_safe" &&
        !autoApplied.current.has(action.id)
      ) {
        autoApplied.current.add(action.id);
        runClientAction(action);
      }
    }
  }, [actionMode, messages, runClientAction]);

  async function loadSessions() {
    try {
      const res = await fetch("/api/educator/copilot/sessions");
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions || []);
      setBooted(true);
    } catch {
      setBooted(true);
    }
  }

  async function loadProfile() {
    try {
      const res = await fetch("/api/educator/copilot/profile");
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.profile || null);
    } catch {
      // Profile stays null; mode defaults to manual.
    }
  }

  async function createSession() {
    const pageContext = collectPageContext();
    const res = await fetch("/api/educator/copilot/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageContext }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setActiveSession(data.session);
    setSessions((current) => [summarizeSession(data.session), ...current]);
    setPanel("chat");
    setOpen(true);
  }

  async function openSession(id: string) {
    const res = await fetch(`/api/educator/copilot/sessions/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setActiveSession(data.session);
    setPanel("chat");
  }

  async function archiveSession(id: string) {
    await fetch(`/api/educator/copilot/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    setSessions((current) => current.filter((session) => session.id !== id));
    if (activeSession?.id === id) setActiveSession(null);
  }

  async function updateActionMode(nextMode: EducatorCopilotActionMode) {
    setProfile((current) => (current ? { ...current, actionMode: nextMode } : current));
    await fetch("/api/educator/copilot/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionMode: nextMode }),
    }).catch(() => {});
  }

  async function sendMessage(event: FormEvent, presetText?: string) {
    event.preventDefault();
    const content = (presetText ?? input).trim();
    const selectedFiles = files;
    if ((!content && selectedFiles.length === 0) || loading) return;

    const optimisticUser: EducatorCopilotMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content:
        content ||
        `Uploaded ${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"}.`,
      createdAt: new Date().toISOString(),
      attachments: selectedFiles.map((file) => ({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        status: "extracted",
      })),
    };
    const optimisticAssistant: EducatorCopilotMessage = {
      id: `local-assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      actions: [],
    };
    const nextSession: SessionDetail = activeSession || {
      id: "",
      title: "New copilot session",
      actionMode,
      currentPath: pathname || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    setActiveSession({
      ...nextSession,
      messages: [...nextSession.messages, optimisticUser, optimisticAssistant],
    });
    setInput("");
    setFiles([]);
    setLoading(true);
    setLocalNotice(null);
    setStreamStatus("Starting…");
    setStreamActivity([]);

    try {
      const formData = new FormData();
      if (activeSession?.id) formData.append("sessionId", activeSession.id);
      formData.append("message", content);
      formData.append("pageContext", JSON.stringify(collectPageContext()));
      for (const file of selectedFiles) formData.append("files", file, file.name);
      const res = await fetch("/api/educator/copilot/chat", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLocalNotice(data.error || "The copilot could not respond.");
        return;
      }
      if (!res.body) {
        setLocalNotice("The copilot stream could not be opened.");
        return;
      }

      let assistantText = "";
      for await (const streamEvent of readSseEvents(res.body)) {
        if (streamEvent.type === "token" && streamEvent.content) {
          assistantText += streamEvent.content;
          setActiveSession((current) =>
            current ? replaceLastAssistant(current, assistantText) : current
          );
          setStreamStatus(null);
        } else if (streamEvent.type === "status" && streamEvent.content) {
          setStreamStatus(streamEvent.content);
        } else if (streamEvent.type === "activity" && streamEvent.activity) {
          const incoming = streamEvent.activity;
          setStreamActivity((current) => {
            if (incoming.status === "running") return [...current, incoming];
            const index = current.findLastIndex(
              (item) => item.tool === incoming.tool && item.status === "running"
            );
            if (index === -1) return [...current, incoming];
            const next = [...current];
            next[index] = incoming;
            return next;
          });
          setStreamStatus(incoming.status === "running" ? incoming.label : null);
        } else if (streamEvent.type === "error") {
          setLocalNotice(
            typeof streamEvent.message === "string"
              ? streamEvent.message
              : "The copilot could not respond."
          );
        } else if (streamEvent.type === "final" && streamEvent.session) {
          const finalSession = streamEvent.session;
          setActiveSession(finalSession);
          setSessions((current) =>
            upsertSession(current, summarizeSession(finalSession))
          );
          const finalMessage =
            streamEvent.message && typeof streamEvent.message === "object"
              ? streamEvent.message
              : null;
          if (
            finalMessage?.actions?.some(
              (action: EducatorCopilotAction) =>
                action.status === "applied" && action.safety === "content_write"
            )
          ) {
            router.refresh();
          }
        }
      }
    } catch {
      setLocalNotice("The copilot could not be reached. Please try again.");
    } finally {
      setLoading(false);
      setStreamStatus(null);
      setStreamActivity([]);
    }
  }

  async function decideAction(action: EducatorCopilotAction, decision: "approve" | "reject") {
    if (!activeSession) return;
    if (action.type === "navigate" || action.type === "highlight") {
      if (decision === "reject") {
        updateLocalAction(action.id, { status: "rejected", result: "Rejected." });
      } else {
        runClientAction(action);
      }
      return;
    }
    const res = await fetch("/api/educator/copilot/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: activeSession.id,
        actionId: action.id,
        decision,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLocalNotice(data.error || "Could not apply action.");
      return;
    }
    setActiveSession(data.session);
    setSessions((current) => upsertSession(current, summarizeSession(data.session)));
    if (data.action?.status === "applied") router.refresh();
  }

  const emptyState = useMemo(
    () =>
      pathname?.includes("/educator/courses/")
        ? "I can see this course. Ask me to revise lessons, summarize students, explain analytics, or guide you around this page."
        : "Ask about any of your courses, students, or materials — or upload a file and we'll build content from it.",
    [pathname]
  );
  const pendingActionCount = messages.reduce(
    (total, message) =>
      total + (message.actions || []).filter((action) => action.status === "proposed").length,
    0
  );

  return (
    <>
      <style jsx global>{`
        .copilot-highlight-target {
          outline: 3px solid #38bdf8 !important;
          outline-offset: 4px !important;
          transition: outline-color 200ms ease;
        }
      `}</style>
      <button
        type="button"
        aria-label="Open educator copilot"
        onClick={() => {
          setOpen(true);
          setPanel("chat");
        }}
        className={cn(
          "fixed bottom-5 right-5 z-40 rounded-full border border-slate-200 bg-white p-1 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl",
          open && "hidden"
        )}
      >
        <CopilotAvatar size="large" />
        <span className="absolute -left-1 -top-1 rounded-full bg-slate-950 p-1 text-white shadow">
          <Sparkles className="h-3 w-3" />
        </span>
        {pendingActionCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
            {pendingActionCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-white shadow-xl lg:w-[var(--educator-copilot-panel-width,360px)]">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize educator copilot panel"
            onPointerDown={startPanelResize}
            className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize touch-none hover:bg-slate-200/80 lg:block"
          />
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
            <button
              type="button"
              onClick={() => setPanel("chat")}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left transition hover:bg-slate-100"
            >
              <CopilotAvatar />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-slate-950">
                    {profile?.copilotName || "Educator Copilot"}
                  </span>
                  <span
                    title={
                      profile?.agentReady
                        ? "Connected to your Commons account"
                        : profile?.connectionMessage || "Connection required"
                    }
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      profile?.agentReady ? "bg-emerald-500" : "bg-amber-400"
                    )}
                  />
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {activeSession?.id
                    ? activeSession.title || "Current Copilot session"
                    : "CommonLab educator copilot"}
                </span>
              </span>
            </button>

            <IconButton
              label="Recent chats"
              active={panel === "sessions"}
              onClick={() => setPanel("sessions")}
            >
              <Clock3 className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Copilot settings"
              active={panel === "settings"}
              onClick={() => setPanel("settings")}
            >
              <Settings2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="New chat" onClick={createSession}>
              <MessageSquarePlus className="h-4 w-4" />
            </IconButton>
            <IconButton label="Close Copilot" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </header>

          <div className="min-h-0 flex-1">
            {panel === "sessions" ? (
              <SessionsPanel
                booted={booted}
                sessions={sessions}
                activeId={activeSession?.id}
                onOpen={openSession}
                onArchive={archiveSession}
              />
            ) : panel === "settings" ? (
              <SettingsPanel
                profile={profile}
                onProfileChange={setProfile}
                onModeChange={updateActionMode}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                  {messages.length === 0 ? (
                    <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
                      <CopilotAvatar size="empty" />
                      <p className="text-sm font-medium text-slate-950">
                        Your workspace, one question away.
                      </p>
                      <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">
                        {emptyState}
                      </p>
                      <div className="mx-auto mt-5 flex w-full max-w-xs flex-col gap-2">
                        {QUICK_PROMPTS.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={(event) => sendMessage(event, prompt)}
                            className="rounded-xl border border-slate-200 px-3 py-2.5 text-left text-xs text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {messages.map((message, index) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          agentName={profile?.copilotName || "Educator Copilot"}
                          isStreamingTarget={
                            loading &&
                            index === messages.length - 1 &&
                            message.role === "assistant"
                          }
                          liveActivity={streamActivity}
                          onDecision={decideAction}
                        />
                      ))}
                      {loading && streamStatus ? (
                        <div className="inline-flex items-center gap-2 py-2 text-xs text-slate-500">
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          {streamStatus}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {localNotice ? (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {localNotice}
                    </p>
                  ) : null}
                </div>

                <form onSubmit={sendMessage} className="shrink-0 border-t border-slate-200 p-3">
                  <div className="rounded-2xl border border-stone-300 bg-white shadow-sm">
                    {files.length ? (
                      <div className="flex flex-wrap gap-2 px-3 pt-3">
                        {files.map((file, index) => (
                          <span
                            key={`${file.name}-${index}`}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                          >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="max-w-40 truncate">{file.name}</span>
                            <button
                              type="button"
                              aria-label={`Remove ${file.name}`}
                              onClick={() =>
                                setFiles((current) =>
                                  current.filter((_, fileIndex) => fileIndex !== index)
                                )
                              }
                              className="rounded text-slate-400 hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Ask about your courses, students, or this page…"
                      rows={2}
                      className="h-16 w-full resize-none rounded-2xl bg-transparent p-3 text-sm outline-none placeholder:text-slate-400"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.md,.markdown,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/png,image/jpeg,image/webp,text/*"
                      className="hidden"
                      onChange={(event) => {
                        setFiles((current) => [
                          ...current,
                          ...Array.from(event.target.files || []),
                        ].slice(0, 8));
                        event.currentTarget.value = "";
                      }}
                    />
                    <div className="flex items-center justify-between px-2 pb-2">
                      <button
                        type="button"
                        aria-label="Add photos and files"
                        title="Add photos and files"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={loading}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 disabled:opacity-40"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <button
                        type="submit"
                        disabled={loading || (input.trim().length === 0 && files.length === 0)}
                        aria-label="Send message"
                        className="rounded-lg bg-slate-950 p-1.5 text-white transition hover:opacity-80 disabled:opacity-40"
                      >
                        {loading ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowUp className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}

function MessageBubble({
  message,
  agentName,
  isStreamingTarget,
  liveActivity,
  onDecision,
}: {
  message: EducatorCopilotMessage;
  agentName: string;
  isStreamingTarget: boolean;
  liveActivity: EducatorCopilotToolActivity[];
  onDecision: (action: EducatorCopilotAction, decision: "approve" | "reject") => void;
}) {
  const activity = isStreamingTarget ? liveActivity : message.activity || [];
  const isUser = message.role === "user";
  return (
    <div className={cn("my-3", isUser ? "flex justify-end" : "mr-2")}>
      <div className={cn(isUser ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-lime-100 px-4 py-2.5" : "w-full")}>
        {!isUser ? (
          <div className="mb-2 flex items-center gap-2">
            <CopilotAvatar size="message" />
            <span className="truncate text-xs text-slate-500">{agentName}</span>
          </div>
        ) : null}
        {activity.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {activity.map((item, index) => (
              <span
                key={`${item.tool}-${index}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  item.status === "running"
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : item.status === "error"
                      ? "border-rose-200 bg-rose-50 text-rose-600"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                )}
              >
                {item.status === "running" ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
        {message.content ? (
          isUser ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
              {message.content}
            </p>
          ) : (
            <RichTextRenderer
              value={message.content}
              className="space-y-2 text-sm leading-6 text-slate-700 [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm"
            />
          )
        ) : isStreamingTarget ? (
          <span className="inline-flex items-center gap-2 text-sm text-slate-400">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Working…
          </span>
        ) : null}
        {message.attachments?.length ? (
          <div className="mt-2 space-y-1">
            {message.attachments.map((attachment, index) => (
              <div
                key={`${attachment.name}-${index}`}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                  isUser ? "bg-white/60 text-slate-700" : "bg-slate-50 text-slate-600"
                )}
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{attachment.name}</span>
                {attachment.status === "uploaded" ? (
                  <span className="ml-auto text-[10px] font-medium uppercase tracking-wide opacity-70">
                    synced
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {message.actions?.length ? (
          <div className="mt-3 space-y-2">
            {message.actions.map((action) => (
              <ActionCard key={action.id} action={action} onDecision={onDecision} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function actionIcon(action: EducatorCopilotAction) {
  switch (action.type) {
    case "highlight":
      return <Highlighter className="mt-0.5 h-4 w-4 text-sky-600" />;
    case "navigate":
      return <Navigation className="mt-0.5 h-4 w-4 text-slate-500" />;
    case "add_module":
      return <Layers className="mt-0.5 h-4 w-4 text-violet-600" />;
    case "add_lesson":
      return <FilePlus2 className="mt-0.5 h-4 w-4 text-violet-600" />;
    case "update_course_overview":
      return <BookOpen className="mt-0.5 h-4 w-4 text-amber-600" />;
    case "update_course_lesson":
    case "update_module":
    case "update_skill_challenge":
      return <PenLine className="mt-0.5 h-4 w-4 text-amber-600" />;
    default:
      return <ChevronRight className="mt-0.5 h-4 w-4 text-slate-500" />;
  }
}

function ActionCard({
  action,
  onDecision,
}: {
  action: EducatorCopilotAction;
  onDecision: (action: EducatorCopilotAction, decision: "approve" | "reject") => void;
}) {
  const done = ["applied", "rejected", "blocked", "failed"].includes(action.status);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-2">
        {actionIcon(action)}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">{action.label}</p>
          {action.reason ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">{action.reason}</p>
          ) : null}
          {action.preview ? (
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-slate-600">
              {action.preview}
            </p>
          ) : null}
          {action.result ? (
            <p className="mt-2 text-xs font-bold text-slate-500">{action.result}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wide",
            action.status === "applied"
              ? "bg-green-100 text-green-800"
              : action.status === "blocked" || action.status === "failed"
                ? "bg-rose-100 text-rose-800"
                : "bg-white text-slate-500"
          )}
        >
          {action.status}
        </span>
        {!done ? (
          <>
            <button
              type="button"
              onClick={() => onDecision(action, "approve")}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-bold text-white"
            >
              <Check className="h-3.5 w-3.5" />
              {action.type === "navigate" || action.type === "highlight" ? "Run" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => onDecision(action, "reject")}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600"
            >
              Reject
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SessionsPanel({
  booted,
  sessions,
  activeId,
  onOpen,
  onArchive,
}: {
  booted: boolean;
  sessions: EducatorCopilotSessionSummary[];
  activeId?: string;
  onOpen: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="px-2 pb-2 pt-1">
        <h2 className="text-sm font-medium text-slate-950">Recent chats</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Continue earlier planning, course, and material sessions.
        </p>
      </div>
      {!booted ? (
        <p className="text-sm text-slate-500">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm leading-6 text-slate-500">No previous copilot sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "group rounded-xl border p-3 transition hover:bg-slate-50",
                activeId === session.id
                  ? "border-slate-950 bg-slate-50"
                  : "border-slate-200"
              )}
            >
              <button
                type="button"
                onClick={() => onOpen(session.id)}
                className="block w-full text-left"
              >
                <p className="truncate text-sm font-bold text-slate-950">
                  {session.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {relativeTime(session.updatedAt)}
                  {session.currentPath ? ` · ${session.currentPath}` : ""}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onArchive(session.id)}
                className="mt-2 text-xs font-bold text-slate-400 hover:text-rose-600"
              >
                Archive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

type ModelOptionItem = { provider?: string; modelId?: string; name?: string };

function SettingsPanel({
  profile,
  onProfileChange,
  onModeChange,
}: {
  profile: EducatorCopilotProfile | null;
  onProfileChange: (profile: EducatorCopilotProfile) => void;
  onModeChange: (mode: EducatorCopilotActionMode) => void;
}) {
  const [models, setModels] = useState<ModelOptionItem[]>([]);
  const [memories, setMemories] = useState<EducatorCopilotMemory[]>([]);
  const [memoriesAvailable, setMemoriesAvailable] = useState(true);
  const [connectors, setConnectors] = useState<EducatorCopilotConnector[]>([]);
  const [connectorsAvailable, setConnectorsAvailable] = useState(true);
  const [copilotName, setCopilotName] = useState(profile?.copilotName || "");
  const [instructions, setInstructions] = useState(profile?.customInstructions || "");
  const [modelChoice, setModelChoice] = useState(
    profile?.modelProvider && profile?.modelId
      ? `${profile.modelProvider}::${profile.modelId}`
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [newMemory, setNewMemory] = useState("");
  const [connectorForm, setConnectorForm] = useState({ name: "", url: "" });
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, memoriesRes, connectorsRes] = await Promise.all([
          fetch("/api/educator/copilot/profile?full=1"),
          fetch("/api/educator/copilot/memories"),
          fetch("/api/educator/copilot/connectors"),
        ]);
        if (cancelled) return;
        if (profileRes.ok) {
          const data = await profileRes.json();
          if (data.profile) {
            onProfileChange(data.profile);
            setCopilotName(data.profile.copilotName || "");
            setInstructions(data.profile.customInstructions || "");
            setModelChoice(
              data.profile.modelProvider && data.profile.modelId
                ? `${data.profile.modelProvider}::${data.profile.modelId}`
                : ""
            );
          }
          setModels(data.models || []);
        }
        if (memoriesRes.ok) {
          const data = await memoriesRes.json();
          setMemories(data.memories || []);
          setMemoriesAvailable(data.available !== false);
        }
        if (connectorsRes.ok) {
          const data = await connectorsRes.json();
          setConnectors(data.connectors || []);
          setConnectorsAvailable(data.available !== false);
        }
      } catch {
        // Sections render their unavailable states.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function savePersonalization() {
    setSaving(true);
    setNotice(null);
    try {
      const [provider, modelId] = modelChoice ? modelChoice.split("::") : ["", ""];
      const res = await fetch("/api/educator/copilot/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copilotName,
          customInstructions: instructions,
          modelProvider: provider,
          modelId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.profile) {
        onProfileChange(data.profile);
        setSavedTick(true);
        window.setTimeout(() => setSavedTick(false), 2000);
      } else {
        setNotice(data.error || "Could not save settings.");
      }
    } catch {
      setNotice("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function addMemory() {
    const content = newMemory.trim();
    if (!content) return;
    const res = await fetch("/api/educator/copilot/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (res.ok && data.memory) {
      setMemories((current) => [data.memory, ...current]);
      setNewMemory("");
    } else {
      setNotice(data.error || "Could not save the note.");
    }
  }

  async function deleteMemory(id: string) {
    setMemories((current) => current.filter((memory) => memory.id !== id));
    await fetch(`/api/educator/copilot/memories?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  async function addConnector() {
    if (!connectorForm.name.trim() || !connectorForm.url.trim()) return;
    setConnectorBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/educator/copilot/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: connectorForm.name.trim(),
          url: connectorForm.url.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.connector) {
        setConnectors((current) => [data.connector, ...current]);
        setConnectorForm({ name: "", url: "" });
        if (data.connector.status === "error") {
          setNotice(data.connector.lastError || "The connector could not connect.");
        }
      } else {
        setNotice(data.error || "Could not add the connector.");
      }
    } finally {
      setConnectorBusy(false);
    }
  }

  async function removeConnector(id: string) {
    setConnectors((current) => current.filter((connector) => connector.id !== id));
    await fetch(`/api/educator/copilot/connectors?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  const actionMode = profile?.actionMode || "manual";

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      <div>
        <h2 className="text-sm font-medium text-slate-950">Copilot settings</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Shape how your teaching copilot works, remembers, and connects.
        </p>
      </div>
      {profile && !profile.agentReady ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-950">
            {profile.connectionStatus === "account_unlinked"
              ? "Link your Commons account"
              : "Reconnect your Commons account"}
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            {profile.connectionMessage ||
              "Your personal educator agent needs access to your Commons account."}
          </p>
          {(profile.connectionStatus === "account_unlinked" ||
            profile.connectionStatus === "reauthorization_required") && (
            <button
              type="button"
              onClick={() =>
                signIn("commons", {
                  callbackUrl: `${window.location.pathname}${window.location.search}`,
                })
              }
              className="mt-3 rounded-md bg-amber-950 px-3 py-2 text-xs font-bold text-white"
            >
              {profile.identityLinked ? "Reconnect Commons" : "Link Commons account"}
            </button>
          )}
        </section>
      ) : null}

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          Action mode
        </p>
        <div className="space-y-3">
          <ModeOption
            checked={actionMode === "manual"}
            title="Manual approval"
            body="The copilot proposes actions. You approve edits, navigation, and highlights."
            onClick={() => onModeChange("manual")}
          />
          <ModeOption
            checked={actionMode === "auto"}
            title="Guarded auto mode"
            body="Safe navigation/highlights and content edits run automatically. Sensitive actions stay blocked."
            onClick={() => onModeChange("auto")}
          />
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          In every mode, the copilot cannot delete records, publish or unpublish courses,
          touch payments or payouts, change collaborators, alter student records, or send
          email. Those actions simply do not exist for it.
        </div>
      </section>

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          Personalization
        </p>
        <label className="mb-1 block text-xs font-bold text-slate-600">Copilot name</label>
        <input
          value={copilotName}
          onChange={(event) => setCopilotName(event.target.value)}
          placeholder="Educator Copilot"
          className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-950"
        />
        <label className="mb-1 block text-xs font-bold text-slate-600">
          Instructions for your copilot
        </label>
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          placeholder={
            "e.g. Write in UK English. My lessons follow hook → concept → practice. Keep quizzes to 3 questions. Always suggest a discussion prompt."
          }
          rows={5}
          className="mb-3 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-slate-950"
        />
        <label className="mb-1 block text-xs font-bold text-slate-600">Model</label>
        <select
          value={modelChoice}
          onChange={(event) => setModelChoice(event.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
        >
          <option value="">Platform default{profile?.effectiveModel && !modelChoice ? ` (${profile.effectiveModel})` : ""}</option>
          {models
            .filter((model) => model.provider && model.modelId)
            .map((model) => (
              <option
                key={`${model.provider}::${model.modelId}`}
                value={`${model.provider}::${model.modelId}`}
              >
                {model.provider} / {model.name || model.modelId}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={savePersonalization}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : savedTick ? <Check className="h-3.5 w-3.5" /> : null}
          {savedTick ? "Saved" : "Save personalization"}
        </button>
      </section>

      <section>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-500">
          <Brain className="h-3.5 w-3.5" /> Memory
        </p>
        <p className="mb-3 text-xs leading-5 text-slate-500">
          What your copilot has learned about you and your teaching. It also saves
          preferences automatically as you work together.
        </p>
        {!memoriesAvailable ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Memory becomes available once the copilot is connected.
          </p>
        ) : (
          <>
            <div className="mb-2 flex gap-2">
              <input
                value={newMemory}
                onChange={(event) => setNewMemory(event.target.value)}
                placeholder="Teach it something, e.g. 'My tone is playful but precise'"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-950"
              />
              <button
                type="button"
                onClick={addMemory}
                className="rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 hover:border-slate-950 hover:text-slate-950"
              >
                Add
              </button>
            </div>
            {memories.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing saved yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {memories.map((memory) => (
                  <li
                    key={memory.id}
                    className="group flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs leading-5 text-slate-600"
                  >
                    <span className="flex-1">{memory.content}</span>
                    <button
                      type="button"
                      aria-label="Forget this"
                      title="Forget this"
                      onClick={() => deleteMemory(memory.id)}
                      className="rounded p-0.5 text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-500">
          <Plug className="h-3.5 w-3.5" /> Connectors
        </p>
        <p className="mb-3 text-xs leading-5 text-slate-500">
          Give your copilot extra tools via MCP servers — for example a Google Drive /
          Workspace MCP endpoint. Connected tools become available in every chat.
        </p>
        {!connectorsAvailable ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Connectors become available once the copilot is connected.
          </p>
        ) : (
          <>
            <div className="mb-2 space-y-2">
              <input
                value={connectorForm.name}
                onChange={(event) =>
                  setConnectorForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Name, e.g. Google Drive"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-950"
              />
              <div className="flex gap-2">
                <input
                  value={connectorForm.url}
                  onChange={(event) =>
                    setConnectorForm((current) => ({ ...current, url: event.target.value }))
                  }
                  placeholder="MCP server URL (https://…)"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-slate-950"
                />
                <button
                  type="button"
                  onClick={addConnector}
                  disabled={connectorBusy}
                  className="rounded-md border border-slate-200 px-2.5 text-xs font-bold text-slate-600 hover:border-slate-950 hover:text-slate-950 disabled:opacity-50"
                >
                  {connectorBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
                </button>
              </div>
            </div>
            {connectors.length === 0 ? (
              <p className="text-xs text-slate-400">No connectors yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {connectors.map((connector) => (
                  <li
                    key={connector.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"
                  >
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full",
                        connector.status === "connected" ? "bg-emerald-500" : "bg-amber-400"
                      )}
                    />
                    <span className="flex-1 truncate font-semibold">{connector.name}</span>
                    {typeof connector.toolsDiscovered === "number" ? (
                      <span className="text-slate-400">{connector.toolsDiscovered} tools</span>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Remove connector"
                      title="Remove connector"
                      onClick={() => removeConnector(connector.id)}
                      className="rounded p-0.5 text-slate-300 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {notice ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{notice}</p>
      ) : null}
    </div>
  );
}

function ModeOption({
  checked,
  title,
  body,
  onClick,
}: {
  checked: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border p-3 text-left transition",
        checked
          ? "border-lime-400 bg-lime-50"
          : "border-slate-200 bg-white hover:bg-slate-50"
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-slate-950">
        <span
          className={cn(
            "h-3.5 w-3.5 rounded-full border",
            checked ? "border-[4px] border-slate-950" : "border-slate-300"
          )}
        />
        {title}
      </span>
      <span className="mt-1 block text-xs leading-5 text-slate-500">{body}</span>
    </button>
  );
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950",
        active && "bg-slate-100 text-slate-950"
      )}
    >
      {children}
    </button>
  );
}

function CopilotAvatar({
  size = "header",
}: {
  size?: "header" | "large" | "empty" | "message";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full bg-slate-950 text-lime-300 ring-1 ring-slate-200",
        size === "large"
          ? "h-[52px] w-[52px]"
          : size === "empty"
            ? "mb-3 h-12 w-12"
            : size === "message"
              ? "h-5 w-5"
            : "h-[34px] w-[34px]"
      )}
    >
      <FlaskConical
        className={cn(
          size === "large"
            ? "h-6 w-6"
            : size === "empty"
              ? "h-5 w-5"
              : size === "message"
                ? "h-2.5 w-2.5"
                : "h-4 w-4"
        )}
      />
      {size !== "message" ? (
        <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-slate-950 bg-lime-300" />
      ) : null}
    </span>
  );
}

function collectPageContext(): EducatorCopilotPageContext {
  const selection = window.getSelection()?.toString().trim() || undefined;
  const formFields: Record<string, string> = {};
  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select"
    )
    .forEach((field) => {
      const type = "type" in field ? field.type : "";
      const key = field.name || field.id || field.getAttribute("aria-label") || "";
      if (!key || type === "password") return;
      if (/password|secret|token|payout|stripe|paystack|account/i.test(key)) return;
      formFields[key.slice(0, 60)] = field.value.slice(0, 500);
    });

  return {
    path: `${window.location.pathname}${window.location.search}`,
    page: inferPage(window.location.pathname),
    title: document.title,
    visibleText: document.body.innerText.replace(/\s+/g, " ").slice(0, 6000),
    selection,
    formFields,
    uiMap: collectUiMap(),
  };
}

function collectUiMap(): EducatorCopilotPageContext["uiMap"] {
  const items: NonNullable<EducatorCopilotPageContext["uiMap"]> = [];
  document
    .querySelectorAll<HTMLElement>(
      "a, button, input, textarea, select, [data-copilot-target]"
    )
    .forEach((element) => {
      if (items.length >= 60) return;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      const label = getElementLabel(element);
      if (!label) return;
      const selector = buildElementSelector(element);
      if (!selector) return;
      items.push({
        label: label.slice(0, 90),
        type: describeElementType(element),
        selector,
        href:
          element instanceof HTMLAnchorElement
            ? element.getAttribute("href") || undefined
            : undefined,
      });
    });
  return items;
}

function getElementLabel(element: HTMLElement) {
  const field = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const raw =
    element.getAttribute("data-copilot-label") ||
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    ("placeholder" in field ? field.placeholder : "") ||
    ("name" in field ? field.name : "") ||
    element.innerText ||
    element.textContent ||
    "";
  return raw.replace(/\s+/g, " ").trim();
}

function describeElementType(element: HTMLElement) {
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLButtonElement) return "button";
  if (element instanceof HTMLInputElement) return `input:${element.type || "text"}`;
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  return element.getAttribute("data-copilot-target") ? "target" : element.tagName.toLowerCase();
}

function buildElementSelector(element: HTMLElement) {
  const target = element.getAttribute("data-copilot-target");
  if (target) return `[data-copilot-target="${escapeCssValue(target)}"]`;
  if (element.id) return `#${escapeCssValue(element.id)}`;

  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== document.body && parts.length < 5) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const currentTag = current.tagName;
    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === currentTag
    );
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }
  return parts.length ? parts.join(" > ") : undefined;
}

function escapeCssValue(value: string) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function inferPage(path: string) {
  if (path === "/educator") return "educator.dashboard";
  if (path === "/educator/analytics") return "educator.analytics";
  if (path === "/educator/copilot") return "educator.copilot.materials";
  if (path === "/educator/settings") return "educator.settings";
  if (path === "/educator/skills") return "educator.skills";
  const courseMatch = path.match(/\/educator\/courses\/([^/]+)(?:\/([^/]+))?/);
  if (!courseMatch) return "educator";
  return courseMatch[2]
    ? `educator.course.${courseMatch[2]}`
    : "educator.course.dashboard";
}

function summarizeSession(session: SessionDetail): EducatorCopilotSessionSummary {
  return {
    id: session.id,
    title: session.title,
    actionMode: session.actionMode,
    currentPath: session.currentPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function upsertSession(
  sessions: EducatorCopilotSessionSummary[],
  next: EducatorCopilotSessionSummary
) {
  return [next, ...sessions.filter((session) => session.id !== next.id)].slice(0, 30);
}

function replaceLastAssistant(session: SessionDetail, content: string): SessionDetail {
  const messages = [...session.messages];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      messages[index] = { ...messages[index], content };
      return { ...session, messages };
    }
  }
  return {
    ...session,
    messages: [
      ...messages,
      {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function relativeTime(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

async function* readSseEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        const event = parseSseFrame(buffer);
        if (event) yield event;
      }
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";

    for (const frame of frames) {
      const event = parseSseFrame(frame);
      if (event) yield event;
    }
  }
}

function parseSseFrame(frame: string): CopilotStreamEvent | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data) as CopilotStreamEvent;
  } catch {
    return null;
  }
}
