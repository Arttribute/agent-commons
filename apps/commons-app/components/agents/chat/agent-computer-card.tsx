"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { useWorkspaceMode } from "@/context/WorkspaceModeContext";
import { isActiveComputer, type AgentComputer } from "@/components/computers/computer-types";

function describe(computer: AgentComputer | null, local: boolean) {
  if (local) return { title: "This computer", detail: "Runs tools on your machine with your approval." };
  if (!computer) return { title: "No computer yet", detail: "The agent gets one the first time it needs it." };
  if (isActiveComputer(computer)) return { title: "Computer is on", detail: "Open it to watch or take over." };
  return { title: "Computer is asleep", detail: "It wakes when the agent needs it." };
}

/** A glance at the agent's computer, with the full view one tap away. */
export function AgentComputerCard({ agentId, onOpen }: { agentId: string; onOpen: () => void }) {
  const { mode } = useWorkspaceMode();
  const local = mode === "private-local";
  const [computer, setComputer] = useState<AgentComputer | null>(null);
  const [loaded, setLoaded] = useState(local);

  useEffect(() => {
    if (local) return;
    let cancelled = false;
    fetch(`/api/agents/${encodeURIComponent(agentId)}/computer`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled) return;
        const value = payload?.data?.computer ?? payload?.data ?? null;
        setComputer(value?.computerId ? value : null);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [agentId, local]);

  const { title, detail } = describe(computer, local);
  const on = isActiveComputer(computer);

  return (
    <div className="px-4 pb-6">
      <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-border bg-muted/40 px-6 text-center">
        <span className="relative">
          <Monitor className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
          {on && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />}
        </span>
        <p className="mt-3 text-sm font-medium">{loaded ? title : "Checking…"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{loaded ? detail : " "}</p>
        <button type="button" onClick={onOpen} className="mt-4 rounded-full border border-border bg-white px-3.5 py-1.5 text-xs shadow-card hover:bg-muted">
          Open computer
        </button>
      </div>
    </div>
  );
}
