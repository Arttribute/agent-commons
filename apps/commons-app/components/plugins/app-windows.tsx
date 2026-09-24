"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCommonsAppsStore } from "@/lib/commons-apps-store";
import { AppIcon } from "./app-icon";
import { PluginFrame } from "./plugin-frame";
import type { PluginRpcResize } from "./plugin-rpc";
import { pluginHasSurface, type UiPlugin } from "./types";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";

const HEADER_HEIGHT = 40;
const MARGIN = 8;
const TOP_OFFSET = 64;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1000;
const GEOMETRY_KEY = "commons-app-window";

type Geometry = { x: number; y: number; width: number; height: number };

type Gesture = {
  kind: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  origin: Geometry;
};

/**
 * Floating windows for apps opened from the apps bar. Windows stay open while
 * the user works and across page changes, can be dragged by their title bar
 * and resized from the corner, and remember their geometry per app.
 */
export function CommonsAppWindows() {
  const { mode } = useWorkspaceMode();
  // Reads the shared store only; the apps bar loads apps, so pages without
  // one (such as signed-out pages) never fetch.
  const plugins = useCommonsAppsStore((state) => state.plugins);
  const loaded = useCommonsAppsStore((state) => state.loaded);
  const openWindows = useCommonsAppsStore((state) => state.openWindows);
  const windowStack = useCommonsAppsStore((state) => state.windowStack);
  const closeWindow = useCommonsAppsStore((state) => state.closeWindow);
  const focusWindow = useCommonsAppsStore((state) => state.focusWindow);

  useEffect(() => {
    const active = new Set(
      plugins
        .filter(
          (plugin) =>
            plugin.status === "active" && pluginHasSurface(plugin, "widget"),
        )
        .map((plugin) => plugin.pluginId),
    );
    if (!loaded) return;
    for (const pluginId of openWindows) {
      if (!active.has(pluginId)) closeWindow(pluginId);
    }
  }, [closeWindow, loaded, openWindows, plugins]);

  return (
    <>
      {openWindows.map((pluginId, index) => {
        const plugin = plugins.find(
          (candidate) =>
            candidate.pluginId === pluginId && candidate.status === "active",
        );
        if (!plugin) return null;
        if (mode === "private-local") {
          try {
            const url = new URL(plugin.entryUrl);
            if (!(["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol))) return null;
          } catch { return null; }
        }
        return (
          <AppWindow
            key={`${plugin.pluginId}:${plugin.updatedAt}`}
            plugin={plugin}
            zIndex={45 + Math.max(0, windowStack.indexOf(plugin.pluginId))}
            focused={windowStack[windowStack.length - 1] === plugin.pluginId}
            offset={index}
            onFocus={() => focusWindow(plugin.pluginId)}
            onClose={() => closeWindow(plugin.pluginId)}
          />
        );
      })}
    </>
  );
}

function AppWindow({
  plugin,
  zIndex,
  focused,
  offset,
  onFocus,
  onClose,
}: {
  plugin: UiPlugin;
  zIndex: number;
  focused: boolean;
  offset: number;
  onFocus: () => void;
  onClose: () => void;
}) {
  const surface = plugin.manifest.surfaces.find(
    (candidate) => candidate.type === "widget",
  );
  const [geometry, setGeometry] = useState<Geometry>(() =>
    initialGeometry(plugin, offset),
  );
  const geometryRef = useRef(geometry);
  const gesture = useRef<Gesture | null>(null);
  const [interacting, setInteracting] = useState(false);

  const apply = useCallback(
    (next: Geometry, persist = false) => {
      const clamped = clampGeometry(next);
      geometryRef.current = clamped;
      setGeometry(clamped);
      if (persist) saveGeometry(plugin.pluginId, clamped);
    },
    [plugin.pluginId],
  );

  useEffect(() => {
    const onResize = () => apply(geometryRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [apply]);

  const startGesture = (
    kind: Gesture["kind"],
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return;
    if (kind === "move" && (event.target as HTMLElement).closest("a,button")) {
      return;
    }
    onFocus();
    gesture.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: geometryRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setInteracting(true);
  };

  const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    apply(
      active.kind === "move"
        ? { ...active.origin, x: active.origin.x + dx, y: active.origin.y + dy }
        : {
            ...active.origin,
            width: active.origin.width + dx,
            height: active.origin.height + dy,
          },
    );
  };

  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInteracting(false);
    saveGeometry(plugin.pluginId, geometryRef.current);
  };

  const keyboardAdjust = (
    kind: Gesture["kind"],
    event: ReactKeyboardEvent<HTMLElement>,
  ) => {
    const step = event.shiftKey ? 40 : 10;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const change = delta[event.key];
    if (!change) return;
    event.preventDefault();
    const current = geometryRef.current;
    apply(
      kind === "move"
        ? { ...current, x: current.x + change[0], y: current.y + change[1] }
        : {
            ...current,
            width: current.width + change[0],
            height: current.height + change[1],
          },
      true,
    );
  };

  // Apps may ask to resize; the user's own size wins once they have set one.
  const onResizeRequest = useCallback(
    (requested: PluginRpcResize) => {
      if (readGeometry(plugin.pluginId)) {
        const current = geometryRef.current;
        return {
          width: current.width,
          height: current.height - HEADER_HEIGHT,
        };
      }
      const next = clampGeometry({
        ...geometryRef.current,
        width: requested.width,
        height: requested.height + HEADER_HEIGHT,
      });
      geometryRef.current = next;
      setGeometry(next);
      return { width: next.width, height: next.height - HEADER_HEIGHT };
    },
    [plugin.pluginId],
  );

  return (
    <section
      role="dialog"
      aria-label={plugin.name}
      onPointerDownCapture={onFocus}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className={cn(
        "fixed flex flex-col overflow-hidden rounded-xl border border-border bg-background",
        focused ? "shadow-floating" : "shadow-card",
      )}
      style={{
        zIndex,
        left: geometry.x,
        top: geometry.y,
        width: geometry.width,
        height: geometry.height,
      }}
    >
      <header
        onPointerDown={(event) => startGesture("move", event)}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        className={cn(
          "flex shrink-0 touch-none select-none items-center gap-2 border-b border-border pl-3 pr-1.5",
          interacting && gesture.current?.kind === "move"
            ? "cursor-grabbing"
            : "cursor-grab",
        )}
        style={{ height: HEADER_HEIGHT }}
      >
        <AppIcon plugin={plugin} size={16} />
        <span
          tabIndex={0}
          role="button"
          aria-label={`Move ${plugin.name}. Use arrow keys.`}
          onKeyDown={(event) => keyboardAdjust("move", event)}
          className="min-w-0 flex-1 truncate rounded text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {surface?.title || plugin.name}
        </span>
        {pluginHasSurface(plugin, "page") && (
          <Link
            href={`/apps/${encodeURIComponent(plugin.slug)}`}
            onClick={onClose}
            aria-label="Open full page"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
        <button
          type="button"
          aria-label={`Close ${plugin.name}`}
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1 bg-background">
        <PluginFrame
          plugin={plugin}
          surface="widget"
          className="h-full w-full border-0"
          onResizeRequest={onResizeRequest}
        />
        {/* The frame would swallow pointer events mid-gesture. */}
        {interacting && <div className="absolute inset-0" />}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={`Resize ${plugin.name}. Use arrow keys.`}
        onPointerDown={(event) => startGesture("resize", event)}
        onPointerMove={moveGesture}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onKeyDown={(event) => keyboardAdjust("resize", event)}
        className="absolute bottom-0 right-0 flex h-4 w-4 touch-none cursor-nwse-resize items-end justify-end p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          className="h-2 w-2 text-muted-foreground"
        >
          <path
            d="M7 1v6H1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      </div>
    </section>
  );
}

function initialGeometry(plugin: UiPlugin, offset: number): Geometry {
  const saved = readGeometry(plugin.pluginId);
  if (saved) return clampGeometry(saved);
  const surface = plugin.manifest.surfaces.find(
    (candidate) => candidate.type === "widget",
  );
  const width = surface?.width ?? 380;
  const height = (surface?.height ?? 480) + HEADER_HEIGHT;
  const viewportWidth =
    typeof window === "undefined" ? 1280 : window.innerWidth;
  return clampGeometry({
    x: viewportWidth - width - 24 - offset * 24,
    y: TOP_OFFSET + offset * 24,
    width,
    height,
  });
}

function clampGeometry(geometry: Geometry): Geometry {
  if (typeof window === "undefined") return geometry;
  const maxWidth = Math.max(
    MIN_WIDTH,
    Math.min(MAX_WIDTH, window.innerWidth - MARGIN * 2),
  );
  const maxHeight = Math.max(
    MIN_HEIGHT,
    Math.min(MAX_HEIGHT, window.innerHeight - MARGIN * 2),
  );
  const width = clamp(Math.round(geometry.width), MIN_WIDTH, maxWidth);
  const height = clamp(Math.round(geometry.height), MIN_HEIGHT, maxHeight);
  return {
    width,
    height,
    x: clamp(
      Math.round(geometry.x),
      MARGIN,
      Math.max(MARGIN, window.innerWidth - width - MARGIN),
    ),
    // Keep the title bar reachable so the window can always be moved back.
    y: clamp(
      Math.round(geometry.y),
      MARGIN,
      Math.max(MARGIN, window.innerHeight - HEADER_HEIGHT - MARGIN),
    ),
  };
}

function readGeometry(pluginId: string): Geometry | null {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(`${GEOMETRY_KEY}:${pluginId}`) ?? "null",
    );
    if (
      value &&
      [value.x, value.y, value.width, value.height].every(Number.isFinite)
    ) {
      return value;
    }
  } catch {
    // Unavailable storage falls back to the default placement.
  }
  return null;
}

function saveGeometry(pluginId: string, geometry: Geometry) {
  try {
    window.localStorage.setItem(
      `${GEOMETRY_KEY}:${pluginId}`,
      JSON.stringify(geometry),
    );
  } catch {
    // Geometry is a convenience; ignore storage failures.
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
