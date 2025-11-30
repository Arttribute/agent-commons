"use client";

import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { Undo2, Redo2, Save, Loader2, CheckCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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
    <div className="h-14 border-b bg-white px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold truncate max-w-md">
          {workflow?.name || "Untitled Workflow"}
        </h2>
        {workflow?.description && (
          <p className="text-sm text-gray-500 truncate max-w-xs">
            {workflow.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => undo()}
            disabled={!canUndo()}
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => redo()}
            disabled={!canRedo()}
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Save status */}
        <div className="flex items-center gap-2 text-sm">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-gray-600">Saving...</span>
            </>
          ) : lastSaved ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-gray-600">
                Saved{" "}
                {formatDistanceToNow(lastSaved, {
                  addSuffix: true,
                })}
              </span>
            </>
          ) : null}
        </div>

        {/* Manual save button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          title="Save (Cmd+S)"
        >
          <Save className="h-4 w-4 mr-2" />
          Save
        </Button>
      </div>
    </div>
  );
}
