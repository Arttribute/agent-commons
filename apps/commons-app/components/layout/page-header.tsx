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
    <h1 className={cn("text-xl font-semibold tracking-tight", className)}>
      <span className="inline-block rounded-md bg-teal-200 px-2.5 py-1 leading-none text-neutral-900">
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
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted",
              className,
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </TooltipTrigger>
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
