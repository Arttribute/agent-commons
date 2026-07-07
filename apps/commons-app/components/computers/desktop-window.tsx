"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ComputerMode } from "@/components/computers/computer-theme";

/**
 * Shared desktop chrome for the agent computer surface. Keeps the full-size
 * computer panel visually consistent with the inline <MiniComputer /> — same
 * mac-style traffic lights and window framing — while adapting to the computer's
 * light or dark appearance.
 */

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
  tone = "dark",
  close,
  minimize,
  zoom,
}: {
  className?: string;
  tone?: ComputerMode;
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
      <Light color="red" action={close} interactive={interactive} tone={tone} />
      <Light color="amber" action={minimize} interactive={interactive} tone={tone} />
      <Light color="emerald" action={zoom} interactive={interactive} tone={tone} />
    </span>
  );
}

function Light({
  color,
  action,
  interactive,
  tone,
}: {
  color: "red" | "amber" | "emerald";
  action?: TrafficAction;
  interactive: boolean;
  tone: ComputerMode;
}) {
  const live = {
    red: "bg-[#ff5f57]",
    amber: "bg-[#febc2e]",
    emerald: "bg-[#28c840]",
  }[color];
  const idle = tone === "light" ? "bg-zinc-300" : "bg-zinc-700";
  const idleHover = {
    red: `${idle} transition-colors group-hover/lights:bg-[#ff5f57]`,
    amber: `${idle} transition-colors group-hover/lights:bg-[#febc2e]`,
    emerald: `${idle} transition-colors group-hover/lights:bg-[#28c840]`,
  }[color];

  if (!action) {
    return (
      <span className={cn("h-3 w-3 rounded-full ring-1 ring-black/10", interactive ? live : idleHover)} />
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
      <span className="opacity-0 transition-opacity group-hover/lights:opacity-100">{action.glyph}</span>
    </button>
  );
}

const FRAME_TONES: Record<ComputerMode, { frame: string; titlebar: string; title: string; accentRing: string }> = {
  dark: {
    frame:
      "border-white/10 bg-zinc-900/80 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.75)] ring-1 ring-black/40 backdrop-blur-xl",
    titlebar: "border-white/[0.08] bg-zinc-900/80",
    title: "text-zinc-400",
    accentRing: "ring-indigo-400/20",
  },
  light: {
    frame:
      "border-zinc-200/80 bg-white/95 shadow-[0_24px_60px_-18px_rgba(15,23,42,0.30)] ring-1 ring-black/5 backdrop-blur-xl",
    titlebar: "border-zinc-200/80 bg-zinc-50/90",
    title: "text-zinc-500",
    accentRing: "ring-indigo-300/40",
  },
};

/**
 * A floating application window laid over the desktop wallpaper — mac/linux
 * styling with a centred titlebar. Compose a toolbar row under the titlebar via
 * `toolbar` (e.g. an address bar or a path breadcrumb).
 */
export function WindowFrame({
  title,
  icon,
  toolbar,
  actions,
  children,
  className,
  bodyClassName,
  tone = "dark",
  onClose,
  onZoom,
  accent = false,
}: {
  title: ReactNode;
  icon?: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: ComputerMode;
  onClose?: () => void;
  onZoom?: () => void;
  accent?: boolean;
}) {
  const t = FRAME_TONES[tone];
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border",
        t.frame,
        accent && t.accentRing,
        className,
      )}
    >
      <div className={cn("flex h-9 shrink-0 items-center gap-2 border-b px-3", t.titlebar)}>
        <TrafficLights
          tone={tone}
          close={onClose ? { onClick: onClose, title: "Close" } : undefined}
          zoom={onZoom ? { onClick: onZoom, title: "Zoom" } : undefined}
          minimize={onClose || onZoom ? { title: "Minimise" } : undefined}
        />
        <div className={cn("flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium", t.title)}>
          {icon}
          <span className="truncate">{title}</span>
        </div>
        <span className="flex w-[52px] shrink-0 items-center justify-end">{actions}</span>
      </div>
      {toolbar}
      <div className={cn("min-h-0 flex-1 overflow-hidden", bodyClassName)}>{children}</div>
    </div>
  );
}
