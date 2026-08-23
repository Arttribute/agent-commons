"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AppWindow, ExternalLink, GripHorizontal, X } from "lucide-react";
import Link from "next/link";
import {
  subscribeToUiPluginChanges,
  type UiPluginsChangedDetail,
} from "@/lib/ui-plugin-events";
import { PluginFrame } from "./plugin-frame";
import { isUiPlugin, type UiPlugin, type UiPluginSurface } from "./types";

const WIDGET_MARGIN = 12;
const WIDGET_DOCK_CLEARANCE = 72;
const WIDGET_HEADER_HEIGHT = 44;
const WIDGET_POSITION_KEY = "commons-ui-widget-position";

type WidgetPosition = { x: number; y: number };
type WidgetSize = { width: number; height: number };

export function PluginWidgetHost() {
  const pathname = usePathname();
  const dock = useRef<HTMLDivElement>(null);
  const [plugins, setPlugins] = useState<UiPlugin[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dockClearance, setDockClearance] = useState(WIDGET_DOCK_CLEARANCE);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const response = await fetch("/api/ui-plugins?active=true", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({ data: [] }));
      if (sequence !== refreshSequence.current) return;
      setPlugins(
        Array.isArray(payload.data) ? payload.data.filter(isUiPlugin) : [],
      );
    } catch {
      // Keep the last known registry during transient network failures.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToUiPluginChanges(
      (detail: UiPluginsChangedDetail) => {
        if (detail.pluginId && detail.status !== "active") {
          setPlugins((items) =>
            items.filter((item) => item.pluginId !== detail.pluginId),
          );
        } else if (
          detail.plugin &&
          detail.status === "active" &&
          isUiPlugin(detail.plugin)
        ) {
          setPlugins((items) => [
            detail.plugin as UiPlugin,
            ...items.filter(
              (item) => item.pluginId !== detail.plugin?.pluginId,
            ),
          ]);
        }
        void refresh();
      },
    );
    const onFocus = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 30_000);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      refreshSequence.current += 1;
      window.clearInterval(interval);
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const currentAppSlug = getCurrentAppSlug(pathname);
  const widgets = useMemo(
    () =>
      plugins.filter(
        (plugin) =>
          plugin.slug !== currentAppSlug &&
          plugin.manifest.surfaces.some((surface) => surface.type === "widget"),
      ),
    [currentAppSlug, plugins],
  );
  const openPlugin = widgets.find((plugin) => plugin.pluginId === openId);
  const surface = openPlugin?.manifest.surfaces.find(
    (candidate) => candidate.type === "widget",
  );

  useEffect(() => {
    if (openId && !widgets.some((plugin) => plugin.pluginId === openId)) {
      setOpenId(null);
    }
  }, [openId, widgets]);

  useEffect(() => {
    const element = dock.current;
    if (!element) {
      setDockClearance(WIDGET_DOCK_CLEARANCE);
      return;
    }
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setDockClearance(
        Math.max(
          WIDGET_DOCK_CLEARANCE,
          Math.ceil(window.innerHeight - bounds.top + WIDGET_MARGIN),
        ),
      );
    };
    const animationFrame = window.requestAnimationFrame(measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [widgets.length]);

  if (!widgets.length) return null;
  return (
    <>
      {openPlugin && surface && (
        <PluginWidgetPanel
          key={`${openPlugin.pluginId}:${openPlugin.updatedAt}`}
          plugin={openPlugin}
          surface={surface}
          dockClearance={dockClearance}
          onClose={() => setOpenId(null)}
        />
      )}
      <div
        ref={dock}
        className="fixed bottom-5 left-5 z-40 flex max-w-[calc(100vw-2.5rem)] flex-wrap gap-2"
      >
        {widgets.map((plugin) => (
          <button
            key={plugin.pluginId}
            type="button"
            onClick={() =>
              setOpenId(openId === plugin.pluginId ? null : plugin.pluginId)
            }
            className="flex h-10 max-w-52 items-center gap-2 rounded-full border bg-background px-3 text-sm shadow-lg transition hover:bg-muted"
            title={plugin.name}
            aria-pressed={openId === plugin.pluginId}
          >
            <AppWindow className="h-4 w-4 shrink-0" />
            <span className="truncate">{plugin.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function PluginWidgetPanel({
  plugin,
  surface,
  dockClearance,
  onClose,
}: {
  plugin: UiPlugin;
  surface: UiPluginSurface;
  dockClearance: number;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const positionRef = useRef<WidgetPosition | null>(null);
  const drag = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    origin: WidgetPosition;
  } | null>(null);
  const [position, setPosition] = useState<WidgetPosition | null>(null);
  const [size, setSize] = useState<WidgetSize>({
    width: surface.width ?? 380,
    height: surface.height ?? 480,
  });
  const [dragging, setDragging] = useState(false);
  const hasPageSurface = plugin.manifest.surfaces.some(
    (candidate) => candidate.type === "page",
  );

  useEffect(() => {
    setSize({
      width: surface.width ?? 380,
      height: surface.height ?? 480,
    });
  }, [surface.height, surface.width]);

  const updatePosition = useCallback(
    (next: WidgetPosition, persist = false) => {
      const clamped = clampWidgetPosition(next, panel.current, dockClearance);
      positionRef.current = clamped;
      setPosition(clamped);
      if (persist) saveWidgetPosition(plugin.pluginId, clamped);
    },
    [dockClearance, plugin.pluginId],
  );

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const bounds = panel.current?.getBoundingClientRect();
      const saved = readWidgetPosition(plugin.pluginId);
      updatePosition(
        saved ?? {
          x: WIDGET_MARGIN,
          y: Math.max(
            WIDGET_MARGIN,
            window.innerHeight -
              (bounds?.height ?? surface.height ?? 480) -
              dockClearance,
          ),
        },
      );
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    dockClearance,
    plugin.pluginId,
    surface.height,
    surface.width,
    updatePosition,
  ]);

  useEffect(() => {
    const onResize = () => {
      if (positionRef.current) updatePosition(positionRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [updatePosition]);

  const resizeWidget = useCallback(
    (requested: WidgetSize) => {
      const availableWidth = Math.max(0, window.innerWidth - WIDGET_MARGIN * 2);
      const availableHeight = Math.max(
        0,
        window.innerHeight -
          dockClearance -
          WIDGET_MARGIN -
          WIDGET_HEADER_HEIGHT,
      );
      const next = {
        width: Math.min(requested.width, availableWidth),
        height: Math.min(requested.height, availableHeight),
      };
      setSize(next);
      window.requestAnimationFrame(() => {
        if (positionRef.current) updatePosition(positionRef.current);
      });
      return next;
    },
    [dockClearance, updatePosition],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) return;
    drag.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      origin: { x: bounds.left, y: bounds.top },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    updatePosition({
      x: activeDrag.origin.x + event.clientX - activeDrag.pointerX,
      y: activeDrag.origin.y + event.clientY - activeDrag.pointerY,
    });
  };

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
    if (positionRef.current) {
      saveWidgetPosition(plugin.pluginId, positionRef.current);
    }
  };

  const onLostPointerCapture = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (positionRef.current) {
      saveWidgetPosition(plugin.pluginId, positionRef.current);
    }
  };

  const onMoveKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, WidgetPosition> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const bounds = panel.current?.getBoundingClientRect();
    if (!bounds) return;
    const step = event.shiftKey ? 40 : 10;
    updatePosition(
      {
        x: (positionRef.current?.x ?? bounds.left) + delta.x * step,
        y: (positionRef.current?.y ?? bounds.top) + delta.y * step,
      },
      true,
    );
  };

  return (
    <section
      ref={panel}
      className="fixed z-[41] flex flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
      style={{
        width: size.width,
        height: size.height + WIDGET_HEADER_HEIGHT,
        maxWidth: `calc(100vw - ${WIDGET_MARGIN * 2}px)`,
        maxHeight: `calc(100dvh - ${dockClearance + WIDGET_MARGIN}px)`,
        ...(position
          ? { left: position.x, top: position.y }
          : { left: WIDGET_MARGIN, bottom: dockClearance }),
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b px-1.5">
        <div
          role="button"
          tabIndex={0}
          aria-label={`Move ${surface.title || plugin.name} widget`}
          title="Drag or use the arrow keys to move"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={onLostPointerCapture}
          onKeyDown={onMoveKeyDown}
          className={`flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-lg px-1.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <AppWindow className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {surface.title || plugin.name}
          </span>
        </div>
        {hasPageSurface && (
          <Link
            href={`/apps/${encodeURIComponent(plugin.slug)}`}
            aria-label="Open full page"
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
        <button
          type="button"
          aria-label="Close widget"
          className="rounded-md p-1.5 hover:bg-muted"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        <PluginFrame
          plugin={plugin}
          surface="widget"
          className="h-full w-full border-0"
          onResizeRequest={resizeWidget}
        />
      </div>
    </section>
  );
}

function clampWidgetPosition(
  position: WidgetPosition,
  element: HTMLElement | null,
  dockClearance: number,
) {
  const bounds = element?.getBoundingClientRect();
  const width = bounds?.width ?? 0;
  const height = bounds?.height ?? 0;
  return {
    x: clamp(
      position.x,
      WIDGET_MARGIN,
      Math.max(WIDGET_MARGIN, window.innerWidth - width - WIDGET_MARGIN),
    ),
    y: clamp(
      position.y,
      WIDGET_MARGIN,
      Math.max(WIDGET_MARGIN, window.innerHeight - height - dockClearance),
    ),
  };
}

function readWidgetPosition(pluginId: string): WidgetPosition | null {
  try {
    const value = window.localStorage.getItem(
      `${WIDGET_POSITION_KEY}:${pluginId}`,
    );
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<WidgetPosition>;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x as number, y: parsed.y as number };
  } catch {
    return null;
  }
}

function saveWidgetPosition(pluginId: string, position: WidgetPosition) {
  try {
    window.localStorage.setItem(
      `${WIDGET_POSITION_KEY}:${pluginId}`,
      JSON.stringify(position),
    );
  } catch {
    // Private browsing or storage policies may disable persistence.
  }
}

function getCurrentAppSlug(pathname: string) {
  const match = /^\/apps\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
