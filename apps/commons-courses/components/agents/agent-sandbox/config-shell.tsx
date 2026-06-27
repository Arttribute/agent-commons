"use client";

import type { ReactNode } from "react";
import {
  Bot,
  Hammer,
  PanelLeft,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigPanel } from "./types";

export const panelMeta: Record<ConfigPanel, { label: string; icon: typeof Bot }> = {
  identity: { label: "Identity", icon: Bot },
  skills: { label: "Skills", icon: Sparkles },
  tools: { label: "Tools", icon: Hammer },
  workflow: { label: "Workflow", icon: Workflow },
};

export function ConfigRail({
  activePanel,
  drawerOpen,
  onToggleDrawer,
  onOpenPanel,
}: {
  activePanel: ConfigPanel;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onOpenPanel: (panel: ConfigPanel) => void;
}) {
  return (
    <aside className="z-20 flex w-14 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50 py-3">
      <button
        type="button"
        onClick={onToggleDrawer}
        className="mb-3 rounded-lg border border-slate-200 bg-white p-2 text-slate-700"
        aria-label="Open agent configuration"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <div className="flex flex-1 flex-col gap-2">
        {(Object.keys(panelMeta) as ConfigPanel[]).map((panel) => {
          const Icon = panelMeta[panel].icon;
          return (
            <button
              key={panel}
              type="button"
              onClick={() => onOpenPanel(panel)}
              className={cn(
                "rounded-lg p-2",
                activePanel === panel && drawerOpen
                  ? "bg-slate-950 text-white"
                  : "text-slate-500 hover:bg-white hover:text-slate-950"
              )}
              aria-label={panelMeta[panel].label}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function ConfigDrawer({
  open,
  panel,
  onClose,
  children,
}: {
  open: boolean;
  panel: ConfigPanel;
  onClose: () => void;
  children: ReactNode;
}) {
  const Icon = panelMeta[panel].icon;
  return (
    <div
      className={cn(
        "absolute inset-y-0 left-0 z-40 max-h-full w-full border-r border-slate-200 bg-white shadow-xl transition-transform lg:relative lg:left-0 lg:z-30 lg:w-[min(420px,calc(100%-3.5rem))] lg:shadow-none",
        open ? "translate-x-0" : "-translate-x-full lg:hidden"
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-black">{panelMeta[panel].label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close configuration"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
