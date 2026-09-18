"use client";

import { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { FloatingLayer } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";

/** Small dark label shown on hover or keyboard focus. */
export function Tooltip({
  label,
  side = "bottom",
  children,
  className,
}: {
  label: string;
  side?: Side;
  children: ReactNode;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 180);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      ref={setAnchor}
      className={cn("inline-flex", className)}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={hide}
    >
      {children}
      <FloatingLayer
        anchor={anchor}
        open={open}
        side={side}
        align="center"
        role="tooltip"
        interactive={false}
        className="max-w-60 rounded-md bg-stone-900 px-2 py-1 text-xs text-white shadow-floating"
      >
        {label}
      </FloatingLayer>
    </span>
  );
}

/**
 * Tidy "more information" affordance. Explanations live here instead of in
 * paragraphs on the page, so each view stays focused on its one task.
 */
export function InfoTip({
  children,
  label = "More information",
  side = "bottom",
  className,
}: {
  children: ReactNode;
  label?: string;
  side?: Side;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<number | null>(null);
  const open = hovering || pinned;

  const enter = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setHovering(true);
  };
  const leave = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHovering(false), 120);
  };

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
      <FloatingLayer
        anchor={anchor}
        open={open}
        side={side}
        align="start"
        onDismiss={() => {
          setPinned(false);
          setHovering(false);
        }}
        onPointerEnter={enter}
        onPointerLeave={leave}
        className="max-w-72 rounded-lg border border-border bg-white p-3 text-xs leading-5 text-stone-600 shadow-floating"
      >
        {children}
      </FloatingLayer>
    </>
  );
}
