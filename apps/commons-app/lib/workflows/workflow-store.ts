import { create } from "zustand";
import {
  Workflow,
  ReactFlowNode,
  ReactFlowEdge,
  WorkflowNode,
  WorkflowEdge,
} from "@/types/workflow";
import { validateDAG, ValidationResult } from "./workflow-validator";

interface HistoryState {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

interface WorkflowEditorState {
  // Current state
  workflow: Workflow | null;
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];

  // History for undo/redo (limit to 50 states)
  past: HistoryState[];
  future: HistoryState[];

  // UI state
  isSaving: boolean;
  lastSaved: Date | null;

  // Actions
  setWorkflow: (workflow: Workflow | null) => void;
  setNodes: (nodes: ReactFlowNode[]) => void;
  setEdges: (edges: ReactFlowEdge[]) => void;

  // Node operations (with history)
  addNode: (node: ReactFlowNode) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<ReactFlowNode>) => void;

  // Edge operations (with history)
  addEdge: (edge: ReactFlowEdge) => void;
  removeEdge: (edgeId: string) => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Save
  saveWorkflow: () => Promise<void>;

  // Validation
  validateDAG: () => ValidationResult;

  // Load workflow from backend
  loadWorkflow: (workflowId: string) => Promise<void>;

  // Reset
  reset: () => void;
}

const MAX_HISTORY = 50;

