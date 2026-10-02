"use client";

import { forwardRef, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArtifactIcon } from "@/components/artifacts/artifact-icon";
import { artifactLabel } from "@/lib/artifacts";
import { cn } from "@/lib/utils";

/** A floating cluster of controls over the canvas. */
export function ChromeGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-0.5 rounded-xl border border-stone-200/80 bg-white/95 p-1 shadow-floating backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** An icon-only control with a tooltip and an accessible label. */
export const ChromeButton = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    children: ReactNode;
    onClick?: () => void;
    active?: boolean;
    disabled?: boolean;
    badge?: number;
    side?: "top" | "bottom" | "left" | "right";
    className?: string;
  } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">
>(function ChromeButton(
  { label, children, onClick, active, disabled, badge, side = "bottom", className, ...rest },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4",
            active && "bg-stone-100 text-stone-900",
            className,
          )}
          {...rest}
        >
          {children}
          {badge ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-stone-900 px-1 text-[9px] font-medium text-white">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
});

export function ChromeDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-stone-200" aria-hidden />;
}

/** A panel that floats over the canvas below the toolbar. */
export function FloatingPanel({
  title,
  onClose,
  actions,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "pointer-events-auto flex max-h-full w-[min(340px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-floating",
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="flex h-11 shrink-0 items-center gap-1 pl-4 pr-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">
          {title}
        </h2>
        {actions}
        <ChromeButton label="Close" onClick={onClose}>
          <X />
        </ChromeButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}

/** The quiet file-type mark shown while an artifact opens. */
export function FileTypeMark({
  artifact,
  label,
}: {
  artifact: { name?: string; mimeType?: string; kind?: string };
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-stone-400" role="status">
      <ArtifactIcon artifact={artifact} className="h-12 w-12 animate-pulse" strokeWidth={1.25} />
      <span className="text-xs font-medium tracking-wide">
        {label ?? artifactLabel(artifact)}
      </span>
    </div>
  );
}
