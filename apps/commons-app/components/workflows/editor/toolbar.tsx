"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { Undo2, Redo2, Save, Loader2, CheckCircle2, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { StudioEntitySwitcher } from "@/components/studio/studio-entity-switcher";

type WorkflowItem = {
  id: string;
  name: string;
  description?: string | null;
};

type EditorToolbarProps = {
  currentId: string;
  currentName: string;
  workflows: WorkflowItem[];
};

export function EditorToolbar({ currentId, currentName, workflows }: EditorToolbarProps) {
  const router = useRouter();
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    saveWorkflow,
    isSaving,
    lastSaved,
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
      {/* Left: back + workflow switcher */}
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => router.push("/studio/workflows")}
          aria-label="Back to workflows"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <StudioEntitySwitcher
          type="workflow"
          currentId={currentId}
          currentName={currentName}
          items={workflows}
        />
      </div>

      {/* Right: save status + undo/redo + save */}
      <div className="flex items-center gap-1">
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
