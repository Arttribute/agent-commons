"use client";

import { useRef, useState, type ReactNode } from "react";
import { AgentsPagination } from "../agents/agents-pagination";
import { useWorkspacePreferences } from "../../hooks/use-workspace-preferences";
import { AgentsOverviewCanvas, type OverviewAgent } from "./agents-overview-canvas";

export function AgentsWorkspaceView({ agents, launcher, loading, error, onRetry, onAgentClick }: {
  agents: OverviewAgent[];
  launcher: ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onAgentClick: (id: string) => void;
}) {
  const composerRef = useRef<HTMLDivElement>(null);
  const { agentsPerPage, setAgentsPerPage } = useWorkspacePreferences();
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(agents.length / agentsPerPage));
  const safePage = Math.min(page, pageCount - 1);
  const visible = agents.slice(safePage * agentsPerPage, (safePage + 1) * agentsPerPage);

  return <div className="relative h-full min-h-0">
    <AgentsOverviewCanvas agents={visible} composerRef={composerRef} launcher={launcher} loading={loading} error={error} onRetry={onRetry} onAgentClick={onAgentClick} />
    {!loading && agents.length > 0 && <div className="pointer-events-none absolute bottom-4 left-4 z-30 sm:left-6">
      <AgentsPagination page={safePage} pageSize={agentsPerPage} total={agents.length} onPageChange={setPage} onPageSizeChange={(size) => { setAgentsPerPage(size); setPage(0); }} />
    </div>}
  </div>;
}
