"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { Undo2, Redo2, Save, Loader2, ArrowLeft } from "lucide-react";
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
    <div className="floating-panel absolute left-3 top-3 z-20 flex items-center gap-1 p-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-xl"
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

      <div className="mx-0.5 h-5 w-px bg-border" />

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl"
        onClick={() => undo()}
        disabled={!canUndo()}
        title="Undo (⌘Z)"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-xl"
        onClick={() => redo()}
        disabled={!canRedo()}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 className="h-4 w-4" />
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleSave}
        disabled={isSaving}
        className="h-9 gap-1.5 rounded-xl"
        title={
          lastSaved
            ? `Saved ${formatDistanceToNow(lastSaved, { addSuffix: true })} (⌘S)`
            : "Save (⌘S)"
        }
      >
        {isSaving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        Save
      </Button>
    </div>
  );
}
