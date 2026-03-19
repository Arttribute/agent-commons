import { WorkflowDataType } from "@/lib/workflows/type-mapping";

export interface Workflow {
  workflowId: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerType: "user" | "agent";
  isActive: boolean;
  isPublic?: boolean;
  category?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  nodeId: string;
  workflowId: string;
  nodeType: "tool" | "agent_processor" | "input" | "output";
  config: {
    toolName?: string;
    inputs?: Record<string, any>;
    outputs?: Record<string, any>;
    position?: { x: number; y: number };
  };
  position: number;
  createdAt: string;
}

export interface WorkflowEdge {
  edgeId: string;
  workflowId: string;
  fromNodeId: string;
  toNodeId: string;
  dataMapping: Record<string, string>;
  createdAt: string;
}

export interface WorkflowExecution {
  executionId: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  startedAt: string;
  completedAt?: string;
  /** Final workflow output — from execute API response */
  result?: any;
  /** Final workflow output — from SSE stream (same value, different field name) */
  outputData?: any;
  /** Execution error — from execute API response */
  error?: string;
  /** Execution error — from SSE stream */
  errorMessage?: string;
  /** Per-node results — from execute API response */
  stepResults?: Record<string, any>;
  /** Per-node results — from SSE stream */
  nodeResults?: Record<string, any>;
  /** Currently executing node ID */
  currentNode?: string;
  /** Node ID where workflow is paused awaiting approval */
  pausedAtNode?: string;
  /** Token required to approve/reject a paused step */
  approvalToken?: string;
}

// React Flow types
export interface ReactFlowNode {
  id: string;
  type: "tool" | "input" | "output";
  position: { x: number; y: number };
  data: {
    label: string;
    toolId?: string;
    toolName?: string;
    inputs?: Array<{ name: string; type: WorkflowDataType; required?: boolean }>;
    outputs?: Array<{ name: string; type: WorkflowDataType }>;
    nodeType?: "tool" | "agent_processor" | "input" | "output";
    config?: Record<string, any>;
  };
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: "colored";
  data: {
    dataType: string;
    color: string;
  };
}

export interface WorkflowWithDetails extends Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
