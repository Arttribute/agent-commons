"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

type Position = { top: number; left: number };

function computePosition(
  anchor: DOMRect,
  panel: DOMRect,
  side: Side,
  align: Align,
  offset: number,
): Position {
  let top = 0;
  let left = 0;
  if (side === "bottom" || side === "top") {
    top = side === "bottom" ? anchor.bottom + offset : anchor.top - panel.height - offset;
    left =
      align === "start"
        ? anchor.left
        : align === "end"
          ? anchor.right - panel.width
          : anchor.left + anchor.width / 2 - panel.width / 2;
  } else {
    left = side === "right" ? anchor.right + offset : anchor.left - panel.width - offset;
    top =
      align === "start"
        ? anchor.top
        : align === "end"
          ? anchor.bottom - panel.height
          : anchor.top + anchor.height / 2 - panel.height / 2;
  }
  // Keep the panel inside the viewport, flipping vertically when it would overflow.
  if (side === "bottom" && top + panel.height > window.innerHeight - 8) {
    top = Math.max(8, anchor.top - panel.height - offset);
  }
  if (side === "top" && top < 8) top = anchor.bottom + offset;
  left = Math.min(Math.max(8, left), window.innerWidth - panel.width - 8);
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - panel.height - 8));
  return { top, left };
}

/**
 * Floating layer anchored to an element. Rendered in a portal so it is never
 * clipped by scroll containers, and repositioned on scroll and resize.
 */
export function FloatingLayer(props: FloatingLayerProps) {
  if (!props.open || typeof document === "undefined") return null;
  return <FloatingPanel {...props} />;
}

type FloatingLayerProps = {
  anchor: HTMLElement | null;
  open: boolean;
  side?: Side;
  align?: Align;
  offset?: number;
  className?: string;
  children: ReactNode;
  onDismiss?: () => void;
  role?: string;
  interactive?: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

function FloatingPanel({
  anchor,
  side = "bottom",
  align = "start",
  offset = 6,
  className,
  children,
  onDismiss,
  role = "dialog",
  interactive = true,
  onPointerEnter,
  onPointerLeave,
}: FloatingLayerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Position is written straight to the element so the panel never renders
  // at a stale spot and no state update is needed after layout.
  const update = useCallback(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const next = computePosition(
      anchor.getBoundingClientRect(),
      panel.getBoundingClientRect(),
      side,
      align,
      offset,
    );
    panel.style.top = `${next.top}px`;
    panel.style.left = `${next.left}px`;
    panel.style.visibility = "visible";
  }, [anchor, side, align, offset]);

  useLayoutEffect(() => {
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [update]);

  useEffect(() => {
    if (!onDismiss) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss, anchor]);

  return createPortal(
    <div
      ref={panelRef}
      role={role}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ position: "fixed", top: -9999, left: -9999, visibility: "hidden" }}
      className={cn(
        "z-[80] ui-pop-in",
        !interactive && "pointer-events-none",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/**
 * Click-to-open popover. `trigger` receives the toggle handler and open state
 * so any button can act as the anchor.
 */
export function Popover({
  trigger,
  children,
  side = "bottom",
  align = "start",
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
  side?: Side;
  align?: Align;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (value: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [controlledOpen, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <>
      <span ref={setAnchor} className="inline-flex">
        {trigger({ open, toggle: () => setOpen(!open) })}
      </span>
      <FloatingLayer
        anchor={anchor}
        open={open}
        side={side}
        align={align}
        onDismiss={close}
        className={cn(
          "rounded-xl border border-border bg-white shadow-floating",
          className,
        )}
      >
        {typeof children === "function" ? children({ close }) : children}
      </FloatingLayer>
    </>
  );
}

/** Menu row used inside popovers. */
export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  description,
  active,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  description?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
        danger ? "text-red-600 hover:bg-red-50" : "text-foreground",
        active && "bg-accent",
      )}
    >
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-70" strokeWidth={1.75} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
