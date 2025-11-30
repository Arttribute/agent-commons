export interface Workflow {
  workflowId: string;
  name: string;
  description?: string;
  ownerId: string;
  ownerType: "user" | "agent";
  isActive: boolean;
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
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
  stepResults?: Record<string, any>;
}

// React Flow types
export interface ReactFlowNode {
  id: string;
  type: "tool" | "input" | "output";
  position: { x: number; y: number };
  data: {
    label: string;
    toolName?: string;
    inputs?: Array<{ name: string; type: string; required?: boolean }>;
    outputs?: Array<{ name: string; type: string }>;
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
