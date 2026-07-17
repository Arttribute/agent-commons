"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const AGENT_PAGE_SIZES = [5, 10, 20, 50];

/**
 * Minimal pager for the floating agents showcase. Sits bottom-left over the
 * scatter field: prev/next arrows, "1–10 of 34" range, and a per-page picker.
 */
export function AgentsPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  /** Zero-based page index. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  const arrowClass =
    "flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-white/80 py-1 pl-1 pr-2.5 shadow-sm backdrop-blur">
      <button
        type="button"
        className={arrowClass}
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className={arrowClass}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount - 1}
        aria-label="Next page"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      <span className="px-1 text-xs tabular-nums text-muted-foreground">
        {start}–{end} of {total} agent{total === 1 ? "" : "s"}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger className="rounded-full px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none">
          {pageSize} / page
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="min-w-[7rem]">
          {AGENT_PAGE_SIZES.map((size) => (
            <DropdownMenuItem
              key={size}
              onSelect={() => onPageSizeChange(size)}
              className={cn(
                "text-xs tabular-nums",
                size === pageSize && "font-medium",
              )}
            >
              {size} per page
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
