"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  CopilotChangeList,
  type CopilotChange,
} from "@/components/copilot/copilot-change-list";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";

export function WorkflowChangeReview({ workflowId }: { workflowId: string }) {
  const [changes, setChanges] = useState<CopilotChange[]>([]);
  const [expanded, setExpanded] = useState(false);
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      resourceType: "workflow",
      resourceId: workflowId,
    });
    const response = await fetch(`/api/copilot/changes?${query}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    setChanges((payload?.data ?? []).slice(0, 8));
  }, [workflowId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 8_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const pending = changes.filter((change) => change.status === "pending");
  if (!changes.length) return null;

  return (
    <div className="absolute bottom-5 right-20 z-30 w-[min(390px,calc(100vw-7rem))] rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="rounded-md bg-violet-100 p-1.5 text-violet-700">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Copilot changes</span>
          <span className="block text-[11px] text-muted-foreground">
            {pending.length
              ? `${pending.length} edit${pending.length === 1 ? "" : "s"} waiting for review`
              : "Recent edits are available to inspect or undo"}
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronUp className="h-4 w-4" />
        )}
      </button>
      {expanded && (
        <div className="max-h-[52vh] overflow-y-auto border-t border-border p-2">
          <CopilotChangeList
            compact
            changes={changes}
            onChanged={async () => {
              await loadWorkflow(workflowId);
              await load();
            }}
          />
        </div>
      )}
    </div>
  );
}
