import { ReactFlowNode, ReactFlowEdge } from "@/types/workflow";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a workflow as a DAG (Directed Acyclic Graph)
 */
export function validateDAG(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check minimum requirements
  if (nodes.length === 0) {
    errors.push("Workflow must have at least one node");
    return { valid: false, errors, warnings };
  }

  // Build adjacency list
  const graph = new Map<string, string[]>();
  nodes.forEach((node) => graph.set(node.id, []));
  edges.forEach((edge) => {
    const neighbors = graph.get(edge.source) || [];
    neighbors.push(edge.target);
    graph.set(edge.source, neighbors);
  });

  // Check for cycles using DFS
  const hasCycle = detectCycle(graph);
  if (hasCycle) {
    errors.push("Workflow contains a cycle (loops are not allowed)");
  }

  // Check for input and output nodes
  const inputNodes = nodes.filter((n) => n.type === "input");
  const outputNodes = nodes.filter((n) => n.type === "output");

  if (inputNodes.length === 0) {
    warnings.push("Workflow should have at least one input node");
  }

  if (outputNodes.length === 0) {
    warnings.push("Workflow should have at least one output node");
  }

  // Check all nodes are connected (reachable from inputs or reach outputs)
  if (inputNodes.length > 0) {
    const reachableFromInputs = getReachableNodes(
      graph,
      inputNodes.map((n) => n.id)
    );
    const unreachableNodes = nodes.filter(
      (n) => !reachableFromInputs.has(n.id) && n.type !== "input"
    );

    if (unreachableNodes.length > 0) {
      warnings.push(
        `${unreachableNodes.length} node(s) are not reachable from workflow inputs`
      );
    }
  }

  // Check for isolated nodes (no incoming or outgoing edges)
  const isolatedNodes = nodes.filter((node) => {
    const hasIncoming = edges.some((e) => e.target === node.id);
    const hasOutgoing = edges.some((e) => e.source === node.id);
    return !hasIncoming && !hasOutgoing && node.type !== "input";
  });

  if (isolatedNodes.length > 0) {
    warnings.push(`${isolatedNodes.length} isolated node(s) with no connections`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Detect cycles in a directed graph using DFS
 */
function detectCycle(graph: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true; // Cycle detected
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
}

/**
 * Get all nodes reachable from a set of start nodes using BFS
 */
function getReachableNodes(
  graph: Map<string, string[]>,
  startNodes: string[]
): Set<string> {
  const reachable = new Set<string>(startNodes);
  const queue = [...startNodes];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = graph.get(current) || [];

    for (const neighbor of neighbors) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return reachable;
}

/**
 * Check if adding an edge would create a cycle
 */
export function wouldCreateCycle(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  newEdge: { source: string; target: string }
): boolean {
  // Build graph with the new edge
  const graph = new Map<string, string[]>();
  nodes.forEach((node) => graph.set(node.id, []));
  edges.forEach((edge) => {
    const neighbors = graph.get(edge.source) || [];
    neighbors.push(edge.target);
    graph.set(edge.source, neighbors);
  });

  // Add the new edge
  const neighbors = graph.get(newEdge.source) || [];
  neighbors.push(newEdge.target);
  graph.set(newEdge.source, neighbors);

  return detectCycle(graph);
}
