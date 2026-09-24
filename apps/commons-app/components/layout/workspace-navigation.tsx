"use client";

import type { ReactNode } from "react";
import { Bot, LibraryBig, MoreHorizontal, Network, Settings2, Wrench, Workflow, type LucideIcon } from "lucide-react";
import { ClipboardClock } from "../icons/clipboard-clock";
import { workspacePaths } from "../../lib/workspace-routes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";

export const workspaceNavigationItems = [
  { key: "agents", label: "Agents", icon: Bot, path: workspacePaths.agents },
  { key: "tools", label: "Tools", icon: Wrench, path: workspacePaths.tools },
  { key: "tasks", label: "Scheduled tasks", icon: ClipboardClock, path: workspacePaths.tasks },
  { key: "workflows", label: "Workflows", icon: Workflow, path: workspacePaths.workflows },
  { key: "knowledge", label: "Knowledge", icon: Network, path: workspacePaths.knowledge },
  { key: "library", label: "Library", icon: LibraryBig, path: workspacePaths.library },
  { key: "customize", label: "Customize", icon: Settings2, path: workspacePaths.customize },
] as const;

export function WorkspaceMoreMenu({ items, activeSection, navigate, collapsed = false }: {
  items: Array<{ key: string; label: string; icon: LucideIcon; path: string }>;
  activeSection?: string;
  navigate: (path: string) => void;
  collapsed?: boolean;
}) {
  const active = items.some((item) => item.key === activeSection);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="More" title="More" className={`flex h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground/70 hover:bg-muted hover:text-foreground ${collapsed ? "justify-center" : "w-full"} ${active ? "bg-accent text-accent-foreground" : ""}`}>
        <MoreHorizontal className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">More</span>}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-44">
      {items.map(({ key, label, icon: Icon, path }) => <DropdownMenuItem key={key} onSelect={() => navigate(path)} className={activeSection === key ? "bg-accent" : undefined}>
        <Icon className="mr-2 h-4 w-4" />{label}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function WorkspaceNavigation({ activeTab, navigate, brand, rightSlot, search, more }: {
  activeTab: string;
  navigate: (path: string) => void;
  brand: ReactNode;
  rightSlot?: ReactNode;
  search?: ReactNode;
  more?: ReactNode;
}) {
  return (
    <div className="w-full" data-workspace-navigation>
      <div className="flex h-8 justify-between items-center mb-3 px-1">
        {brand}
        <div className="flex items-center">{rightSlot}</div>
      </div>
      <div className="flex flex-col gap-1">
        {search}
        {workspaceNavigationItems.map(({ key, label, icon: Icon, path }) => (
          <button
            key={key}
            type="button"
            className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-normal transition-colors ${
              activeTab === key
                ? "bg-accent text-accent-foreground"
                : "text-foreground/70 hover:bg-muted hover:text-foreground"
            }`}
            onClick={() => navigate(path)}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        ))}
        {more}
      </div>
    </div>
  );
}
