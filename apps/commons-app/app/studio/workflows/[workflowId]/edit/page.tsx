"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWorkflowStore } from "@/lib/workflows/workflow-store";
import { useAutoSave } from "@/lib/workflows/auto-save-hook";
import { EditorToolbar } from "@/components/workflows/editor/toolbar";
import { ToolSidebar } from "@/components/workflows/editor/tool-sidebar";
import { WorkflowCanvasProvider } from "@/components/workflows/editor/workflow-canvas";
import { TestPanel } from "@/components/workflows/editor/test-panel";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function WorkflowEditorPage() {
  const params = useParams();
  const workflowId = params.workflowId as string;
  const { authState } = useAuth();
  const { walletAddress } = authState;

  const { loadWorkflow, workflow, undo, redo, saveWorkflow, reset } =
    useWorkflowStore();

  const [loading, setLoading] = useState(true);

  // Load workflow on mount
  useEffect(() => {
    if (workflowId && workflowId !== "new") {
      loadWorkflow(workflowId)
        .catch((error) => {
          console.error("Failed to load workflow:", error);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // Create new workflow
      createNewWorkflow();
    }

    // Cleanup on unmount
    return () => {
      reset();
    };
  }, [workflowId]);

  const createNewWorkflow = async () => {
    if (!walletAddress) return;

    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Untitled Workflow",
          description: "",
          ownerId: walletAddress.toLowerCase(),
          ownerType: "user",
          nodes: [],
          edges: [],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create workflow");
      }

      const data = await res.json();
      if (data.success && data.data) {
        await loadWorkflow(data.data.workflowId);

        // Update URL to include the new workflow ID
        window.history.replaceState(
          {},
          "",
          `/studio/workflows/${data.data.workflowId}/edit`
        );
      }
    } catch (error) {
      console.error("Failed to create workflow:", error);
    } finally {
      setLoading(false);
    }
  };

  // Enable auto-save
  useAutoSave({ enabled: !!workflow });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo: Cmd+Z / Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }

      // Save: Cmd+S / Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveWorkflow().catch((error) => {
          console.error("Save failed:", error);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, saveWorkflow]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Workflow not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top toolbar */}
      <EditorToolbar />

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Tools */}
        <ToolSidebar userId={walletAddress?.toLowerCase() || ""} />

        {/* Center - Canvas */}
        <WorkflowCanvasProvider />

        {/* Right sidebar - Test panel */}
        <TestPanel workflowId={workflowId} />
      </div>
    </div>
  );
}
