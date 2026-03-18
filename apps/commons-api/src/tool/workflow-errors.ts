/**
 * Typed error classes for the workflow execution engine.
 * These replace bare string errors and allow callers to inspect
 * exactly which node/tool failed and whether retry is appropriate.
 */

export class WorkflowNodeError extends Error {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly retryable: boolean;

  constructor(params: {
    nodeId: string;
    nodeType: string;
    message: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'WorkflowNodeError';
    this.nodeId = params.nodeId;
    this.nodeType = params.nodeType;
    this.retryable = params.retryable ?? false;
    if (params.cause) {
      this.cause = params.cause;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      nodeId: this.nodeId,
      nodeType: this.nodeType,
      retryable: this.retryable,
    };
  }
}

export class ToolExecutionError extends Error {
  readonly toolName: string;
  readonly toolId?: string;
  readonly nodeId?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(params: {
    toolName: string;
    toolId?: string;
    nodeId?: string;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'ToolExecutionError';
    this.toolName = params.toolName;
    this.toolId = params.toolId;
    this.nodeId = params.nodeId;
    this.statusCode = params.statusCode;
    // Treat 5xx errors and timeouts as retryable; 4xx as non-retryable
    this.retryable =
      params.retryable ??
      (params.statusCode !== undefined ? params.statusCode >= 500 : false);
    if (params.cause) {
      this.cause = params.cause;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      toolName: this.toolName,
      toolId: this.toolId,
      nodeId: this.nodeId,
      statusCode: this.statusCode,
      retryable: this.retryable,
    };
  }
}

export class AgentProcessorError extends Error {
  readonly nodeId: string;
  readonly agentId: string;
  readonly retryable: boolean;

  constructor(params: {
    nodeId: string;
    agentId: string;
    message: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = 'AgentProcessorError';
    this.nodeId = params.nodeId;
    this.agentId = params.agentId;
    this.retryable = params.retryable ?? true; // agent errors are usually transient
    if (params.cause) {
      this.cause = params.cause;
    }
  }
}