export const useWorkflowStore = create<WorkflowEditorState>((set, get) => ({
  // Initial state
  workflow: null,
  nodes: [],
  edges: [],
  past: [],
  future: [],
  isSaving: false,
  lastSaved: null,

  setWorkflow: (workflow) => set({ workflow }),

  setNodes: (nodes) => {
    const current = get();
    // Only add to history if nodes actually changed
    const nodesChanged = JSON.stringify(current.nodes) !== JSON.stringify(nodes);

    if (nodesChanged && current.nodes.length > 0) {
      const newPast = [
        ...current.past,
        { nodes: current.nodes, edges: current.edges },
      ].slice(-MAX_HISTORY);

      set({ nodes, past: newPast, future: [] });
    } else {
      set({ nodes });
    }
  },

  setEdges: (edges) => {
    const current = get();
    // Only add to history if edges actually changed
    const edgesChanged = JSON.stringify(current.edges) !== JSON.stringify(edges);

    if (edgesChanged && current.edges.length > 0) {
      const newPast = [
        ...current.past,
        { nodes: current.nodes, edges: current.edges },
      ].slice(-MAX_HISTORY);

      set({ edges, past: newPast, future: [] });
    } else {
      set({ edges });
    }
  },

  addNode: (node) => {
    const current = get();
    const newPast = [
      ...current.past,
      { nodes: current.nodes, edges: current.edges },
    ].slice(-MAX_HISTORY);

    set({
      nodes: [...current.nodes, node],
      past: newPast,
      future: [],
    });
  },

  removeNode: (nodeId) => {
    const current = get();
    const newPast = [
      ...current.past,
      { nodes: current.nodes, edges: current.edges },
    ].slice(-MAX_HISTORY);

    set({
      nodes: current.nodes.filter((n) => n.id !== nodeId),
      edges: current.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      ),
      past: newPast,
      future: [],
    });
  },

  updateNode: (nodeId, updates) => {
    const current = get();

    // Don't add to history for position-only updates
    const isPositionOnly =
      Object.keys(updates).length === 1 && "position" in updates;

    const newNodes = current.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...updates } : n
    );

    if (isPositionOnly) {
      set({ nodes: newNodes });
    } else {
      const newPast = [
        ...current.past,
        { nodes: current.nodes, edges: current.edges },
      ].slice(-MAX_HISTORY);

      set({ nodes: newNodes, past: newPast, future: [] });
    }
  },

  addEdge: (edge) => {
    const current = get();
    const newPast = [
      ...current.past,
      { nodes: current.nodes, edges: current.edges },
    ].slice(-MAX_HISTORY);

    set({
      edges: [...current.edges, edge],
      past: newPast,
      future: [],
    });
  },

  removeEdge: (edgeId) => {
    const current = get();
    const newPast = [
      ...current.past,
      { nodes: current.nodes, edges: current.edges },
    ].slice(-MAX_HISTORY);

    set({
      edges: current.edges.filter((e) => e.id !== edgeId),
      past: newPast,
      future: [],
    });
  },

  undo: () => {
    const current = get();
    if (current.past.length === 0) return;

    const previous = current.past[current.past.length - 1];
    const newPast = current.past.slice(0, -1);
    const newFuture = [
      { nodes: current.nodes, edges: current.edges },
      ...current.future,
    ].slice(0, MAX_HISTORY);

    set({
      nodes: previous.nodes,
      edges: previous.edges,
      past: newPast,
      future: newFuture,
    });
  },

  redo: () => {
    const current = get();
    if (current.future.length === 0) return;

    const next = current.future[0];
    const newFuture = current.future.slice(1);
    const newPast = [
      ...current.past,
      { nodes: current.nodes, edges: current.edges },
    ].slice(-MAX_HISTORY);

    set({
      nodes: next.nodes,
      edges: next.edges,
      past: newPast,
      future: newFuture,
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  validateDAG: () => {
    const { nodes, edges } = get();
    return validateDAG(nodes, edges);
  },

  saveWorkflow: async () => {
    const { workflow, nodes, edges, validateDAG } = get();
    if (!workflow) return;

    // Validate before saving
    const validation = validateDAG();
    if (!validation.valid) {
      console.error("Cannot save invalid workflow:", validation.errors);
      return;
    }

    set({ isSaving: true });

    try {
      // Find start and end nodes
      const inputNodes = nodes.filter((n) => n.type === "input");
      const outputNodes = nodes.filter((n) => n.type === "output");

      const startNodeId = inputNodes[0]?.id || nodes[0]?.id;
      const endNodeId = outputNodes[0]?.id || nodes[nodes.length - 1]?.id;

      // Build workflow definition matching backend schema
      const definition = {
        startNodeId,
        endNodeId,
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.type as "tool" | "agent_processor" | "input" | "output",
          toolId: node.data.toolId || node.data.toolName, // Use toolId (UUID) if available, fallback to toolName for legacy nodes
          toolName: node.data.toolName,
          position: node.position,
          config: node.data.config || {},
          label: node.data.label,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          mapping: edge.data?.dataType
            ? { [edge.sourceHandle || "output"]: edge.targetHandle || "input" }
            : {},
        })),
      };

      // Save to backend
      const res = await fetch(`/api/workflows/${workflow.workflowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          definition,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save workflow");
      }

      set({ lastSaved: new Date() });
    } catch (error) {
      console.error("Error saving workflow:", error);
      throw error;
    } finally {
      set({ isSaving: false });
    }
  },

  loadWorkflow: async (workflowId: string) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (!res.ok) {
        throw new Error("Failed to load workflow");
      }

      const data = await res.json();
      const workflow = data.data;
      const definition = workflow.definition || { nodes: [], edges: [] };

      // Fetch all tools (both static and user tools) to restore schemas
      const [staticToolsRes, userToolsRes] = await Promise.all([
        fetch(`/api/tools/static`),
        fetch(`/api/tools?ownerType=platform`), // Fetch all available tools
      ]);

      const staticToolsData = staticToolsRes.ok ? await staticToolsRes.json() : { data: [] };
      const userToolsData = userToolsRes.ok ? await userToolsRes.json() : { data: [] };

      const allTools = [...(staticToolsData.data || []), ...(userToolsData.data || [])];
      const toolMap = new Map(allTools.map((tool: any) => [tool.toolId, tool]));

      // Convert backend nodes to React Flow nodes
      const nodes: ReactFlowNode[] = await Promise.all((definition.nodes || []).map(async (node: any) => {
        let inputs: any[] = [];
        let outputs: any[] = [];

        // For tool nodes, restore inputs/outputs from tool schema
        if (node.type === "tool" && node.toolId) {
          const tool = toolMap.get(node.toolId);
          if (tool && tool.schema) {
            // Re-import the type mapping utilities
            const { extractTypedParameters, extractOutputParameters } = await import("./type-mapping");
            inputs = extractTypedParameters(tool.schema);
            outputs = extractOutputParameters(tool.schema);
          }
        } else if (node.type === "input") {
          outputs = [{ name: "value", type: "any", required: false }];
        } else if (node.type === "output") {
          inputs = [{ name: "value", type: "any", required: false }];
        }

        return {
          id: node.id,
          type: node.type,
          position: node.position || { x: 0, y: 0 },
          data: {
            label: node.label || node.toolName || node.type,
            toolId: node.toolId,
            toolName: node.toolName,
            inputs,
            outputs,
            nodeType: node.type,
            config: node.config,
            schema: toolMap.get(node.toolId)?.schema, // Store schema for future reference
          },
        };
      }));

      // Convert backend edges to React Flow edges
      const edges: ReactFlowEdge[] = (definition.edges || []).map((edge: any) => {
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: "colored",
          data: {
            dataType: "any",
            color: "#6b7280",
          },
        };
      });

      set({
        workflow,
        nodes,
        edges,
        past: [],
        future: [],
        lastSaved: new Date(workflow.updatedAt),
      });
    } catch (error) {
      console.error("Error loading workflow:", error);
      throw error;
    }
  },

  reset: () => {
    set({
      workflow: null,
      nodes: [],
      edges: [],
      past: [],
      future: [],
      isSaving: false,
      lastSaved: null,
    });
  },
}));
