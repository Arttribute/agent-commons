"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FolderClosed,
  Loader2,
  MessageSquarePlus,
  Minus,
  Search,
  X,
} from "lucide-react";
import { AgentProvider, useAgentContext } from "@/context/AgentContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { useAgents } from "@/hooks/use-agents";
import { projectsApi, useProjects } from "@/hooks/use-projects";
import { desktopApiFetch } from "@/lib/desktop-api-fetch";
import { apiErrorMessage } from "@/lib/api-error";
import { normalizePrincipalId } from "@/lib/principal-id";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import SessionInterface from "@/components/sessions/session-interface";
import ChatInputBox, { type ComposerLaunch } from "@/components/sessions/chat/chat-input-box";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useCanvasStore } from "@/stores/canvas-store";
import { cn } from "@/lib/utils";
import { ChromeButton } from "./canvas-chrome";

type ChatAgent = { agentId: string; name: string; avatar?: string | null; [key: string]: unknown };
type Mode = "bubble" | "composer" | "panel";

const AGENT_KEY = "commons.canvas.agentId";
const WIDTH_KEY = "commons.canvas.chatWidth";
const MIN_WIDTH = 340;
const MAX_WIDTH = 620;

/**
 * Chat for the artifact on screen. It replaces the Commons Copilot launcher
 * on canvas pages: Copilot is the default agent and any other agent can be
 * picked. Lives in the layout so a conversation survives switching files.
 */
export function CanvasChat() {
  return (
    <AgentProvider>
      <TooltipProvider delayDuration={300}>
        <CanvasChatInner />
      </TooltipProvider>
    </AgentProvider>
  );
}

