"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalSearch } from "@/context/SearchContext";

/**
 * Opens the global command palette (agents, sessions, tools, tasks, workflows…).
 * Shared across the dashboard and agent-workspace sidebars so search lives in
 * one place and behaves identically everywhere.
 *
 * - `collapsed` — icon-only, for the narrow icon rail.
 * - `variant="menu"` — a plain nav menu item (default), matching sidebar nav.
 */
export function SearchTrigger({
  collapsed = false,
  variant = "menu",
  className,
}: {
  collapsed?: boolean;
  variant?: "menu" | "input";
  className?: string;
}) {
  const { openSearch } = useGlobalSearch();
  const [modKey, setModKey] = useState("⌘");

  useEffect(() => {
    if (typeof navigator !== "undefined" && !/Mac|iPhone|iPad/.test(navigator.platform)) {
      setModKey("Ctrl");
    }
  }, []);

  if (collapsed) {
    return (
      <button
        onClick={openSearch}
        aria-label="Search"
        title="Search (⌘K)"
        className={cn(
          "rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground",
          className
        )}
      >
        <Search className="h-5 w-5" />
      </button>
    );
  }

  if (variant === "input") {
    return (
      <button
        onClick={openSearch}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          {modKey}K
        </kbd>
      </button>
    );
  }

  // Plain nav menu item — matches the sidebar's other nav buttons.
  return (
    <button
      onClick={openSearch}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="pointer-events-none hidden select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
        {modKey}K
      </kbd>
    </button>
  );
}
