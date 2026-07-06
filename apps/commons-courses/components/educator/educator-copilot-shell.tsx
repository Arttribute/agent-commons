"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  Check,
  ChevronRight,
  History,
  Highlighter,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotMessage,
  EducatorCopilotPageContext,
  EducatorCopilotSessionSummary,
} from "@/types/educator-copilot";

type SessionDetail = EducatorCopilotSessionSummary & {
  messages: EducatorCopilotMessage[];
};

export function EducatorCopilotShell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"chat" | "sessions" | "settings">("chat");
  const [sessions, setSessions] = useState<EducatorCopilotSessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [actionMode, setActionMode] = useState<EducatorCopilotActionMode>("manual");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booted, setBooted] = useState(false);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const autoApplied = useRef(new Set<string>());

  const messages = useMemo(() => activeSession?.messages || [], [activeSession?.messages]);
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
  }, []);

  useEffect(() => {
    setActiveSession((current) =>
      current ? { ...current, currentPath: pathname || current.currentPath } : current
    );
  }, [pathname]);

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
      setActionMode(data.preference?.actionMode || "manual");
      setBooted(true);
    } catch {
      setBooted(true);
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
    setActionMode(nextMode);
    await fetch("/api/educator/copilot/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionMode: nextMode }),
    });
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const optimisticUser: EducatorCopilotMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
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
      messages: [...nextSession.messages, optimisticUser],
    });
    setInput("");
    setLoading(true);
    setLocalNotice(null);

    try {
      const res = await fetch("/api/educator/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSession?.id || undefined,
          message: content,
          pageContext: collectPageContext(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalNotice(data.error || "The copilot could not respond.");
        return;
      }
      setActiveSession(data.session);
      setSessions((current) => upsertSession(current, summarizeSession(data.session)));
      if (data.message?.actions?.some((action: EducatorCopilotAction) => action.status === "applied")) {
        router.refresh();
      }
    } catch {
      setLocalNotice("The copilot could not be reached. Please try again.");
    } finally {
      setLoading(false);
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
        ? "Ask me to revise a lesson, find a course view, summarize this course, or guide you around the page."
        : "Ask me about your courses, materials, students, analytics, or where to go next.",
    [pathname]
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
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800",
          open && "hidden"
        )}
      >
        <Bot className="h-4 w-4" />
        Copilot
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20">
          <button
            type="button"
            aria-label="Close educator copilot"
            className="hidden flex-1 md:block"
            onClick={() => setOpen(false)}
          />
          <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
            <header className="border-b border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Educator copilot
                  </p>
                  <h2 className="mt-1 text-base font-bold text-slate-950">
                    {activeSession?.title || "Course assistant"}
                  </h2>
                </div>
                <button
                  type="button"
                  aria-label="Close educator copilot"
                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <IconButton
                  label="Previous sessions"
                  active={panel === "sessions"}
                  onClick={() => setPanel(panel === "sessions" ? "chat" : "sessions")}
                >
                  <History className="h-4 w-4" />
                </IconButton>
                <IconButton label="New session" onClick={createSession}>
                  <Plus className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label="Settings"
                  active={panel === "settings"}
                  onClick={() => setPanel(panel === "settings" ? "chat" : "settings")}
                >
                  <Settings className="h-4 w-4" />
                </IconButton>
                <div className="ml-auto rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500">
                  {actionMode === "auto" ? "Auto" : "Manual"}
                </div>
              </div>
            </header>

            {panel === "sessions" ? (
              <SessionsPanel
                booted={booted}
                sessions={sessions}
                activeId={activeSession?.id}
                onOpen={openSession}
                onArchive={archiveSession}
              />
            ) : panel === "settings" ? (
              <SettingsPanel actionMode={actionMode} onChange={updateActionMode} />
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="mt-10 text-center">
                      <Sparkles className="mx-auto mb-3 h-5 w-5 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-800">
                        Work from this exact educator view.
                      </p>
                      <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-slate-500">
                        {emptyState}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          onDecision={decideAction}
                        />
                      ))}
                      {loading ? (
                        <div className="mr-10 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          Thinking...
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
                <form onSubmit={sendMessage} className="border-t border-slate-100 p-3">
                  <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
                    <MessageSquare className="mt-2 h-4 w-4 flex-shrink-0 text-slate-400" />
                    <textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Ask for help with this course, page, or material..."
                      rows={2}
                      className="max-h-28 min-h-10 flex-1 resize-none border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                    <button
                      type="submit"
                      disabled={loading || input.trim().length === 0}
                      aria-label="Send message"
                      className="rounded-md bg-slate-950 p-2 text-white disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function MessageBubble({
  message,
  onDecision,
}: {
  message: EducatorCopilotMessage;
  onDecision: (action: EducatorCopilotAction, decision: "approve" | "reject") => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2 text-sm leading-6",
        message.role === "user"
          ? "ml-10 bg-slate-950 text-white"
          : "mr-6 border border-slate-200 bg-white text-slate-700"
      )}
    >
      <p className="whitespace-pre-wrap">{message.content}</p>
      {message.actions?.length ? (
        <div className="mt-3 space-y-2">
          {message.actions.map((action) => (
            <ActionCard key={action.id} action={action} onDecision={onDecision} />
          ))}
        </div>
      ) : null}
    </div>
  );
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
        {action.type === "highlight" ? (
          <Highlighter className="mt-0.5 h-4 w-4 text-sky-600" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 text-slate-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">{action.label}</p>
          {action.reason ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">{action.reason}</p>
          ) : null}
          {action.preview ? (
            <p className="mt-2 rounded-md bg-white px-2 py-1.5 text-xs leading-5 text-slate-600">
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
    <div className="flex-1 overflow-y-auto p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
        Previous sessions
      </p>
      {!booted ? (
        <p className="text-sm text-slate-500">Loading sessions...</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm leading-6 text-slate-500">No previous copilot sessions yet.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={cn(
                "rounded-lg border p-3",
                activeId === session.id ? "border-slate-950" : "border-slate-200"
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
                  {new Date(session.updatedAt).toLocaleString()}
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

function SettingsPanel({
  actionMode,
  onChange,
}: {
  actionMode: EducatorCopilotActionMode;
  onChange: (mode: EducatorCopilotActionMode) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
        Copilot settings
      </p>
      <div className="space-y-3">
        <ModeOption
          checked={actionMode === "manual"}
          title="Manual approval"
          body="The copilot proposes actions. You approve edits, navigation, and highlights."
          onClick={() => onChange("manual")}
        />
        <ModeOption
          checked={actionMode === "auto"}
          title="Guarded auto mode"
          body="Safe navigation/highlights and approved content-write surfaces can run automatically. Sensitive actions stay blocked."
          onClick={() => onChange("auto")}
        />
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
        The copilot cannot delete records, publish courses, modify payments, change
        collaborators, alter student records, or send email.
      </div>
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
        "w-full rounded-lg border p-3 text-left",
        checked ? "border-slate-950 bg-white" : "border-slate-200 bg-slate-50"
      )}
    >
      <span className="text-sm font-black text-slate-950">{title}</span>
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
        "inline-flex h-9 w-9 items-center justify-center rounded-md border text-slate-600",
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white"
      )}
    >
      {children}
    </button>
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
