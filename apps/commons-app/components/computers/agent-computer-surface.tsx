"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CornerDownLeft,
  Cpu,
  FileCode2,
  FolderClosed,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  Maximize2,
  Minimize2,
  Moon,
  Play,
  Power,
  RefreshCw,
  RotateCw,
  Settings2,
  SquareTerminal,
  Sun,
  X,
} from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  currentNodes,
  isActiveComputer,
  isComputerUsable,
  parseSnapshot,
  type AgentComputer,
  type AgentComputerConfig,
  type ComputerRuntimeTab,
  type ComputerResourceMode,
  type ComputerResourceProfile,
  type FsNode,
} from "@/components/computers/computer-types";
import { TrafficLights, WindowFrame } from "@/components/computers/desktop-window";
import { MacFileIcon, MacFolderIcon } from "@/components/computers/mac-icons";
import {
  APPEARANCES,
  useComputerTheme,
  type AppearanceId,
  type CodeTheme,
  type ComputerMode,
  type ComputerTokens,
} from "@/components/computers/computer-theme";

type ComputerEvent = {
  eventId: string;
  eventType: string;
  summary?: string | null;
  payload?: Record<string, any> | null;
  createdAt: string;
};

/** The apps living on the desktop, plus the overview and settings views. */
type ComputerApp = "browser" | "code" | "files" | "terminal" | "overview" | "config";

type ComputerPowerAction = "wake" | "sleep" | "restart";

const WIDTH_KEY = "agent-computer:width";
const MIN_WIDTH = 460;
const MIN_CHAT = 380;
const DEFAULT_WIDTH = 760;
const FULLSCREEN_GRAB = 56;
const CLOSE_MARGIN = 130;

function mapTab(tab?: ComputerRuntimeTab): ComputerApp {
  if (tab === "browser") return "browser";
  if (tab === "terminal") return "terminal";
  // A "files" runtime tab is emitted for editor/file scenes — open the IDE.
  return "code";
}

