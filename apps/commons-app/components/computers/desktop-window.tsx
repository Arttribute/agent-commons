"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared desktop chrome for the agent computer surface. Keeps the full-size
 * computer panel visually consistent with the inline <MiniComputer /> — same
 * aurora wallpaper, same mac-style traffic lights and window framing — so the
 * two read as the same machine at two zoom levels.
 */

/** Aurora wallpaper — zinc base with indigo/violet glow, minimal modern-unix feel. */
export const WALLPAPER: CSSProperties = {
  background: [
    "radial-gradient(120% 90% at 12% 0%, rgba(99,102,241,0.30), transparent 46%)",
    "radial-gradient(110% 80% at 88% 12%, rgba(168,85,247,0.18), transparent 52%)",
    "radial-gradient(100% 100% at 50% 105%, rgba(56,189,248,0.14), transparent 58%)",
    "#09090b",
  ].join(", "),
};

type TrafficAction = {
  onClick?: () => void;
  title?: string;
  glyph?: ReactNode;
};

/**
 * The three mac window buttons. Decorative by default; pass per-light actions to
 * make them live (red = close, amber = minimise, green = zoom, by convention).
 */
export function TrafficLights({
  className,
  close,
  minimize,
  zoom,
}: {
  className?: string;
  close?: TrafficAction;
  minimize?: TrafficAction;
  zoom?: TrafficAction;
}) {
  const interactive = Boolean(close || minimize || zoom);
  return (
    <span
      className={cn("group/lights flex items-center gap-1.5", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <Light color="red" action={close} interactive={interactive} />
      <Light color="amber" action={minimize} interactive={interactive} />
      <Light color="emerald" action={zoom} interactive={interactive} />
    </span>
  );
}

function Light({
  color,
  action,
  interactive,
}: {
  color: "red" | "amber" | "emerald";
  action?: TrafficAction;
  interactive: boolean;
}) {
  const live = {
    red: "bg-[#ff5f57]",
    amber: "bg-[#febc2e]",
    emerald: "bg-[#28c840]",
  }[color];
  const idleHover = {
    red: "bg-zinc-700 transition-colors group-hover/lights:bg-[#ff5f57]",
    amber: "bg-zinc-700 transition-colors group-hover/lights:bg-[#febc2e]",
    emerald: "bg-zinc-700 transition-colors group-hover/lights:bg-[#28c840]",
  }[color];

  if (!action) {
    return (
      <span
        className={cn("h-3 w-3 rounded-full ring-1 ring-black/10", interactive ? live : idleHover)}
      />
    );
  }

  return (
    <button
      type="button"
      title={action.title}
      onClick={action.onClick}
      className={cn(
        "flex h-3 w-3 items-center justify-center rounded-full text-[8px] text-black/60 ring-1 ring-black/10 transition-transform hover:scale-110 active:scale-95",
        live,
      )}
    >
      <span className="opacity-0 transition-opacity group-hover/lights:opacity-100">
        {action.glyph}
      </span>
    </button>
  );
}

/**
 * A floating application window laid over the desktop wallpaper — mac/linux
 * styling with a centred titlebar. Compose a toolbar row under the titlebar via
 * `toolbar` (e.g. an address bar or a path breadcrumb).
 */
export function WindowFrame({
  title,
  icon,
  toolbar,
  children,
  className,
  bodyClassName,
  onClose,
  onZoom,
  accent = false,
}: {
  title: ReactNode;
  icon?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  onClose?: () => void;
  onZoom?: () => void;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/80 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)] backdrop-blur-xl ring-1 ring-black/40",
        accent && "ring-indigo-400/20",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.08] bg-zinc-900/80 px-3">
        <TrafficLights
          close={onClose ? { onClick: onClose, title: "Close" } : undefined}
          zoom={onZoom ? { onClick: onZoom, title: "Zoom" } : undefined}
          minimize={onClose || onZoom ? { title: "Minimise" } : undefined}
        />
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-zinc-400">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        <span className="w-[52px] shrink-0" />
      </div>
      {toolbar}
      <div className={cn("min-h-0 flex-1 overflow-hidden", bodyClassName)}>{children}</div>
    </div>
  );
}
