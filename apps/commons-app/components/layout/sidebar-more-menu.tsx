"use client";

import { useRouter } from "next/navigation";
import { MoreHorizontal, Logs, Earth } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const MORE_ITEMS = [
  { key: "logs", label: "Logs", icon: Logs, path: "/logs" },
  { key: "spaces", label: "Spaces", icon: Earth, path: "/spaces" },
];

/**
 * Overflow menu for secondary sidebar destinations (Logs, Spaces). Flies out
 * to the right of the trigger, matching the dashboard's other nav items in
 * both the expanded list and the collapsed icon rail.
 */
export function SidebarMoreMenu({
  collapsed = false,
  activeSection,
}: {
  collapsed?: boolean;
  activeSection?: string;
}) {
  const router = useRouter();
  const active = MORE_ITEMS.some((i) => i.key === activeSection);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            aria-label="More"
            title="More"
            className={cn(
              "rounded-md p-1.5 text-foreground/70 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
              active && "bg-accent text-accent-foreground"
            )}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        ) : (
          <button
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm font-normal text-foreground/70 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
              active && "bg-accent text-accent-foreground"
            )}
          >
            <MoreHorizontal className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">More</span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-44">
        {MORE_ITEMS.map(({ key, label, icon: Icon, path }) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => router.push(path)}
            className={cn(active && activeSection === key && "bg-accent")}
          >
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
