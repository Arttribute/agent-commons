"use client";

import { Check, Cloud, Laptop } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Mode = "cloud" | "private-local";

const MODES = [
  { mode: "cloud" as const, label: "Cloud", detail: "Synced across devices", icon: Cloud },
  { mode: "private-local" as const, label: "Local", detail: "Stays on this computer", icon: Laptop },
];

/**
 * Quiet Cloud/Local control for the desktop app. It sits in the sidebar
 * footer so the current mode is always visible without competing with the
 * page. The collapsed rail shows only the current mode's icon.
 */
export function WorkspaceModeSwitch({ mode, onCloud, onLocal, collapsed = false }: {
  mode: Mode;
  onCloud: () => void;
  onLocal: () => void;
  collapsed?: boolean;
}) {
  const select = (next: Mode) => {
    if (next === mode) return;
    if (next === "cloud") onCloud();
    else onLocal();
  };

  if (collapsed) {
    const current = MODES.find((entry) => entry.mode === mode) ?? MODES[0];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Workspace mode: ${current.label}`}
            title={`${current.label} mode`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          >
            <current.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {MODES.map((entry) => (
            <DropdownMenuItem key={entry.mode} onSelect={() => select(entry.mode)} className="gap-2">
              <entry.icon className="h-4 w-4" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{entry.label}</span>
                <span className="block text-[11px] text-muted-foreground">{entry.detail}</span>
              </span>
              {entry.mode === mode && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div role="group" aria-label="Workspace mode" className="flex items-center rounded-md bg-muted/70 p-0.5">
      {MODES.map((entry) => {
        const active = entry.mode === mode;
        return (
          <button
            key={entry.mode}
            type="button"
            aria-pressed={active}
            title={entry.detail}
            onClick={() => select(entry.mode)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-[5px] px-2 text-[11px] font-medium transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <entry.icon className="h-3 w-3" strokeWidth={2} />
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}
