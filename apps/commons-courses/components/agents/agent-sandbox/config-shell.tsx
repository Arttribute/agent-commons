"use client";

import type { ReactNode } from "react";
import {
  ArrowLeft,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Database,
  Hammer,
  MessageSquarePlus,
  Monitor,
  Sparkles,
  TerminalSquare,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigPanel, SandboxSection } from "./types";

export const panelMeta: Record<
  SandboxSection,
  { label: string; description: string; icon: typeof Bot }
> = {
  identity: {
    label: "Agent setup",
    description: "Identity and behavior for your agent.",
    icon: Bot,
  },
  chat: {
    label: "New session",
    description: "Create the agent, then test it in a live session.",
    icon: MessageSquarePlus,
  },
  computer: {
    label: "Computer",
    description: "Explore the agent's scoped learning workspace.",
    icon: Monitor,
  },
  tasks: {
    label: "Tasks",
    description: "Choose the routines this agent should carry out.",
    icon: CalendarClock,
  },
  tools: {
    label: "Tools",
    description: "Give the agent access to the right connectors.",
    icon: Hammer,
  },
  skills: {
    label: "Skills",
    description: "Add reusable instructions to the agent.",
    icon: Sparkles,
  },
  workflows: {
    label: "Workflows",
    description: "Build and run the lesson's workflow shape.",
    icon: Workflow,
  },
  memory: {
    label: "Memory",
    description: "Organize the context the agent can remember.",
    icon: Database,
  },
  logs: {
    label: "Observability",
    description: "Inspect agent, tool, and sandbox activity.",
    icon: TerminalSquare,
  },
};

export function ConfigRail({
  sections,
  activeSection,
  agentName,
  courseTitle,
  challengeTitle,
  completed,
  onOpenSection,
  onExit,
}: {
  sections: SandboxSection[];
  activeSection: SandboxSection;
  agentName: string;
  courseTitle?: string;
  challengeTitle?: string;
  completed: boolean;
  onOpenSection: (section: SandboxSection) => void;
  onExit?: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-14 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white md:w-[260px]">
      <div className="shrink-0 border-b border-slate-200 p-2 md:p-3">
        <div className="flex items-center gap-2">
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-950"
              aria-label="Back to skills"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-xs font-medium text-slate-500">
              {courseTitle || "Learning sandbox"}
            </p>
            <p className="truncate text-sm font-semibold text-slate-950">
              {challengeTitle || "Agent workspace"}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden shrink-0 border-b border-slate-200 p-3 md:block">
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-950">
              {agentName || "Untitled agent"}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              {completed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              ) : null}
              {completed ? "Sandbox complete" : "Learner workspace"}
            </p>
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {sections.map((section) => {
          const { icon: Icon, label } = panelMeta[section];
          const active = activeSection === section;
          return (
            <button
              key={section}
              type="button"
              data-sandbox-target={`rail-${section}`}
              onClick={() => onOpenSection(section)}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-md px-2 text-left text-sm transition-colors md:justify-start",
                active
                  ? "bg-slate-100 text-slate-950"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-950",
              )}
              title={label}
              aria-label={label}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden min-w-0 flex-1 truncate md:block">
                {label}
              </span>
              {active ? (
                <ChevronRight className="hidden h-3.5 w-3.5 md:block" />
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function ConfigDrawer({
  panel,
  children,
}: {
  open?: boolean;
  panel: ConfigPanel;
  onClose?: () => void;
  children: ReactNode;
}) {
  const { icon: Icon, label, description } = panelMeta[panel];
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50/40">
      <header className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <h1 className="text-lg font-medium tracking-tight text-slate-950">
            {label}
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <div className="mx-auto max-w-5xl rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          {children}
        </div>
      </div>
    </section>
  );
}
