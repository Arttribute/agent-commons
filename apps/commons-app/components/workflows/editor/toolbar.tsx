"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { Undo2, Redo2, Save, Loader2, CheckCircle2, ArrowLeft, GitBranch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

export function EditorToolbar() {
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    saveWorkflow,
    isSaving,
    lastSaved,
    workflow,
  } = useWorkflowStore();

  const handleSave = async () => {
    try {
      await saveWorkflow();
    } catch (error) {
      console.error("Failed to save workflow:", error);
    }
  };

  return (
    <div className="h-12 border-b border-border bg-background px-3 flex items-center justify-between shrink-0">
      {/* Left: back + name */}
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/studio/workflows">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate max-w-[280px]">
            {workflow?.name || "Untitled Workflow"}
          </span>
          {workflow?.isPublic && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              Public
            </Badge>
          )}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {/* Save status */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving…</span>
            </>
          ) : lastSaved ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>Saved {formatDistanceToNow(lastSaved, { addSuffix: true })}</span>
            </>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => undo()}
          disabled={!canUndo()}
          title="Undo (⌘Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => redo()}
          disabled={!canRedo()}
          title="Redo (⌘⇧Z)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="ml-1 h-8 gap-1.5"
          title="Save (⌘S)"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  );
}