export function AgentComputerSurface({
  agentId,
  activeTab,
  autoRefresh = false,
  embedded = false,
  onClose,
  className,
}: {
  agentId: string;
  activeTab?: ComputerRuntimeTab;
  autoRefresh?: boolean;
  embedded?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const [config, setConfig] = useState<AgentComputerConfig | null>(null);
  const [draft, setDraft] = useState<AgentComputerConfig | null>(null);
  const [computer, setComputer] = useState<AgentComputer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [powerAction, setPowerAction] = useState<ComputerPowerAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [app, setApp] = useState<ComputerApp>(mapTab(activeTab));
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const { mode, wallpaper, tokens, codeTheme, appearanceId, setAppearance, setCodeTheme } =
    useComputerTheme();

  // Panel geometry (session mode only).
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [fullscreen, setFullscreen] = useState(false);
  const [nearClose, setNearClose] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef(false);
  const willCloseRef = useRef(false);
  fullscreenRef.current = fullscreen;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [configRes, computerRes] = await Promise.all([
        fetch(`/api/agents/${agentId}/computer/config`, { cache: "no-store" }),
        fetch(`/api/agents/${agentId}/computer`, { cache: "no-store" }),
      ]);
      const configPayload = await configRes.json();
      const computerPayload = await computerRes.json();
      if (!configRes.ok) throw new Error(errorMessage(configPayload, "Could not load computer config"));
      if (!computerRes.ok) throw new Error(errorMessage(computerPayload, "Could not load computer"));
      const nextConfig = normalizeComputerConfig(configPayload.data);
      setConfig(nextConfig);
      setDraft((current) => current ?? nextConfig);
      const nextComputer = unwrapComputer(computerPayload);
      setComputer(nextComputer);
      if (
        nextComputer?.errorMessage &&
        ["failed", "error", "unavailable"].includes(nextComputer.status)
      ) {
        setError(nextComputer.errorMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Computer load failed");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (activeTab) setApp(mapTab(activeTab));
  }, [activeTab]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => load(), 2500);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  // Restore the persisted panel width once on the client.
  useEffect(() => {
    if (embedded) return;
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= MIN_WIDTH) setWidth(saved);
  }, [embedded]);

  const startResize = (event: React.PointerEvent) => {
    if (embedded) return;
    event.preventDefault();
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) return;
    const rightEdge = panel.getBoundingClientRect().right;
    const containerWidth = container.getBoundingClientRect().width;
    const maxWidth = Math.max(MIN_WIDTH, containerWidth - MIN_CHAT);
    let committedWidth = width;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (ev: PointerEvent) => {
      const raw = rightEdge - ev.clientX;
      if (raw >= containerWidth - FULLSCREEN_GRAB) {
        if (!fullscreenRef.current) setFullscreen(true);
        setNearClose(false);
        willCloseRef.current = false;
        return;
      }
      if (fullscreenRef.current) setFullscreen(false);
      committedWidth = Math.max(MIN_WIDTH, Math.min(raw, maxWidth));
      setWidth(committedWidth);
      const closing = raw < MIN_WIDTH - CLOSE_MARGIN;
      willCloseRef.current = closing;
      setNearClose(closing);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setNearClose(false);
      if (willCloseRef.current) {
        onClose?.();
      } else {
        try {
          window.localStorage.setItem(WIDTH_KEY, String(Math.round(committedWidth)));
        } catch {
          /* storage may be unavailable */
        }
      }
      willCloseRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const saveConfig = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/agents/${agentId}/computer/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(computerConfigPatch(draft)),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Could not save config"));
      const nextConfig = normalizeComputerConfig(payload.data);
      setConfig(nextConfig);
      setDraft(nextConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save config");
    } finally {
      setSaving(false);
    }
  };

  const runPowerAction = async (action: ComputerPowerAction) => {
    setPowerAction(action);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/computer/${action}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, `Could not ${action} computer`));
      setComputer(unwrapComputer(payload));
      await load();
      if (action === "wake") setApp("terminal");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} computer`);
    } finally {
      setPowerAction(null);
    }
  };

  const enableComputer = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}/computer/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload, "Could not enable computer"));
      const nextConfig = normalizeComputerConfig(payload.data);
      setConfig(nextConfig);
      setDraft(nextConfig);
      await runPowerAction("wake");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable computer");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className={cn("flex min-h-0 flex-1 flex-col", tokens.panel)}>
      <TopBar
        app={app}
        onApp={setApp}
        computer={computer}
        loading={loading}
        embedded={embedded}
        fullscreen={fullscreen}
        mode={mode}
        tokens={tokens}
        onRefresh={load}
        onToggleFullscreen={() => setFullscreen((value) => !value)}
        onToggleMode={() => setAppearance(mode === "dark" ? "light" : "dark")}
        onClose={onClose}
      />

      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-600 dark:text-red-300">
          <span className="truncate">{error}</span>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        {app === "overview" ? (
          <ComputerOverview
            computer={computer}
            config={config}
            loading={loading}
            powerAction={powerAction}
            tokens={tokens}
            onAction={runPowerAction}
            onConfigure={() => setApp("config")}
          />
        ) : app === "config" ? (
          <ConfigView
            draft={draft}
            saving={saving}
            tokens={tokens}
            appearanceId={appearanceId}
            codeTheme={codeTheme}
            onSetAppearance={setAppearance}
            onSetCodeTheme={setCodeTheme}
            onChange={setDraft}
            onSave={saveConfig}
          />
        ) : (
          <DesktopStage
            app={app}
            agentId={agentId}
            computer={computer}
            loading={loading}
            powerAction={powerAction}
            enabled={Boolean(config?.enabled)}
            autoRefresh={autoRefresh}
            eventsKey={computer?.updatedAt ?? ""}
            openPath={pendingFile}
            mode={mode}
            tokens={tokens}
            wallpaper={wallpaper}
            codeTheme={codeTheme}
            onSetCodeTheme={setCodeTheme}
            onOpenFile={(path) => {
              setPendingFile(path);
              setApp("code");
            }}
            onFileOpened={() => setPendingFile(null)}
            onWake={() => runPowerAction("wake")}
            onEnable={enableComputer}
            onRefresh={load}
            onManage={() => setApp("overview")}
          />
        )}
      </div>
    </div>
  );

  if (embedded) {
    return <div className={cn("flex h-full min-h-0 w-full overflow-hidden", className)}>{body}</div>;
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l shadow-[0_0_40px_-4px_rgba(0,0,0,0.35)]",
        tokens.panel,
        fullscreen && "absolute inset-0 z-30 w-auto border-l-0",
        className,
      )}
      style={fullscreen ? undefined : { width }}
    >
      {!fullscreen && (
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startResize}
          className={cn(
            "group absolute inset-y-0 left-0 z-40 w-1.5 -translate-x-1/2 cursor-col-resize",
          )}
          title="Drag to resize · drag past the edge to close"
        >
          <span
            className={cn(
              "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover:bg-indigo-400/60",
              nearClose && "bg-red-500/70 group-hover:bg-red-500/70",
            )}
          />
        </div>
      )}
      {body}
    </div>
  );
}

/* ─── Top bar ─────────────────────────────────────────────────────────────── */

const APPS: Array<{ id: ComputerApp; label: string; icon: typeof Globe }> = [
  { id: "browser", label: "Browser", icon: Globe },
  { id: "code", label: "Code", icon: FileCode2 },
  { id: "files", label: "Files", icon: FolderClosed },
  { id: "terminal", label: "Terminal", icon: SquareTerminal },
];

function TopBar({
  app,
  onApp,
  computer,
  loading,
  embedded,
  fullscreen,
  mode,
  tokens,
  onRefresh,
  onToggleFullscreen,
  onToggleMode,
  onClose,
}: {
  app: ComputerApp;
  onApp: (app: ComputerApp) => void;
  computer: AgentComputer | null;
  loading: boolean;
  embedded: boolean;
  fullscreen: boolean;
  mode: ComputerMode;
  tokens: ComputerTokens;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
  onToggleMode: () => void;
  onClose?: () => void;
}) {
  return (
    <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b px-2.5 backdrop-blur", tokens.topBar)}>
      {!embedded && onClose && (
        <TrafficLights
          className="mr-1"
          tone={mode}
          close={{ onClick: onClose, title: "Close", glyph: <X className="h-2 w-2" /> }}
          minimize={{ onClick: onClose, title: "Close panel" }}
          zoom={{ onClick: onToggleFullscreen, title: fullscreen ? "Restore" : "Fill screen" }}
        />
      )}

      <button
        type="button"
        onClick={() => onApp("overview")}
        title="Computer overview"
        className={cn(
          "flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors",
          app === "overview" ? tokens.chipActive : tokens.chip,
        )}
      >
        <StatusDot status={computer?.status} active={isActiveComputer(computer)} />
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn("truncate text-[11px] font-medium", tokens.text)}>
            {computer?.name ?? "Agent computer"}
          </span>
          <span className={cn("truncate text-[9px] uppercase tracking-wide", tokens.textDim)}>
            {computer ? humanStatus(computer.status) : "not set up"}
          </span>
        </span>
      </button>

      <span className={cn("h-5 w-px", tokens.divider)} />

      <div className={cn("flex items-center gap-0.5 rounded-lg p-0.5", tokens.switcherTrack)}>
        {APPS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={label}
            onClick={() => onApp(id)}
            className={cn(
              "flex h-7 w-8 items-center justify-center rounded-md transition-colors",
              app === id ? tokens.switcherActive : tokens.switcherIdle,
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <IconButton title={mode === "dark" ? "Light appearance" : "Dark appearance"} tokens={tokens} onClick={onToggleMode}>
          {mode === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton title="Refresh" tokens={tokens} onClick={onRefresh}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </IconButton>
        <IconButton title="Settings" tokens={tokens} active={app === "config"} onClick={() => onApp("config")}>
          <Settings2 className="h-3.5 w-3.5" />
        </IconButton>
        {!embedded && (
          <>
            <span className={cn("mx-0.5 h-5 w-px", tokens.divider)} />
            <IconButton title={fullscreen ? "Restore panel" : "Fill screen"} tokens={tokens} onClick={onToggleFullscreen}>
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </IconButton>
            {onClose && (
              <IconButton title="Close" tokens={tokens} onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  active,
  tokens,
  children,
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  tokens: ComputerTokens;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        active ? tokens.iconBtnActive : tokens.iconBtn,
      )}
    >
      {children}
    </button>
  );
}

function StatusDot({ status, active }: { status?: string; active?: boolean }) {
  const tone =
    status && ["running", "idle"].includes(status)
      ? "bg-emerald-400"
      : status && ["provisioning", "starting", "restarting", "resizing", "stopping"].includes(status)
        ? "bg-amber-400"
        : status && ["failed", "error", "unavailable"].includes(status)
          ? "bg-red-400"
          : "bg-zinc-600";
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
      {active && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", tone)} />}
      <span className={cn("relative h-2.5 w-2.5 rounded-full", tone)} />
    </span>
  );
}

/* ─── Desktop stage (wallpaper + floating app window) ─────────────────────── */

function DesktopStage({
  app,
  agentId,
  computer,
  loading,
  powerAction,
  enabled,
  autoRefresh,
  eventsKey,
  openPath,
  mode,
  tokens,
  wallpaper,
  codeTheme,
  onSetCodeTheme,
  onOpenFile,
  onFileOpened,
  onWake,
  onEnable,
  onRefresh,
  onManage,
}: {
  app: ComputerApp;
  agentId: string;
  computer: AgentComputer | null;
  loading: boolean;
  powerAction: ComputerPowerAction | null;
  enabled: boolean;
  autoRefresh?: boolean;
  eventsKey: string;
  openPath: string | null;
  mode: ComputerMode;
  tokens: ComputerTokens;
  wallpaper: CSSProperties;
  codeTheme: CodeTheme;
  onSetCodeTheme: (theme: CodeTheme) => void;
  onOpenFile: (path: string) => void;
  onFileOpened: () => void;
  onWake: () => void;
  onEnable: () => void;
  onRefresh: () => void;
  onManage: () => void;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={wallpaper}>
      <div className={cn("pointer-events-none absolute inset-0", tokens.vignette)} />
      {loading && !computer ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className={cn("h-6 w-6 animate-spin", tokens.textDim)} />
        </div>
      ) : !isComputerUsable(computer) ? (
        <BootDesktop
          computer={computer}
          busy={Boolean(powerAction)}
          enabled={enabled}
          mode={mode}
          tokens={tokens}
          onWake={onWake}
          onEnable={onEnable}
          onManage={onManage}
        />
      ) : app === "browser" ? (
        <div className="absolute inset-2 sm:inset-3">
          <BrowserWindow agentId={agentId} computer={computer} mode={mode} tokens={tokens} onRefresh={onRefresh} />
        </div>
      ) : app === "code" ? (
        <div className="absolute inset-2 sm:inset-3">
          <CodeWindow
            agentId={agentId}
            computer={computer}
            openPath={openPath}
            codeTheme={codeTheme}
            onSetCodeTheme={onSetCodeTheme}
            onOpened={onFileOpened}
          />
        </div>
      ) : app === "files" ? (
        <div className="absolute inset-4 sm:inset-6 lg:inset-8">
          <FilesWindow computer={computer} mode={mode} tokens={tokens} onOpenFile={onOpenFile} />
        </div>
      ) : (
        <div className="absolute inset-x-0 top-6 bottom-6 mx-auto w-[min(92%,760px)]">
          <TerminalWindow
            agentId={agentId}
            computer={computer}
            autoRefresh={autoRefresh}
            eventsKey={eventsKey}
            onRefresh={onRefresh}
          />
        </div>
      )}
    </div>
  );
}

function BootDesktop({
  computer,
  busy,
  enabled,
  mode,
  tokens,
  onWake,
  onEnable,
  onManage,
}: {
  computer: AgentComputer | null;
  busy: boolean;
  enabled: boolean;
  mode: ComputerMode;
  tokens: ComputerTokens;
  onWake: () => void;
  onEnable: () => void;
  onManage: () => void;
}) {
  const light = mode === "light";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-2xl border shadow-inner backdrop-blur",
          light ? "border-zinc-200 bg-white/70" : "border-white/10 bg-white/[0.04]",
        )}
      >
        <Power className={cn("h-7 w-7", light ? "text-zinc-600" : "text-zinc-300")} />
      </div>
      <div className="space-y-1">
        <p className={cn("text-sm font-medium", tokens.text)}>
          {!enabled ? "Computer not enabled" : computer ? `Computer is ${humanStatus(computer.status)}` : "Computer is ready to set up"}
        </p>
        <p className={cn("mx-auto max-w-xs text-xs leading-relaxed", tokens.textDim)}>
          {enabled
            ? "Wake this agent’s persistent cloud computer. Its workspace remains available between chats and sleep cycles."
            : "Enable one persistent CommonOS computer for this agent. It stays off until the agent or you need it."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className={cn(
            "h-8 gap-1.5",
            light ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-zinc-100 text-zinc-900 hover:bg-white",
          )}
          disabled={busy}
          onClick={enabled ? onWake : onEnable}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {enabled ? "Wake computer" : "Enable computer"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-8 gap-1.5",
            light ? "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900" : "text-zinc-300 hover:bg-white/10 hover:text-white",
          )}
          onClick={onManage}
        >
          <Cpu className="h-3.5 w-3.5" />
          Manage
        </Button>
      </div>
    </div>
  );
}

/* ─── Browser window ──────────────────────────────────────────────────────── */

function BrowserWindow({
  agentId,
  computer,
  mode,
  tokens,
  onRefresh,
}: {
  agentId: string;
  computer: AgentComputer;
  mode: ComputerMode;
  tokens: ComputerTokens;
  onRefresh: () => void;
}) {
  const [url, setUrl] = useState(computer.browser?.url ?? "");
  const [opening, setOpening] = useState(false);
  const light = mode === "light";

  useEffect(() => {
    setUrl(computer.browser?.url ?? "");
  }, [computer.browser?.url]);

  const open = async () => {
    if (!url.trim()) return;
    setOpening(true);
    try {
      await fetch(`/api/agents/${agentId}/computer/browser/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      onRefresh();
    } finally {
      setOpening(false);
    }
  };

  return (
    <WindowFrame
      tone={mode}
      icon={<Globe className={cn("h-3 w-3", tokens.textDim)} />}
      title={hostOf(url) || "Browser"}
      className="h-full"
      bodyClassName={light ? "bg-white" : "bg-zinc-950"}
      toolbar={
        <div className={cn("flex items-center gap-1.5 border-b px-2 py-1.5", tokens.toolbar)}>
          <span className={cn("flex items-center gap-1 px-1", tokens.textDim)}>
            <ArrowLeft className="h-3.5 w-3.5" />
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <button
            type="button"
            onClick={open}
            className={cn("flex h-6 w-6 items-center justify-center rounded", tokens.iconBtn)}
            title="Reload"
          >
            <RotateCw className={cn("h-3.5 w-3.5", opening && "animate-spin")} />
          </button>
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3",
              light ? "border-zinc-200 bg-zinc-50" : "border-white/10 bg-black/40",
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", browserStatusClass(computer.browser?.status))} />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") open();
              }}
              placeholder="Enter a URL and press ⏎"
              className={cn(
                "h-7 min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none",
                light ? "text-zinc-700 placeholder:text-zinc-400" : "text-zinc-200 placeholder:text-zinc-600",
              )}
            />
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className={cn("min-h-0 flex-1 overflow-auto", light ? "bg-zinc-50" : "bg-white/[0.02]")}>
          {computer.browser?.screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={computer.browser.screenshot}
              alt="Agent browser viewport"
              className="mx-auto w-full max-w-full"
            />
          ) : (
            <div className={cn("flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-sm", tokens.textDim)}>
              <Globe className="h-8 w-8" />
              <span>{computer.browser?.status === "starting" ? "Browser is launching…" : "No viewport captured yet"}</span>
            </div>
          )}
        </div>
        <div className={cn("truncate border-t px-3 py-1.5 font-mono text-[10px]", tokens.toolbar, tokens.textDim)}>
          {computer.browser?.error ??
            computer.browser?.lastAction ??
            computer.browser?.title ??
            computer.browser?.url ??
            "browser idle"}
        </div>
      </div>
    </WindowFrame>
  );
}

