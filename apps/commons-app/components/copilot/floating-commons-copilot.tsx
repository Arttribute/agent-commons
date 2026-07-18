"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  Clock3,
  Loader2,
  MessageSquarePlus,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { AgentProvider, useAgentContext } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import SessionInterface from "@/components/sessions/session-interface";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { normalizeSessionHistory } from "@/lib/session-history";
import { CopilotChangeList, type CopilotChange } from "./copilot-change-list";

type CopilotAgent = {
  agentId: string;
  name: string;
  avatar?: string | null;
  greeting?: string;
  conversationStarters?: string[];
  copilotAccessMode?: "full" | "scoped" | "confirm" | null;
  copilotScopes?: string[];
  [key: string]: any;
};

const SCOPES = [
  ["workflows", "Workflows"],
  ["agents", "Agents"],
  ["tools", "Tools"],
  ["skills", "Skills"],
  ["tasks", "Tasks"],
] as const;

export function FloatingCommonsCopilot() {
  return (
    <AgentProvider>
      <FloatingCommonsCopilotInner />
    </AgentProvider>
  );
}

function FloatingCommonsCopilotInner() {
  const pathname = usePathname();
  const { authenticated, ready, authState } = useAuth();
  const { clearMessages, setMessages } = useAgentContext();
  const [copilot, setCopilot] = useState<CopilotAgent | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "sessions" | "settings">("chat");
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [changes, setChanges] = useState<CopilotChange[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mode, setMode] = useState<"full" | "scoped" | "confirm">("confirm");
  const [scopes, setScopes] = useState<string[]>([]);
  const [externalPrompt, setExternalPrompt] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const [uiContext, setUiContext] = useState<Record<string, unknown>>({});

  const hidden = useMemo(
    () =>
      !ready ||
      !authenticated ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/oauth") ||
      pathname.startsWith("/legal") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms"),
    [authenticated, pathname, ready],
  );

  const loadCopilot = useCallback(async () => {
    if (!authenticated) return;
    const response = await fetch("/api/copilot", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const agent = payload?.data ?? null;
    setCopilot(agent);
    setMode(agent?.copilotAccessMode ?? "confirm");
    setScopes(Array.isArray(agent?.copilotScopes) ? agent.copilotScopes : []);
  }, [authenticated]);

  const loadChanges = useCallback(async () => {
    if (!authenticated) return;
    const response = await fetch("/api/copilot/changes", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setChanges(payload?.data ?? []);
  }, [authenticated]);

  const loadSessions = useCallback(async () => {
    if (!copilot?.agentId) return;
    const response = await fetch(
      `/api/sessions/list?agentId=${encodeURIComponent(copilot.agentId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const payload = await response.json();
    setSessions(payload?.data ?? []);
  }, [copilot?.agentId]);

  useEffect(() => {
    loadCopilot();
  }, [loadCopilot, authState.userId]);

  useEffect(() => {
    if (!copilot) return;
    loadChanges();
    const timer = window.setInterval(loadChanges, open ? 5_000 : 30_000);
    return () => window.clearInterval(timer);
  }, [copilot?.agentId, loadChanges, open]);

  useEffect(() => {
    window.addEventListener("copilot-change-created", loadChanges);
    return () =>
      window.removeEventListener("copilot-change-created", loadChanges);
  }, [loadChanges]);

  useEffect(() => {
    document.documentElement.classList.toggle("commons-copilot-open", open);
    return () =>
      document.documentElement.classList.remove("commons-copilot-open");
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const context = pageContext(pathname);
    const base = {
      ...context,
      pathname,
      pageTitle: document.title,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    };
    setUiContext(base);
    if (!context.resourceType || !context.resourceId || !context.apiPath)
      return;
    fetch(context.apiPath, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload?.data) {
          setUiContext({ ...base, resource: resourceContext(payload.data) });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (hidden || !copilot) return null;

  const pending = changes.filter((change) => change.status === "pending");
  const recentlyApplied = changes
    .filter((change) => change.status === "applied")
    .slice(0, 2);
  const inlineChanges = [...pending, ...recentlyApplied];

  const startNewChat = () => {
    clearMessages();
    setSessionId("");
    setExternalPrompt(null);
    setView("chat");
  };

  const openSession = async (id: string) => {
    setLoadingSession(true);
    try {
      const response = await fetch(`/api/sessions/${id}?full=true`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message || "Could not load chat");
      const session = payload?.data ?? payload;
      setMessages(normalizeSessionHistory(session?.history) as any);
      setSessionId(id);
      setView("chat");
    } finally {
      setLoadingSession(false);
    }
  };

  const handleChange = async (
    change: CopilotChange,
    action?: "accept" | "reject" | "revert",
    reason?: string,
  ) => {
    await loadChanges();
    if (!action) return;
    const verb =
      action === "accept"
        ? "approved"
        : action === "reject"
          ? "rejected"
          : "undid";
    const reasonText = reason ? ` Reason: ${reason}` : "";
    const studioUrl = change.resourceId
      ? studioResourceUrl(change.resourceType, change.resourceId)
      : null;
    setExternalPrompt({
      id: `${change.changeId}:${action}:${Date.now()}`,
      text: `I ${verb} the ${change.resourceType} change “${change.title}”.${reasonText}${
        studioUrl ? ` The canonical Studio link is ${studioUrl}.` : ""
      } Acknowledge this review action and explain the resulting state accurately.`,
    });
    setView("chat");
  };

  const saveAccess = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/copilot/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessMode: mode, scopes }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload?.message || "Could not save settings");
      setCopilot(payload.data);
      setMode(payload.data?.copilotAccessMode ?? "confirm");
      setScopes(
        Array.isArray(payload.data?.copilotScopes)
          ? payload.data.copilotScopes
          : [],
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  const profileHref = `/studio/agents/${encodeURIComponent(copilot.agentId)}${
    sessionId
      ? `?section=sessions&session=${encodeURIComponent(sessionId)}`
      : ""
  }`;

  return (
    <TooltipProvider delayDuration={250}>
      {!open && (
        <button
          type="button"
          aria-label="Open Commons Copilot"
          onClick={() => {
            setOpen(true);
            setView("chat");
          }}
          className="fixed bottom-5 right-5 z-40 rounded-full border border-border bg-background p-1 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          <AgentAvatar
            name={copilot.name}
            src={copilot.avatar || "/commons-copilot.png"}
            size={52}
          />
          <span className="absolute -left-1 -top-1 rounded-full bg-foreground p-1 text-background shadow">
            <Sparkles className="h-3 w-3" />
          </span>
          {pending.length > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">
              {pending.length}
            </span>
          )}
        </button>
      )}

      {open && (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-background shadow-xl lg:w-[min(430px,36vw)]">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 transition hover:bg-muted"
            >
              <AgentAvatar
                name={copilot.name}
                src={copilot.avatar || "/commons-copilot.png"}
                size={34}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{copilot.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {sessionId
                    ? "Current Copilot session"
                    : "Agent Commons copilot"}
                </p>
              </div>
            </Link>

            <HeaderIcon
              label="Recent chats"
              active={view === "sessions"}
              onClick={() => {
                setView("sessions");
                loadSessions();
              }}
              icon={<Clock3 className="h-4 w-4" />}
              badge={pending.length}
            />
            <HeaderIcon
              label="Copilot settings"
              active={view === "settings"}
              onClick={() => setView("settings")}
              icon={<Settings2 className="h-4 w-4" />}
            />
            <HeaderIcon
              label="New chat"
              onClick={startNewChat}
              icon={<MessageSquarePlus className="h-4 w-4" />}
            />
            <HeaderIcon
              label="Close Copilot"
              onClick={() => setOpen(false)}
              icon={<X className="h-4 w-4" />}
            />
          </div>

          <div className="min-h-0 flex-1">
            {view === "chat" && (
              <SessionInterface
                agent={copilot as any}
                session={null}
                agentId={copilot.agentId}
                sessionId={sessionId}
                userId={authState.userId || authState.walletAddress || ""}
                onSessionCreated={(createdSessionId) => {
                  setSessionId(createdSessionId);
                  loadSessions();
                }}
                isLoadingSession={loadingSession}
                allowComputer={false}
                uiContext={uiContext}
                externalPrompt={externalPrompt}
                conversationAddon={
                  inlineChanges.length ? (
                    <div className="mt-4 space-y-2 border-t pt-4">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Reviewable changes
                      </p>
                      <CopilotChangeList
                        changes={inlineChanges}
                        compact
                        onChanged={handleChange}
                      />
                    </div>
                  ) : null
                }
              />
            )}

            {view === "sessions" && (
              <ScrollArea className="h-full">
                <div className="space-y-1 p-3">
                  <div className="px-2 pb-2 pt-1">
                    <h2 className="text-sm font-semibold">Recent chats</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Continue an earlier Copilot session.
                    </p>
                  </div>
                  {!sessions.length && (
                    <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                      No previous chats yet.
                    </p>
                  )}
                  {sessions.map((session) => (
                    <button
                      key={session.sessionId}
                      type="button"
                      onClick={() => openSession(session.sessionId)}
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-muted",
                        session.sessionId === sessionId && "bg-muted",
                      )}
                    >
                      <p className="truncate text-sm font-medium">
                        {session.title || "Untitled chat"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDate(session.updatedAt || session.createdAt)}
                      </p>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}

            {view === "settings" && (
              <ScrollArea className="h-full">
                <div className="space-y-5 p-4">
                  <div>
                    <h2 className="text-sm font-semibold">Access policy</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Choose when Copilot may apply changes automatically.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(
                      [
                        [
                          "confirm",
                          "Manual approval",
                          "Review every change in chat.",
                        ],
                        [
                          "scoped",
                          "Automatic in scopes",
                          "Selected resource types apply automatically.",
                        ],
                        [
                          "full",
                          "Full account access",
                          "Account changes apply immediately and remain auditable.",
                        ],
                      ] as const
                    ).map(([value, title, description]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={cn(
                          "w-full rounded-xl border p-3 text-left transition",
                          mode === value
                            ? "border-foreground bg-muted/50"
                            : "hover:bg-muted/30",
                        )}
                      >
                        <div className="flex gap-3">
                          <span
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 rounded-full border",
                              mode === value && "border-4 border-foreground",
                            )}
                          />
                          <span>
                            <span className="block text-sm font-medium">
                              {title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {description}
                            </span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {mode === "scoped" && (
                    <div className="rounded-xl border p-3">
                      <p className="mb-3 text-xs font-medium">
                        Automatic scopes
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {SCOPES.map(([value, label]) => (
                          <Label
                            key={value}
                            className="flex cursor-pointer items-center gap-2 text-xs font-normal"
                          >
                            <Checkbox
                              checked={scopes.includes(value)}
                              onCheckedChange={(checked) =>
                                setScopes((current) =>
                                  checked
                                    ? [...new Set([...current, value])]
                                    : current.filter(
                                        (scope) => scope !== value,
                                      ),
                                )
                              }
                            />
                            {label}
                          </Label>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    disabled={saving}
                    onClick={saveAccess}
                  >
                    {saved ? (
                      <>
                        <Check className="mr-1.5 h-4 w-4" /> Saved
                      </>
                    ) : saving ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{" "}
                        Saving…
                      </>
                    ) : (
                      "Save access policy"
                    )}
                  </Button>
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    Ownership, secrets, system behavior, and security boundaries
                    are never delegated.
                  </p>
                </div>
              </ScrollArea>
            )}
          </div>
        </aside>
      )}
    </TooltipProvider>
  );
}

function HeaderIcon({
  label,
  icon,
  onClick,
  active,
  badge,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn("relative h-8 w-8 shrink-0", active && "bg-muted")}
          onClick={onClick}
        >
          {icon}
          {Boolean(badge) && (
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function pageContext(pathname: string) {
  const match = pathname.match(
    /^\/studio\/(agents|workflows|tasks|tools|skills)\/([^/]+)/,
  );
  if (!match) return { routeName: routeName(pathname) };
  const singular = match[1].slice(0, -1) as
    | "agent"
    | "workflow"
    | "task"
    | "tool"
    | "skill";
  const id = decodeURIComponent(match[2]);
  if (id === "create" || id === "new") {
    return { routeName: `create ${singular}` };
  }
  return {
    routeName: `${singular} detail`,
    resourceType: singular,
    resourceId: id,
    apiPath: `/api/${match[1]}/${encodeURIComponent(id)}`,
  };
}

function routeName(pathname: string) {
  const route = pathname.match(
    /^\/studio\/(agents|workflows|tasks|tools|skills)/,
  )?.[1];
  return route
    ? `${route} list`
    : pathname.startsWith("/studio")
      ? "Studio"
      : "Agent Commons";
}

function resourceContext(value: Record<string, any>) {
  const allowed = [
    "name",
    "title",
    "description",
    "status",
    "agentId",
    "workflowId",
    "taskId",
    "toolId",
    "skillId",
    "scheduledFor",
    "isRecurring",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function studioResourceUrl(type: string, id: string) {
  const plural: Record<string, string> = {
    agent: "agents",
    workflow: "workflows",
    task: "tasks",
    tool: "tools",
    skill: "skills",
  };
  return plural[type]
    ? `/studio/${plural[type]}/${encodeURIComponent(id)}`
    : null;
}

export default FloatingCommonsCopilot;
