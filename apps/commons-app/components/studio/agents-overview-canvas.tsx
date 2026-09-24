"use client";

import type { ReactNode, RefObject } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import AgentsShowcase from "../agents/AgentsShowcase";
import { LauncherGreeting } from "./launcher-greeting";

export type OverviewAgent = {
  agentId: string;
  name: string;
  avatar?: string;
  persona?: string;
  description?: string;
};

export function AgentsOverviewCanvas({ agents, composerRef, launcher, loading = false, error, onRetry, onAgentClick }: {
  agents: OverviewAgent[];
  composerRef: RefObject<HTMLDivElement | null>;
  launcher: ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onAgentClick: (id: string) => void;
}) {
  return <div className="p-4 sm:p-6">
    <div className="relative h-[calc(100vh-170px)]">
      {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : error ? <div className="flex h-full flex-col items-center justify-center text-center">
          <AlertCircle className="mb-3 h-6 w-6 text-red-500" />
          <p className="text-sm font-medium">Couldn’t load your agents</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">Your account is still signed in. The connection to Agent Commons was interrupted.</p>
          {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">Try again</button>}
        </div> : agents.length === 0 ? <AgentsShowcase agents={agents} onAgentClick={onAgentClick} /> : <>
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
            <div ref={composerRef} className="pointer-events-auto w-full max-w-[46rem]">
              <div className="mb-5 text-center"><LauncherGreeting /></div>
              {launcher}
            </div>
          </div>
          <AgentsShowcase agents={agents} avoidRef={composerRef} onAgentClick={onAgentClick} />
        </>}
    </div>
  </div>;
}