/* ─── Code window (IDE) ───────────────────────────────────────────────────── */

type OpenFile = { path: string; name: string; content: string; loading: boolean; error?: string };

function CodeWindow({
  agentId,
  computer,
  openPath,
  codeTheme,
  onSetCodeTheme,
  onOpened,
}: {
  agentId: string;
  computer: AgentComputer;
  openPath?: string | null;
  codeTheme: CodeTheme;
  onSetCodeTheme: (theme: CodeTheme) => void;
  onOpened?: () => void;
}) {
  const tree = useMemo(() => parseSnapshot(computer.workspaceSnapshot ?? ""), [computer.workspaceSnapshot]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const dark = codeTheme === "dark";
  const c = CODE_TONES[codeTheme];

  const active = openFiles.find((file) => file.path === activePath) ?? null;

  const openFile = useCallback(
    async (path: string, name: string) => {
      setActivePath(path);
      setOpenFiles((current) => {
        if (current.some((file) => file.path === path)) return current;
        return [...current, { path, name, content: "", loading: true }];
      });
      try {
        const res = await fetch(
          `/api/agents/${agentId}/computer/files/read?path=${encodeURIComponent(path)}`,
        );
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error || "Could not read file");
        setOpenFiles((current) =>
          current.map((file) =>
            file.path === path ? { ...file, content: payload.data?.content ?? "", loading: false } : file,
          ),
        );
      } catch (err) {
        setOpenFiles((current) =>
          current.map((file) =>
            file.path === path
              ? { ...file, loading: false, error: err instanceof Error ? err.message : "Could not read file" }
              : file,
          ),
        );
      }
    },
    [agentId, computer.computerId],
  );

  // Open a file requested from the Finder view (cross-linked from Files → Code).
  useEffect(() => {
    if (!openPath) return;
    const name = openPath.split("/").filter(Boolean).pop() ?? openPath;
    openFile(openPath, name);
    onOpened?.();
  }, [openPath, openFile, onOpened]);

  const closeTab = (path: string) => {
    setOpenFiles((current) => {
      const next = current.filter((file) => file.path !== path);
      if (activePath === path) setActivePath(next[next.length - 1]?.path ?? null);
      return next;
    });
  };

  return (
    <WindowFrame
      tone={codeTheme}
      icon={<FileCode2 className="h-3 w-3 text-indigo-400" />}
      title={active ? active.name : `Code — ${computer.name}`}
      className="h-full"
      bodyClassName={dark ? "bg-zinc-950" : "bg-white"}
      accent
      actions={
        <button
          type="button"
          title={dark ? "Light editor" : "Dark editor"}
          onClick={() => onSetCodeTheme(dark ? "light" : "dark")}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded transition-colors",
            dark ? "text-zinc-500 hover:bg-white/10 hover:text-zinc-200" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
          )}
        >
          {dark ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>
      }
    >
      <div className="flex h-full min-h-0">
        <div className={cn("flex w-52 min-w-0 shrink-0 flex-col border-r", c.explorer)}>
          <div className={cn("flex h-8 items-center gap-1.5 border-b px-3 text-[10px] font-medium uppercase tracking-wide", c.explorerBorder, c.dim)}>
            <FolderOpen className="h-3 w-3" />
            Explorer
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="py-1">
              {tree.length === 0 ? (
                <p className={cn("px-3 py-6 text-center text-[11px] leading-relaxed", c.faint)}>
                  Workspace files appear here once the computer starts working.
                </p>
              ) : (
                <FileTree nodes={tree} prefix="" activePath={activePath} tone={codeTheme} onOpen={openFile} />
              )}
            </div>
          </ScrollArea>
        </div>

        <div className={cn("flex min-w-0 flex-1 flex-col", dark ? "bg-zinc-950" : "bg-white")}>
          {openFiles.length > 0 && (
            <div className={cn("flex h-8 items-stretch overflow-x-auto border-b", c.tabsBar)}>
              {openFiles.map((file) => (
                <div
                  key={file.path}
                  className={cn(
                    "group flex items-center gap-2 border-r px-3 text-[11px]",
                    c.tabBorder,
                    file.path === activePath ? c.tabActive : c.tabIdle,
                  )}
                >
                  <button type="button" className="max-w-[140px] truncate" onClick={() => setActivePath(file.path)}>
                    {file.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(file.path)}
                    className={cn("opacity-0 transition-opacity group-hover:opacity-100", c.tabClose)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            {!active ? (
              <div className={cn("flex h-full flex-col items-center justify-center gap-2 text-sm", c.faint)}>
                <FileCode2 className="h-8 w-8" />
                <span>Select a file to open it in the editor</span>
              </div>
            ) : active.loading ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className={cn("h-5 w-5 animate-spin", c.faint)} />
              </div>
            ) : active.error ? (
              <div className={cn("flex h-full items-center justify-center px-8 text-center text-sm", c.dim)}>
                {active.error}
              </div>
            ) : (
              <CodeEditor content={active.content} name={active.name} theme={codeTheme} />
            )}
          </div>
          {active && !active.loading && !active.error && (
            <div className={cn("flex h-6 shrink-0 items-center gap-3 border-t px-3 font-mono text-[10px]", c.status)}>
              <span className="truncate">{active.path}</span>
              <span className="ml-auto uppercase">{languageOf(active.name)}</span>
              <span>{active.content.split("\n").length} lines</span>
            </div>
          )}
        </div>
      </div>
    </WindowFrame>
  );
}

type CodeTones = {
  explorer: string;
  explorerBorder: string;
  dim: string;
  faint: string;
  tabsBar: string;
  tabBorder: string;
  tabIdle: string;
  tabActive: string;
  tabClose: string;
  status: string;
  treeText: string;
  treeHover: string;
  treeActive: string;
  treeIcon: string;
};

const CODE_TONES: Record<CodeTheme, CodeTones> = {
  dark: {
    explorer: "border-white/[0.06] bg-zinc-900/50",
    explorerBorder: "border-white/[0.06]",
    dim: "text-zinc-500",
    faint: "text-zinc-600",
    tabsBar: "border-white/[0.06] bg-zinc-900/40",
    tabBorder: "border-white/[0.06]",
    tabIdle: "text-zinc-400 hover:bg-white/5",
    tabActive: "bg-zinc-950 text-zinc-100",
    tabClose: "text-zinc-600 hover:text-zinc-200",
    status: "border-white/[0.06] bg-zinc-900/50 text-zinc-500",
    treeText: "text-zinc-400",
    treeHover: "hover:bg-white/5",
    treeActive: "bg-indigo-500/15 text-indigo-100",
    treeIcon: "text-zinc-500",
  },
  light: {
    explorer: "border-zinc-200 bg-zinc-50",
    explorerBorder: "border-zinc-200",
    dim: "text-zinc-500",
    faint: "text-zinc-400",
    tabsBar: "border-zinc-200 bg-zinc-100/70",
    tabBorder: "border-zinc-200",
    tabIdle: "text-zinc-500 hover:bg-zinc-100",
    tabActive: "bg-white text-zinc-900",
    tabClose: "text-zinc-400 hover:text-zinc-700",
    status: "border-zinc-200 bg-zinc-50 text-zinc-500",
    treeText: "text-zinc-600",
    treeHover: "hover:bg-zinc-100",
    treeActive: "bg-indigo-50 text-indigo-700",
    treeIcon: "text-zinc-400",
  },
};

function FileTree({
  nodes,
  prefix,
  activePath,
  tone,
  onOpen,
  depth = 0,
}: {
  nodes: FsNode[];
  prefix: string;
  activePath: string | null;
  tone: CodeTheme;
  onOpen: (path: string, name: string) => void;
  depth?: number;
}) {
  const sorted = useMemo(
    () => [
      ...nodes.filter((node) => node.isDir).sort((a, b) => a.name.localeCompare(b.name)),
      ...nodes.filter((node) => !node.isDir).sort((a, b) => a.name.localeCompare(b.name)),
    ],
    [nodes],
  );
  return (
    <>
      {sorted.map((node) => (
        <TreeNode
          key={`${prefix}/${node.name}`}
          node={node}
          prefix={prefix}
          activePath={activePath}
          tone={tone}
          onOpen={onOpen}
          depth={depth}
        />
      ))}
    </>
  );
}

function TreeNode({
  node,
  prefix,
  activePath,
  tone,
  onOpen,
  depth,
}: {
  node: FsNode;
  prefix: string;
  activePath: string | null;
  tone: CodeTheme;
  onOpen: (path: string, name: string) => void;
  depth: number;
}) {
  const path = `${prefix}/${node.name}`;
  const [expanded, setExpanded] = useState(depth < 1);
  const isActive = activePath === path;
  const c = CODE_TONES[tone];

  if (node.isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={cn("flex w-full items-center gap-1 py-1 pr-2 text-left text-[12px]", c.treeText, c.treeHover)}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", c.treeIcon, expanded && "rotate-90")} />
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-indigo-400/80" />
          ) : (
            <FolderClosed className="h-3.5 w-3.5 shrink-0 text-indigo-400/80" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children.length > 0 && (
          <FileTree nodes={node.children} prefix={path} activePath={activePath} tone={tone} onOpen={onOpen} depth={depth + 1} />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(path, node.name)}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 pr-2 text-left text-[12px]",
        isActive ? c.treeActive : cn(c.treeText, c.treeHover),
      )}
      style={{ paddingLeft: 8 + depth * 12 + 14 }}
    >
      <FileCode2 className={cn("h-3.5 w-3.5 shrink-0", c.treeIcon)} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function CodeEditor({ content, name, theme }: { content: string; name: string; theme: CodeTheme }) {
  const dark = theme === "dark";
  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighter
        language={prismLanguage(name)}
        style={dark ? oneDark : oneLight}
        showLineNumbers
        wrapLongLines={false}
        customStyle={{
          margin: 0,
          padding: "12px 16px",
          background: "transparent",
          fontSize: 12,
          lineHeight: "20px",
          minHeight: "100%",
        }}
        lineNumberStyle={{
          minWidth: "2.5em",
          paddingRight: "1em",
          opacity: dark ? 0.35 : 0.4,
          userSelect: "none",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono, ui-monospace, monospace)" } }}
      >
        {content || " "}
      </SyntaxHighlighter>
    </div>
  );
}

/* ─── Files window (Finder) ──────────────────────────────────────────────── */

function FilesWindow({
  computer,
  mode,
  tokens,
  onOpenFile,
}: {
  computer: AgentComputer;
  mode: ComputerMode;
  tokens: ComputerTokens;
  onOpenFile: (path: string) => void;
}) {
  const tree = useMemo(() => parseSnapshot(computer.workspaceSnapshot ?? ""), [computer.workspaceSnapshot]);
  const [path, setPath] = useState<string[]>([]);
  const nodes = useMemo(() => currentNodes(tree, path), [tree, path]);
  const light = mode === "light";

  return (
    <WindowFrame
      tone={mode}
      icon={<FolderClosed className={cn("h-3 w-3", tokens.textDim)} />}
      title={path.length ? path[path.length - 1] : "Workspace"}
      className="h-full"
      bodyClassName={light ? "bg-white" : "bg-zinc-900/60"}
      toolbar={
        <div className={cn("flex items-center gap-2 border-b px-2 py-1.5", tokens.toolbar)}>
          <button
            type="button"
            disabled={path.length === 0}
            onClick={() => setPath(path.slice(0, -1))}
            className={cn("flex h-6 w-6 items-center justify-center rounded disabled:opacity-30", tokens.iconBtn)}
            title="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className={cn("flex min-w-0 items-center gap-1 font-mono text-[11px]", tokens.textDim)}>
            <button type="button" className={cn("hover:underline", tokens.text)} onClick={() => setPath([])}>
              workspace
            </button>
            {path.map((segment, index) => (
              <span key={index} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 opacity-60" />
                <button
                  type="button"
                  className={cn("truncate hover:underline", tokens.text)}
                  onClick={() => setPath(path.slice(0, index + 1))}
                >
                  {segment}
                </button>
              </span>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex h-full min-h-0">
        <div className={cn("hidden w-40 shrink-0 flex-col gap-1 border-r p-2 sm:flex", tokens.mutedPanel)}>
          <p className={cn("px-2 py-1 text-[9px] font-semibold uppercase tracking-wide", tokens.textDim)}>Favorites</p>
          <button
            type="button"
            onClick={() => setPath([])}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
              path.length === 0 ? tokens.chipActive : cn(tokens.text, light ? "hover:bg-zinc-100" : "hover:bg-white/5"),
            )}
          >
            <HardDrive className="h-3.5 w-3.5 text-indigo-400/80" />
            Workspace
          </button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {nodes.length === 0 ? (
            <div className={cn("flex h-56 items-center justify-center px-6 text-center text-sm", tokens.textDim)}>
              {computer.workspaceSnapshot ? "This folder is empty" : "Workspace appears once the computer starts working."}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(94px,1fr))] gap-1 p-4">
              {nodes.map((node) => {
                const fullPath = "/" + [...path, node.name].join("/");
                return (
                  <button
                    key={node.name}
                    type="button"
                    onClick={() => (node.isDir ? setPath([...path, node.name]) : onOpenFile(fullPath))}
                    className={cn(
                      "group flex flex-col items-center gap-1 rounded-lg border border-transparent px-2 py-2.5 text-center",
                      light ? "hover:border-zinc-200 hover:bg-white/70" : "hover:border-white/10 hover:bg-white/[0.04]",
                    )}
                    title={node.name}
                  >
                    <span className="flex h-12 items-center justify-center">
                      {node.isDir ? (
                        <MacFolderIcon className="h-11 w-auto" />
                      ) : (
                        <MacFileIcon name={node.name} className="h-12 w-auto" />
                      )}
                    </span>
                    <span className={cn("line-clamp-2 max-w-full break-all text-[11px] leading-tight", tokens.text)}>
                      {node.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </WindowFrame>
  );
}

/* ─── Terminal window ─────────────────────────────────────────────────────── */

function TerminalWindow({
  agentId,
  computer,
  eventsKey,
  autoRefresh,
  onRefresh,
}: {
  agentId: string;
  computer: AgentComputer;
  eventsKey: string;
  autoRefresh?: boolean;
  onRefresh: () => void;
}) {
  const [command, setCommand] = useState("");
  const [events, setEvents] = useState<ComputerEvent[]>([]);
  const [running, setRunning] = useState(false);

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/computer/events?limit=80`, {
      cache: "no-store",
    });
    const payload = await res.json().catch(() => null);
    if (res.ok) setEvents(payload?.data ?? []);
  }, [agentId, computer.computerId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, eventsKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadEvents, 2500);
    return () => clearInterval(interval);
  }, [autoRefresh, loadEvents]);

  const run = async () => {
    if (!command.trim()) return;
    setRunning(true);
    try {
      await fetch(`/api/agents/${agentId}/computer/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeoutSeconds: 120 }),
      });
      setCommand("");
      await loadEvents();
      onRefresh();
    } finally {
      setRunning(false);
    }
  };

  const shellEvents = events.filter(
    (event) =>
      event.eventType.includes("terminal") ||
      event.eventType.includes("browser") ||
      event.eventType.includes("computer"),
  );

  return (
    <WindowFrame
      icon={<SquareTerminal className="h-3 w-3 text-zinc-400" />}
      title={`agent@${slugify(computer.name)} — zsh`}
      className="h-full"
      bodyClassName="bg-zinc-950/95"
    >
      <div className="flex h-full min-h-0 flex-col font-mono text-[12px] leading-5">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {computer.terminal?.lastCommand && (
              <TerminalBlock title={`$ ${computer.terminal.lastCommand}`} body={computer.terminal.lastOutput ?? ""} />
            )}
            {shellEvents.map((event) => (
              <TerminalBlock
                key={event.eventId}
                title={`${formatTime(event.createdAt)}  ${event.eventType}${event.summary ? ` · ${event.summary}` : ""}`}
                body={event.payload?.response ?? event.payload?.error ?? event.payload?.instruction ?? ""}
              />
            ))}
            {shellEvents.length === 0 && !computer.terminal?.lastCommand && (
              <p className="px-1 py-8 text-center text-zinc-600">Terminal activity will appear here.</p>
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center gap-2 border-t border-white/[0.07] bg-black/40 px-3 py-2">
          <span className="text-emerald-400">❯</span>
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") run();
            }}
            placeholder="Type a command…"
            className="h-6 min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-white/10 hover:text-zinc-200 disabled:opacity-40"
          >
            {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <CornerDownLeft className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </WindowFrame>
  );
}

function TerminalBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-zinc-500">{title}</div>
      {body && <pre className="mt-0.5 whitespace-pre-wrap break-words text-zinc-300">{body}</pre>}
    </div>
  );
}

/* ─── Computer overview ───────────────────────────────────────────────────── */

function ComputerOverview({
  computer,
  config,
  loading,
  powerAction,
  tokens,
  onAction,
  onConfigure,
}: {
  computer: AgentComputer | null;
  config: AgentComputerConfig | null;
  loading: boolean;
  powerAction: ComputerPowerAction | null;
  tokens: ComputerTokens;
  onAction: (action: ComputerPowerAction) => void;
  onConfigure: () => void;
}) {
  const active = isActiveComputer(computer);
  const profile = profileFor(config?.resourceProfile ?? "standard");

  return (
    <div className={cn("flex h-full min-h-0 flex-col", tokens.viewBg)}>
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", tokens.border)}>
        <div>
          <h3 className={cn("flex items-center gap-2 text-sm font-medium", tokens.text)}>
            <Cpu className={cn("h-4 w-4", tokens.textDim)} />
            Agent computer
          </h3>
          <p className={cn("mt-0.5 text-xs", tokens.textDim)}>
            One persistent workspace for every chat with this agent
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onConfigure}>
          <Settings2 className="h-3.5 w-3.5" />
          Configure
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto grid max-w-2xl gap-4 p-5">
          {loading && !config ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className={cn("h-5 w-5 animate-spin", tokens.textDim)} />
            </div>
          ) : (
            <>
              <div className={cn("rounded-xl border p-4", tokens.card)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tokens.mutedPanel)}>
                      <HardDrive className={cn("h-5 w-5", tokens.textDim)} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn("truncate text-sm font-medium", tokens.text)}>
                          {computer?.name ?? "Persistent cloud computer"}
                        </p>
                        <StatusDot status={computer?.status} active={active} />
                      </div>
                      <p className={cn("mt-1 text-xs", tokens.textDim)}>
                        {config?.enabled
                          ? computer
                            ? `${humanStatus(computer.status)} · updated ${formatTime(computer.updatedAt)}`
                            : "Enabled · not provisioned yet"
                          : "Not enabled for this agent"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5"
                        disabled={Boolean(powerAction)}
                        onClick={() => onAction("sleep")}
                      >
                        {powerAction === "sleep" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Moon className="h-3.5 w-3.5" />}
                        Sleep
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={!config?.enabled || Boolean(powerAction)}
                        onClick={() => onAction("wake")}
                      >
                        {powerAction === "wake" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        Wake
                      </Button>
                    )}
                    {computer && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5"
                        disabled={!config?.enabled || Boolean(powerAction)}
                        onClick={() => onAction("restart")}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", powerAction === "restart" && "animate-spin")} />
                        Restart
                      </Button>
                    )}
                  </div>
                </div>
                {computer?.errorMessage && (
                  <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                    {computer.errorMessage}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <OverviewStat label="Performance" value={profile.label} detail={config?.resourceMode === "fixed" ? "Fixed allocation" : "Elastic scaling"} tokens={tokens} />
                <OverviewStat label="Compute ceiling" value={`${config?.cpuLimit ?? profile.cpu} vCPU`} detail={config?.memoryLimit ?? profile.memory} tokens={tokens} />
                <OverviewStat label="Persistent storage" value={config?.storageLimit ?? profile.storage} detail={config?.region || computer?.region || "Automatic region"} tokens={tokens} />
              </div>
              <p className={cn("px-1 text-xs leading-relaxed", tokens.textDim)}>
                Sleeping pauses compute charges while keeping the workspace. Waking always returns this same computer and its files.
              </p>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function OverviewStat({
  label,
  value,
  detail,
  tokens,
}: {
  label: string;
  value: string;
  detail: string;
  tokens: ComputerTokens;
}) {
  return (
    <div className={cn("rounded-xl border p-3", tokens.card)}>
      <p className={cn("text-[10px] font-medium uppercase tracking-wide", tokens.textDim)}>{label}</p>
      <p className={cn("mt-1.5 text-sm font-medium", tokens.text)}>{value}</p>
      <p className={cn("mt-0.5 text-xs", tokens.textDim)}>{detail}</p>
    </div>
  );
}

/* ─── Config view (tabbed) ───────────────────────────────────────────────── */

const CONFIG_TABS = ["Appearance", "Access", "Performance"] as const;
type ConfigTab = (typeof CONFIG_TABS)[number];

const RESOURCE_PROFILES: Array<{
  id: ComputerResourceProfile;
  label: string;
  detail: string;
  cpu: string;
  memory: string;
  storage: string;
  gpu?: string;
}> = [
  { id: "starter", label: "Starter", detail: "Light browsing and scripts", cpu: "1", memory: "2Gi", storage: "10Gi" },
  { id: "standard", label: "Standard", detail: "Everyday agent work", cpu: "2", memory: "4Gi", storage: "20Gi" },
  { id: "performance", label: "Performance", detail: "Builds and heavier workloads", cpu: "4", memory: "8Gi", storage: "50Gi" },
  { id: "gpu", label: "GPU", detail: "Accelerated model and media work", cpu: "8", memory: "32Gi", storage: "100Gi", gpu: "1 GPU" },
];

function ConfigView({
  draft,
  saving,
  tokens,
  appearanceId,
  codeTheme,
  onSetAppearance,
  onSetCodeTheme,
  onChange,
  onSave,
}: {
  draft: AgentComputerConfig | null;
  saving: boolean;
  tokens: ComputerTokens;
  appearanceId: AppearanceId;
  codeTheme: CodeTheme;
  onSetAppearance: (id: AppearanceId) => void;
  onSetCodeTheme: (theme: CodeTheme) => void;
  onChange: (config: AgentComputerConfig) => void;
  onSave: () => void;
}) {
  const [tab, setTab] = useState<ConfigTab>("Appearance");
  return (
    <div className={cn("flex h-full min-h-0 flex-col", tokens.viewBg)}>
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", tokens.border)}>
        <div className={cn("flex items-center gap-1 rounded-lg p-0.5", tokens.switcherTrack)}>
          {CONFIG_TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn(
                "rounded-md px-3 py-1 text-xs transition-colors",
                tab === item ? tokens.switcherActive : tokens.switcherIdle,
              )}
            >
              {item}
            </button>
          ))}
        </div>
        {tab !== "Appearance" && (
          <Button size="sm" className="h-8 gap-1.5" onClick={onSave} disabled={saving || !draft}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-lg space-y-5 p-5">
          {tab === "Appearance" && (
            <AppearancePanel
              tokens={tokens}
              appearanceId={appearanceId}
              codeTheme={codeTheme}
              onSetAppearance={onSetAppearance}
              onSetCodeTheme={onSetCodeTheme}
            />
          )}

          {!draft && tab !== "Appearance" && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className={cn("h-5 w-5 animate-spin", tokens.textDim)} />
            </div>
          )}

          {draft && tab === "Access" && (
            <>
              <ToggleRow
                label="Computer access"
                detail="Give this agent one persistent CommonOS computer."
                checked={draft.enabled}
                onChange={(enabled) => onChange({ ...draft, enabled })}
              />
              <ToggleRow
                label="Agent can wake its computer"
                detail="Let the agent wake the same computer when a task needs it."
                checked={draft.allowAgentStart}
                onChange={(allowAgentStart) => onChange({ ...draft, allowAgentStart })}
              />
              <ToggleRow
                label="User-selectable"
                detail="Show this persistent computer in the chat composer."
                checked={draft.allowUserSelect}
                onChange={(allowUserSelect) => onChange({ ...draft, allowUserSelect })}
              />
              <ToggleRow
                label="Browser"
                detail="Allow the agent to drive a headless browser."
                checked={draft.allowBrowser}
                onChange={(allowBrowser) => onChange({ ...draft, allowBrowser })}
              />
              <ToggleRow
                label="Terminal"
                detail="Allow the agent to run shell commands."
                checked={draft.allowTerminal}
                onChange={(allowTerminal) => onChange({ ...draft, allowTerminal })}
              />
              <ToggleRow
                label="Filesystem"
                detail="Allow the agent to read and write its persistent workspace."
                checked={draft.allowFilesystem}
                onChange={(allowFilesystem) => onChange({ ...draft, allowFilesystem })}
              />
              <div className="space-y-2 pt-1">
                <div>
                  <p className={cn("text-sm font-medium", tokens.text)}>Network access</p>
                  <p className={cn("mt-0.5 text-xs", tokens.textDim)}>Control outbound access from this computer.</p>
                </div>
                <SegmentedOptions
                  value={networkOption(draft.networkAccess)}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "restricted", label: "Restricted" },
                    { value: "disabled", label: "Off" },
                  ]}
                  tokens={tokens}
                  onChange={(networkAccess) => onChange({ ...draft, networkAccess })}
                />
              </div>
            </>
          )}

          {draft && tab === "Performance" && (
            <>
              <div className="space-y-2">
                <div>
                  <p className={cn("text-sm font-medium", tokens.text)}>Performance profile</p>
                  <p className={cn("mt-0.5 text-xs", tokens.textDim)}>Choose the maximum resources this computer can use.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {RESOURCE_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => onChange({ ...draft, resourceProfile: profile.id })}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        draft.resourceProfile === profile.id ? tokens.cardActive : tokens.card,
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-medium", tokens.text)}>{profile.label}</span>
                        {draft.resourceProfile === profile.id && <Check className="h-3.5 w-3.5 text-indigo-500" />}
                      </span>
                      <span className={cn("mt-1 block text-xs", tokens.textDim)}>{profile.detail}</span>
                      <span className={cn("mt-2 block font-mono text-[10px]", tokens.textDim)}>
                        {profile.cpu} vCPU · {profile.memory} · {profile.storage}{profile.gpu ? ` · ${profile.gpu}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <p className={cn("text-sm font-medium", tokens.text)}>Resource behavior</p>
                  <p className={cn("mt-0.5 text-xs", tokens.textDim)}>Elastic starts small and boosts automatically when work gets heavier.</p>
                </div>
                <SegmentedOptions
                  value={draft.resourceMode}
                  options={[
                    { value: "elastic", label: "Elastic" },
                    { value: "fixed", label: "Fixed" },
                  ]}
                  tokens={tokens}
                  onChange={(resourceMode) => onChange({ ...draft, resourceMode })}
                />
                <ResourcePreview config={draft} tokens={tokens} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Sleep after idle (minutes)"
                  value={draft.idleTtlMinutes}
                  onChange={(idleTtlMinutes) => onChange({ ...draft, idleTtlMinutes })}
                />
                <div className="grid gap-1.5">
                  <ConfigLabel>Region</ConfigLabel>
                  <ConfigInput value={draft.region ?? ""} onChange={(region) => onChange({ ...draft, region })} placeholder="Automatic" />
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SegmentedOptions<T extends string>({
  value,
  options,
  tokens,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  tokens: ComputerTokens;
  onChange: (value: T) => void;
}) {
  return (
    <div className={cn("flex items-center gap-1 rounded-lg p-0.5", tokens.switcherTrack)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs transition-colors",
            value === option.value ? tokens.switcherActive : tokens.switcherIdle,
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ResourcePreview({ config, tokens }: { config: AgentComputerConfig; tokens: ComputerTokens }) {
  const profile = profileFor(config.resourceProfile);
  const elastic = config.resourceMode !== "fixed";
  const requestCpu = config.cpuRequest || "Automatic";
  const requestMemory = config.memoryRequest || "Automatic";
  const limitCpu = config.cpuLimit || profile.cpu;
  const limitMemory = config.memoryLimit || profile.memory;
  const storage = config.storageLimit || profile.storage;
  const gpu = Number(config.gpuCount || 0) > 0
    ? `${config.gpuCount} ${config.gpuType || "GPU"}`
    : profile.gpu || "No GPU";

  return (
    <div className={cn("grid gap-2 rounded-xl border p-3 sm:grid-cols-2", tokens.card)}>
      <div>
        <p className={cn("text-[10px] font-medium uppercase tracking-wide", tokens.textDim)}>
          {elastic ? "Starts at" : "Allocation"}
        </p>
        <p className={cn("mt-1 text-xs font-medium", tokens.text)}>
          {elastic ? `${requestCpu} vCPU · ${requestMemory}` : `${limitCpu} vCPU · ${limitMemory}`}
        </p>
      </div>
      <div>
        <p className={cn("text-[10px] font-medium uppercase tracking-wide", tokens.textDim)}>
          {elastic ? "Elastic ceiling" : "Workspace"}
        </p>
        <p className={cn("mt-1 text-xs font-medium", tokens.text)}>
          {elastic ? `${limitCpu} vCPU · ${limitMemory}` : `${storage} storage`}
        </p>
      </div>
      <div className={cn("border-t pt-2 text-xs sm:col-span-2", tokens.border, tokens.textDim)}>
        {storage} persistent storage · {gpu}
      </div>
    </div>
  );
}

function AppearancePanel({
  tokens,
  appearanceId,
  codeTheme,
  onSetAppearance,
  onSetCodeTheme,
}: {
  tokens: ComputerTokens;
  appearanceId: AppearanceId;
  codeTheme: CodeTheme;
  onSetAppearance: (id: AppearanceId) => void;
  onSetCodeTheme: (theme: CodeTheme) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className={cn("text-sm font-medium", tokens.text)}>Desktop appearance</p>
        <p className={cn("text-xs", tokens.textDim)}>The computer keeps its own look, separate from the app theme.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {APPEARANCES.map((appearance) => (
            <button
              key={appearance.id}
              type="button"
              onClick={() => onSetAppearance(appearance.id)}
              className={cn(
                "group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors",
                appearanceId === appearance.id ? tokens.cardActive : tokens.card,
              )}
            >
              <span
                className="h-12 w-full rounded-md ring-1 ring-black/5"
                style={{ background: appearance.swatch }}
              />
              <span className={cn("flex items-center gap-1 text-[11px] font-medium", tokens.text)}>
                {appearanceId === appearance.id && <Check className="h-3 w-3 text-indigo-500" />}
                {appearance.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className={cn("text-sm font-medium", tokens.text)}>Code editor</p>
        <p className={cn("text-xs", tokens.textDim)}>Syntax highlighting theme for the editor.</p>
        <div className={cn("flex items-center gap-1 rounded-lg p-0.5", tokens.switcherTrack)}>
          {(["dark", "light"] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => onSetCodeTheme(theme)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs capitalize transition-colors",
                codeTheme === theme ? tokens.switcherActive : tokens.switcherIdle,
              )}
            >
              {theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
              {theme}
            </button>
          ))}
        </div>
        <p className={cn("text-[11px]", tokens.textDim)}>The terminal always uses a dark theme.</p>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const { tokens } = useComputerTheme();
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5", tokens.toggleRow)}>
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", tokens.text)}>{label}</p>
        <p className={cn("mt-0.5 text-xs", tokens.textDim)}>{detail}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ConfigLabel({ children }: { children: ReactNode }) {
  const { tokens } = useComputerTheme();
  return <Label className={cn("text-xs", tokens.textDim)}>{children}</Label>;
}

function ConfigInput({
  value,
  onChange,
  placeholder,
  type,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const { tokens } = useComputerTheme();
  return (
    <Input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn("h-9", tokens.input)}
    />
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <ConfigLabel>{label}</ConfigLabel>
      <ConfigInput type="number" value={value} onChange={(next) => onChange(Number(next) || 1)} />
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function profileFor(profile: ComputerResourceProfile) {
  return RESOURCE_PROFILES.find((item) => item.id === profile) ?? RESOURCE_PROFILES[0];
}

function networkOption(value?: string): "standard" | "restricted" | "disabled" {
  if (value === "restricted" || value === "disabled") return value;
  return "standard";
}

function humanStatus(status?: string) {
  if (!status) return "not provisioned";
  if (status === "idle") return "running";
  if (status === "stopped") return "sleeping";
  return status.replaceAll("_", " ");
}

function unwrapComputer(payload: any): AgentComputer | null {
  const data = payload?.data;
  const computer = data?.computer ?? data;
  return computer && typeof computer === "object" && typeof computer.computerId === "string"
    ? (computer as AgentComputer)
    : null;
}

function errorMessage(payload: any, fallback: string) {
  const message = payload?.error?.message ?? payload?.error ?? payload?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function normalizeComputerConfig(value: any): AgentComputerConfig {
  const profile: ComputerResourceProfile = ["starter", "standard", "performance", "gpu"].includes(
    value?.resourceProfile,
  )
    ? value.resourceProfile
    : "standard";
  const resourceMode: ComputerResourceMode = value?.resourceMode === "fixed" ? "fixed" : "elastic";
  return {
    ...(value ?? {}),
    enabled: Boolean(value?.enabled),
    allowAgentStart: value?.allowAgentStart !== false,
    allowUserSelect: value?.allowUserSelect !== false,
    allowBrowser: value?.allowBrowser !== false,
    allowTerminal: value?.allowTerminal !== false,
    allowFilesystem: value?.allowFilesystem !== false,
    networkAccess: value?.networkAccess || "standard",
    resourceProfile: profile,
    resourceMode,
    idleTtlMinutes: Math.max(1, Number(value?.idleTtlMinutes) || 60),
  };
}

function computerConfigPatch(config: AgentComputerConfig) {
  return {
    enabled: config.enabled,
    allowAgentStart: config.allowAgentStart,
    allowUserSelect: config.allowUserSelect,
    allowBrowser: config.allowBrowser,
    allowTerminal: config.allowTerminal,
    allowFilesystem: config.allowFilesystem,
    networkAccess: config.networkAccess,
    resourceProfile: config.resourceProfile,
    resourceMode: config.resourceMode,
    cpuRequest: config.cpuRequest,
    cpuLimit: config.cpuLimit,
    memoryRequest: config.memoryRequest,
    memoryLimit: config.memoryLimit,
    storageLimit: config.storageLimit,
    gpuType: config.gpuType,
    gpuCount: config.gpuCount,
    idleTtlMinutes: config.idleTtlMinutes,
    region: config.region,
  };
}

function browserStatusClass(status?: string) {
  if (status === "on") return "bg-emerald-400";
  if (status === "starting") return "bg-amber-400";
  if (status === "error") return "bg-red-400";
  return "bg-zinc-600";
}

function hostOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "commonos";
}

function languageOf(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? ext ?? "text";
}

/** Map a filename to a Prism language id for syntax highlighting. */
function prismLanguage(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cs: "csharp",
    php: "php",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    css: "css",
    scss: "scss",
    html: "markup",
    xml: "markup",
    svg: "markup",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    sql: "sql",
    dockerfile: "docker",
  };
  return map[ext] ?? "text";
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
