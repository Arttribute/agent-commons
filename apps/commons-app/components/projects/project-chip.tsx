"use client";

import { useState } from "react";
import { Check, FolderClosed, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ProjectOption = { projectId: string; name: string };

/**
 * Picks the project a chat works in. Used wherever a new chat starts: the
 * /new launcher, an agent's chat, and the artifact canvas.
 *
 * - `pill` (default): a floating chip with a shadow, for canvas overlays.
 * - `quiet`: a borderless text button that sits beside a composer.
 * - `icon`: an icon-only button for dense headers.
 */
export function ProjectChip({
  projects,
  projectId,
  onChange,
  variant = "pill",
  side,
  className,
}: {
  projects: ProjectOption[];
  projectId: string | null;
  onChange: (projectId: string | null) => void;
  variant?: "pill" | "quiet" | "icon";
  side?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = projects.find((project) => project.projectId === projectId);
  const visible = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  const label = selected?.name ?? "Choose project";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            aria-label={selected ? `Project: ${selected.name}` : "Choose project"}
            title={label}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900",
              selected && "text-stone-900",
              className,
            )}
          >
            <FolderClosed className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : variant === "quiet" ? (
          <button
            type="button"
            aria-label={selected ? `Project: ${selected.name}` : "Choose project"}
            className={cn(
              "flex h-8 max-w-[240px] items-center gap-1.5 rounded-lg px-2 text-sm transition-colors hover:bg-muted",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            <FolderClosed className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{label}</span>
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "flex max-w-[240px] items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 shadow-card hover:text-stone-900",
              className,
            )}
          >
            <FolderClosed className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{label}</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" side={side ?? (variant === "icon" ? "bottom" : "top")} className="w-64 p-1">
        <div className="flex items-center gap-2 border-b border-stone-100 px-2 pb-1.5 pt-1">
          <Search className="h-3.5 w-3.5 text-stone-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            className="h-7 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400 md:text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
          {visible.map((project) => (
            <button
              key={project.projectId}
              type="button"
              onClick={() => {
                onChange(project.projectId);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-100"
            >
              <FolderClosed className="h-4 w-4 shrink-0 text-stone-400" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.projectId === projectId && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
          {!visible.length && (
            <p className="px-2 py-2 text-xs text-stone-500">{projects.length ? "No projects found" : "No projects yet"}</p>
          )}
        </div>
        {projectId && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg border-t border-stone-100 px-2 py-2 text-left text-sm text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
            Don&apos;t work in a project
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
