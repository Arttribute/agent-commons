"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Brand page title — the text sits fully inside a soft highlight block,
 * matching the marker-highlight style of the Agent Commons brand slides.
 */
export function PageTitle({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <h1 className={cn("text-base font-medium tracking-tight", className)}>
      <span className="inline-block rounded-md bg-teal-200 px-1.5 py-0.5 leading-snug text-neutral-900">
        {title}
      </span>
    </h1>
  );
}

/**
 * Minimal circular create button (Linear-style): white circle with a plus
 * icon; the action label is revealed in a tooltip on hover.
 */
export function CreateButton({
  label,
  onClick,
  href,
  className,
}: {
  label: string;
  onClick: () => void;
  /** Native fallback for actions that must survive a click before hydration. */
  href?: string;
  className?: string;
}) {
  const classNames = cn(
    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-card transition-colors hover:bg-muted",
    className,
  );
  const trigger = href ? (
    <a
      href={href}
      role="button"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
      className={classNames}
    >
      <Plus className="h-4 w-4" strokeWidth={1.75} />
    </a>
  ) : (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={classNames}
    >
      <Plus className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Shared page header: highlighted title, optional description, and a
 * right-aligned actions slot. Intentionally borderless so pages flow
 * smoothly into their content.
 */
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-6 pb-3 pt-5",
        className,
      )}
    >
      <div className="min-w-0">
        <PageTitle title={title} />
        {description && (
          <p className="mt-1.5 truncate text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-shrink-0 items-center gap-3">{children}</div>
      )}
    </div>
  );
}
