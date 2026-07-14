import { WorkflowDataType } from "@/lib/workflows/type-mapping";

export interface WorkflowPortDefinition {
  name: string;
  /** Runtime path inside the node value. Defaults to name. */
  path?: string;
  type: WorkflowDataType;
  required?: boolean;
  description?: string;
  schema?: Record<string, any>;
  properties?: Record<string, any>;
  items?: WorkflowDataType;
  /** User-created ports are persisted with the workflow definition. */
  custom?: boolean;
}

export type WorkflowArchitecture =
  | "sequential"
  | "hierarchical"
  | "peer_to_peer"
  | "hybrid";

export interface AgentCoordinationConfig {
  architecture?: WorkflowArchitecture;
  role?: "orchestrator" | "supervisor" | "specialist" | "reviewer" | "peer";
  reportsTo?: string;
  peerNodeIds?: string[];
  handoffPolicy?: "automatic" | "on_success" | "manual";
  contextPolicy?: "shared" | "summary" | "isolated";
  sessionPolicy?: "workflow" | "agent" | "new_each_run";
  checkIn?: "never" | "before_handoff" | "after_step";
}

export type WorkflowNodeType =
  | "tool"
  | "agent_processor"
  | "workflow"
  | "input"
  | "output"
  | "condition"
  | "transform"
  | "loop"
  | "human_approval";

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
  nodeType: WorkflowNodeType;
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
  type: WorkflowNodeType;
  position: { x: number; y: number };
  /** Set by React Flow when the node is selected on the canvas */
  selected?: boolean;
  data: {
    label: string;
    toolId?: string;
    toolName?: string;
    agentId?: string;
    agentAvatar?: string;
    workflowId?: string;
    description?: string;
    icon?: string;
    accent?: string;
    inputs?: WorkflowPortDefinition[];
    outputs?: WorkflowPortDefinition[];
    nodeType?: WorkflowNodeType;
    config?: Record<string, any>;
    schema?: any;
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
    mapping?: Record<string, string>;
    /** Target types drive safe runtime coercion for dynamic/`any` values. */
    targetTypes?: Record<string, WorkflowDataType>;
    mappingMode?: "exact" | "dynamic" | "coerce";
  };
}

export interface WorkflowWithDetails extends Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
