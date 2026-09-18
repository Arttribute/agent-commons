"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Right-hand sheet for focused tasks: creating something, reviewing one
 * submission, or reading one record. Forms live here rather than inline on
 * list pages.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  as = "div",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
  as?: "div" | "form";
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const body = (
    <>
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium text-foreground">{title}</h2>
          {description ? (
            <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
        {children}
      </div>
      {footer ? (
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-page px-5 py-3">
          {footer}
        </footer>
      ) : null}
    </>
  );

  const panelClass = cn(
    "ui-slide-in relative ml-auto flex h-full w-full flex-col bg-white shadow-floating",
    width === "lg" ? "max-w-2xl" : "max-w-lg",
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex">
      <div
        className="ui-fade-in absolute inset-0 bg-stone-950/20"
        onClick={onClose}
        aria-hidden
      />
      {as === "form" ? (
        <form onSubmit={onSubmit} className={panelClass} role="dialog" aria-modal>
          {body}
        </form>
      ) : (
        <div className={panelClass} role="dialog" aria-modal>
          {body}
        </div>
      )}
    </div>,
    document.body,
  );
}
