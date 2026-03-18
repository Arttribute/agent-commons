import { useEffect, useRef, useCallback } from "react";
import { useWorkflowStore } from "./workflow-store";

interface UseAutoSaveOptions {
  enabled?: boolean;
  debounceMs?: number;
}

/**
 * Hook for auto-saving workflow changes with debouncing
 *
 * This hook monitors changes to nodes and edges and automatically
 * saves the workflow after a debounce period. Position-only updates
 * are ignored to prevent excessive saves during drag operations.
 */
export function useAutoSave(options: UseAutoSaveOptions = {}) {
  const { enabled = true, debounceMs = 2000 } = options;

  const { nodes, edges, saveWorkflow, workflow } = useWorkflowStore();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousNodesRef = useRef(nodes);
  const previousEdgesRef = useRef(edges);

  const debouncedSave = useCallback(() => {
    if (!enabled || !workflow) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      saveWorkflow().catch((error) => {
        console.error("Auto-save failed:", error);
      });
    }, debounceMs);
  }, [enabled, workflow, saveWorkflow, debounceMs]);

  useEffect(() => {
    // Check if nodes changed (excluding position-only changes)
    const nodesChanged = hasNonPositionChanges(
      previousNodesRef.current,
      nodes
    );

    // Check if edges changed
    const edgesChanged =
      JSON.stringify(previousEdgesRef.current) !== JSON.stringify(edges);

    if (nodesChanged || edgesChanged) {
      debouncedSave();
    }

    previousNodesRef.current = nodes;
    previousEdgesRef.current = edges;
  }, [nodes, edges, debouncedSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Return manual trigger function
  return {
    triggerSave: debouncedSave,
    cancelSave: () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    },
  };
}

/**
 * Check if nodes have changes beyond just position
 */
function hasNonPositionChanges(
  oldNodes: any[],
  newNodes: any[]
): boolean {
  // Different number of nodes = definitely changed
  if (oldNodes.length !== newNodes.length) return true;

  // Check each node for non-position changes
  for (let i = 0; i < oldNodes.length; i++) {
    const oldNode = oldNodes[i];
    const newNode = newNodes.find((n: any) => n.id === oldNode.id);

    if (!newNode) return true; // Node removed/added

    // Compare everything except position
    const oldWithoutPos = { ...oldNode, position: undefined };
    const newWithoutPos = { ...newNode, position: undefined };

    if (
      JSON.stringify(oldWithoutPos) !== JSON.stringify(newWithoutPos)
    ) {
      return true;
    }
  }

  return false;
}