function CanvasChatInner() {
  const pathname = usePathname() ?? "";
  const { toast } = useToast();
  const { authState } = useAuth();
  const { mode: workspaceMode } = useWorkspaceMode();
  const local = workspaceMode === "private-local";
  const userAddress = normalizePrincipalId(authState.walletAddress);
  const userId = authState.userId || authState.walletAddress || "";
  const { agents } = useAgents(userAddress || undefined);
  const { projects } = useProjects(Boolean(userAddress));
  const { activateSession, setSessionHistory, messages } = useAgentContext();

  const context = useCanvasStore((state) => state.context);
  const attached = useCanvasStore((state) => state.attached);
  const detachNote = useCanvasStore((state) => state.detachNote);
  const clearAttached = useCanvasStore((state) => state.clearAttached);
  const prompt = useCanvasStore((state) => state.prompt);
  const setChatInset = useCanvasStore((state) => state.setChatInset);
  const bumpRevision = useCanvasStore((state) => state.bumpRevision);

  const [copilot, setCopilot] = useState<ChatAgent | null>(null);
  const [agentId, setAgentId] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("composer");
  const [sessionId, setSessionId] = useState("");
  const [launch, setLaunch] = useState<{ key: string; value: ComposerLaunch } | null>(null);
  const [starting, setStarting] = useState(false);
  const [width, setWidth] = useState(400);

  /* ------------------------------------------------------- agents */

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AGENT_KEY);
      if (stored) setAgentId(stored);
      const storedWidth = Number(window.localStorage.getItem(WIDTH_KEY));
      if (storedWidth) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, storedWidth)));
    } catch {
      // Preferences are optional.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (local) {
      void window.agentCommonsLocal?.getState().then((state) => {
        const agent = state.agents.find((item) => item.id === "commons-local") ?? state.agents.find((item) => item.name === "Commons Copilot");
        if (!cancelled && agent) setCopilot({ agentId: agent.id, name: agent.name, avatar: agent.avatar || "/commons-copilot.png" });
      });
      return () => {
        cancelled = true;
      };
    }
    fetch("/api/copilot", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const agent = payload?.data;
        if (!cancelled && agent?.agentId) setCopilot({ ...agent, avatar: agent.avatar || "/commons-copilot.png" });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [local]);

  const agentList = useMemo(() => {
    const list: ChatAgent[] = [];
    if (copilot) list.push(copilot);
    for (const agent of agents as unknown as ChatAgent[]) {
      if (!list.some((entry) => entry.agentId === agent.agentId)) list.push(agent);
    }
    return list;
  }, [agents, copilot]);
  const agent = agentList.find((entry) => entry.agentId === agentId) ?? copilot ?? agentList[0] ?? null;

  useEffect(() => { useCanvasStore.getState().setAgentId(agent?.agentId ?? ""); }, [agent?.agentId]);

  const chooseAgent = (next: ChatAgent) => {
    if (next.agentId === agent?.agentId) return;
    setAgentId(next.agentId);
    try {
      window.localStorage.setItem(AGENT_KEY, next.agentId);
    } catch {
      // Remembering the agent is a convenience.
    }
    // A conversation belongs to one agent, so a new agent starts a new chat.
    if (sessionId) {
      setSessionId("");
      setLaunch(null);
      if (mode === "panel") setMode("composer");
    }
  };

  /* -------------------------------------------------------- panel */

  const setDockInset = useCanvasStore((state) => state.setDockInset);
  useEffect(() => {
    setChatInset(mode === "panel" ? width + 24 : 0);
    setDockInset(mode === "composer" ? 470 : mode === "bubble" ? 76 : 0);
  }, [mode, setChatInset, setDockInset, width]);
  useEffect(
    () => () => {
      setChatInset(0);
      setDockInset(0);
    },
    [setChatInset, setDockInset],
  );

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let next = startWidth;
    const move = (pointer: PointerEvent) => {
      next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (startX - pointer.clientX)));
      setWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        window.localStorage.setItem(WIDTH_KEY, String(next));
      } catch {
        // Width is remembered on a best-effort basis.
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // An agent finishing a turn may have changed the artifact.
  const streaming = Boolean(messages.at(-1)?.isStreaming);
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !streaming) bumpRevision();
    wasStreaming.current = streaming;
  }, [bumpRevision, streaming]);

  /* ------------------------------------------------------ sending */

  const uiContext = useMemo(() => {
    if (!context) return undefined;
    return {
      pathname,
      pageTitle: context.artifact.name,
      routeName: "Canvas",
      activeLibraryItemId: context.artifact.itemId,
      ...(context.projectId
        ? {
            resourceType: "canvas",
            resourceId: context.projectId,
            canvasRevisionId: context.revisionId,
            annotationIds: attached.map((note) => note.annotationId),
            canvasViewer: context.viewer,
          }
        : {}),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: typeof navigator !== "undefined" ? navigator.language : undefined,
    };
  }, [attached, context, pathname]);

  const begin = useCallback(
    async (value: ComposerLaunch) => {
      if (!agent) return;
      setStarting(true);
      try {
        let id = sessionId;
        if (!id) {
          const response = await desktopApiFetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: agent.agentId, title: "New chat", ...(projectId ? { projectId } : {}) }),
          });
          const payload = await response.json().catch(() => null);
          id = payload?.data?.sessionId;
          if (!response.ok || !id) throw new Error(apiErrorMessage(payload, "The chat could not be started"));
          setSessionHistory(id, []);
          setSessionId(id);
        }
        activateSession(id);
        const file = context?.artifact;
        const attachments = file && !value.attachments.some((item) => item.fileId === file.itemId)
          ? [...value.attachments, { fileId: file.itemId, name: file.name, mimeType: file.mimeType, kind: "file" as const, sizeBytes: 0 }]
          : value.attachments;
        setLaunch({ key: `${id}:${Date.now()}`, value: { ...value, attachments } });
        setMode("panel");
      } catch (cause) {
        toast({ title: cause instanceof Error ? cause.message : "The chat could not be started", variant: "destructive" });
      } finally {
        setStarting(false);
      }
    },
    [activateSession, agent, context, projectId, sessionId, setSessionHistory, toast],
  );

  // Prompts from canvas controls (quick actions).
  const handledPrompt = useRef<string | null>(null);
  const [panelPrompt, setPanelPrompt] = useState<{ id: string; text: string; mode: "send" | "draft" } | null>(null);
  useEffect(() => {
    if (!prompt || handledPrompt.current === prompt.id) return;
    handledPrompt.current = prompt.id;
    if (mode === "panel") setPanelPrompt(prompt);
    else if (prompt.mode === "send") void begin({ text: prompt.text, attachments: [], knowledgeSpaceIds: [] });
    else {
      setMode("composer");
      setPanelPrompt(prompt);
    }
  }, [begin, mode, prompt]);

  const changeProject = async (next: string | null) => {
    setProjectId(next);
    if (!sessionId) return;
    try {
      await projectsApi.moveSession(sessionId, next);
    } catch {
      toast({ title: "The chat could not be moved to that project", variant: "destructive" });
    }
  };

  const newChat = () => {
    setSessionId("");
    setLaunch(null);
    setMode("composer");
  };

  if (!context || !agent) return null;

  const noteChips = attached.length > 0 && (
    <div className="flex flex-wrap gap-1.5 px-3 pt-3">
      {attached.map((note) => (
        <span
          key={note.annotationId}
          className="flex max-w-full items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 py-1 pl-1.5 pr-1 text-xs text-amber-950"
          title={note.body}
        >
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1 text-[9px] font-medium text-white">
            {note.number || "•"}
          </span>
          <span className="max-w-40 truncate">{note.body}</span>
          <button
            type="button"
            onClick={() => detachNote(note.annotationId)}
            className="rounded p-0.5 text-amber-800 hover:bg-amber-100"
            aria-label={`Remove note ${note.number} from this message`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );

  if (mode === "bubble") {
    return (
      <button
        type="button"
        onClick={() => setMode("composer")}
        aria-label={`Chat with ${agent.name}`}
        className="fixed bottom-5 right-5 z-40 rounded-full border border-stone-200 bg-white p-1 shadow-floating transition hover:-translate-y-0.5"
      >
        <AgentAvatar name={agent.name} src={agent.avatar ?? undefined} size={44} />
        {attached.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-medium text-white">
            {attached.length}
          </span>
        )}
      </button>
    );
  }

  if (mode === "composer") {
    return (
      <div className="fixed bottom-5 right-5 z-40 w-[min(440px,calc(100vw-2.5rem))]">
        <div className="mb-2 flex items-center justify-between gap-2">
          <ProjectChip projects={projects} projectId={projectId} onChange={(next) => void changeProject(next)} />
          <div className="flex items-center gap-1">
            {sessionId && (
              <button
                type="button"
                onClick={() => setMode("panel")}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 shadow-card hover:text-stone-900"
              >
                Show chat
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode("bubble")}
              aria-label="Minimize chat"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-card hover:text-stone-900"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <ChatInputBox
          agentId={agent.agentId}
          sessionId=""
          userId={userId}
          onLaunch={(value) => void begin(value)}
          launching={starting}
          allowComputer={false}
          placeholder={sessionId ? `Reply to ${agent.name}` : "Ask about this file"}
          headerSlot={noteChips}
          footerEnd={<AgentPicker agents={agentList} selected={agent} onSelect={chooseAgent} compact />}
          hideThinking
          externalPrompt={panelPrompt}
        />
      </div>
    );
  }

  return (
    <aside
      className="fixed bottom-3 right-3 top-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-floating"
      style={{ width }}
      aria-label={`Chat with ${agent.name}`}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat"
        onPointerDown={startResize}
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-stone-200/70"
      />
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-stone-100 px-2">
        <AgentPicker agents={agentList} selected={agent} onSelect={chooseAgent} />
        <div className="ml-auto flex items-center gap-0.5">
          <ProjectChip projects={projects} projectId={projectId} onChange={(next) => void changeProject(next)} iconOnly />
          {sessionId && !local && (
            <Link
              href={`/sessions/${encodeURIComponent(sessionId)}`}
              aria-label="Open as a full chat"
              title="Open as a full chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
          <ChromeButton label="New chat" onClick={newChat}>
            <MessageSquarePlus />
          </ChromeButton>
          <ChromeButton label="Close chat" onClick={() => setMode("composer")}>
            <X />
          </ChromeButton>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        {sessionId ? (
          <SessionInterface
            key={launch?.key ?? sessionId}
            agent={agent as never}
            session={null}
            agentId={agent.agentId}
            sessionId={sessionId}
            userId={userId}
            allowComputer={false}
            uiContext={uiContext}
            initialLaunch={launch?.value ?? null}
            onInitialLaunchSent={() => setLaunch((current) => (current ? { ...current, value: { ...current.value, text: "", attachments: [] } } : current))}
            onComposerSent={clearAttached}
            composerHeader={noteChips}
            composerPlaceholder="Ask about this file"
            externalPrompt={panelPrompt}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
          </div>
        )}
      </div>
    </aside>
  );
}

function AgentPicker({
  agents,
  selected,
  onSelect,
  compact = false,
}: {
  agents: ChatAgent[];
  selected: ChatAgent;
  onSelect: (agent: ChatAgent) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Agent: ${selected.name}. Change agent`}
          title={compact ? selected.name : undefined}
          className={cn(
            "flex items-center gap-2 rounded-full transition-colors hover:bg-stone-100",
            compact ? "p-0.5" : "py-1 pl-1 pr-2",
          )}
        >
          <AgentAvatar name={selected.name} src={selected.avatar ?? undefined} size={compact ? 26 : 28} />
          {!compact && (
            <>
              <span className="max-w-40 truncate text-sm font-medium text-stone-900">{selected.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-stone-400" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={compact ? "end" : "start"} side={compact ? "top" : "bottom"} className="w-64 p-1">
        <p className="px-2 pb-1 pt-1.5 text-xs text-stone-500">Chat with</p>
        <div className="max-h-72 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.agentId}
              type="button"
              onClick={() => {
                onSelect(agent);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100"
            >
              <AgentAvatar name={agent.name} src={agent.avatar ?? undefined} size={24} />
              <span className="min-w-0 flex-1 truncate">{agent.name}</span>
              {agent.agentId === selected.agentId && <Check className="h-3.5 w-3.5 text-stone-700" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProjectChip({
  projects,
  projectId,
  onChange,
  iconOnly = false,
}: {
  projects: Array<{ projectId: string; name: string }>;
  projectId: string | null;
  onChange: (projectId: string | null) => void;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = projects.find((project) => project.projectId === projectId);
  const visible = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <button
            type="button"
            aria-label={selected ? `Project: ${selected.name}` : "Choose project"}
            title={selected ? selected.name : "Choose project"}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900",
              selected && "text-stone-900",
            )}
          >
            <FolderClosed className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            className="flex max-w-[240px] items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 shadow-card hover:text-stone-900"
          >
            <FolderClosed className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{selected?.name ?? "Choose project"}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" side={iconOnly ? "bottom" : "top"} className="w-64 p-1">
        <div className="flex items-center gap-2 border-b border-stone-100 px-2 pb-1.5 pt-1">
          <Search className="h-3.5 w-3.5 text-stone-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-stone-400"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {visible.map((project) => (
            <button
              key={project.projectId}
              type="button"
              onClick={() => {
                onChange(project.projectId);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100"
            >
              <FolderClosed className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.projectId === projectId && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
          {!visible.length && <p className="px-2 py-2 text-xs text-stone-500">No projects found</p>}
        </div>
        {projectId && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg border-t border-stone-100 px-2 py-2 text-left text-sm text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
            Don&apos;t work in a project
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
