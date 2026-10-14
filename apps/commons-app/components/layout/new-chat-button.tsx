"use client";

import Link from "next/link";
import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { workspacePaths } from "@/lib/workspace-routes";

/** The sidebar's first row: start a new chat with any agent at /new. */
export function NewChatButton({ active = false, collapsed = false }: { active?: boolean; collapsed?: boolean }) {
  if (collapsed) {
    return (
      <Link
        href={workspacePaths.new}
        aria-label="New chat"
        title="New chat"
        className={cn(
          "rounded-md p-1.5 text-foreground/70 hover:bg-accent hover:text-foreground",
          active && "bg-accent text-accent-foreground",
        )}
      >
        <SquarePen className="h-4 w-4" strokeWidth={1.75} />
      </Link>
    );
  }
  return (
    <Link
      href={workspacePaths.new}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground/70 hover:bg-muted hover:text-foreground",
      )}
    >
      <SquarePen className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">New chat</span>
    </Link>
  );
}
