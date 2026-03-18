/**
 * A2A (Agent-to-Agent) Protocol Types
 * Spec: https://google.github.io/A2A/specification/
 * Version: 2025-05-16
 */

// ── Message Parts ──────────────────────────────────────────────────────────

export interface TextPart {
  type: 'text';
  text: string;
  metadata?: Record<string, any>;
}

export interface DataPart {
  type: 'data';
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface FilePart {
  type: 'file';
  file: {
    name?: string;
    mimeType?: string;
    /** Inline base64-encoded bytes */
    bytes?: string;
    /** External URI */
    uri?: string;
  };
  metadata?: Record<string, any>;
}

export type MessagePart = TextPart | DataPart | FilePart;

// ── Message ────────────────────────────────────────────────────────────────

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: MessagePart[];
  /** Context groups related messages and tasks in the same session */
  contextId?: string;
  messageId?: string;
  taskId?: string;
  /** Metadata visible to the agent */
  metadata?: Record<string, any>;
}

// ── Task ──────────────────────────────────────────────────────────────────

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface A2ATaskStatus {
  state: A2ATaskState;
  message?: A2AMessage;
  timestamp?: string;
}

export interface A2AArtifact {
  artifactId?: string;
  name?: string;
  description?: string;
  parts: MessagePart[];
  index?: number;
  append?: boolean;
  lastChunk?: boolean;
  metadata?: Record<string, any>;
}

export interface A2ATask {
  id: string;
  contextId?: string;
  status: A2ATaskStatus;
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
  metadata?: Record<string, any>;
}

export interface A2ATaskError {
  code: number;
  message: string;
  data?: any;
}

// ── Push Notifications ────────────────────────────────────────────────────

export interface PushNotificationConfig {
  url: string;
  id?: string;
  token?: string;
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
}

// ── JSON-RPC ──────────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

// Standard JSON-RPC error codes
export const RPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  // A2A-specific
  TASK_NOT_FOUND: { code: -32001, message: 'Task not found' },
  TASK_NOT_CANCELABLE: { code: -32002, message: 'Task not cancelable' },
  PUSH_NOTIFICATION_NOT_SUPPORTED: { code: -32003, message: 'Push Notification is not supported' },
  UNSUPPORTED_OPERATION: { code: -32004, message: 'This operation is not supported' },
  INCOMPATIBLE_CONTENT_TYPES: { code: -32005, message: 'Incompatible content types' },
} as const;

// ── Agent Card ────────────────────────────────────────────────────────────

export interface A2ASkill {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
}

export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  iconUrl?: string;
  version: string;
  documentationUrl?: string;
  capabilities: AgentCapabilities;
  authentication?: {
    schemes: string[];
    credentials?: string;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
  supportsAuthenticatedExtendedCard?: boolean;
}

// ── tasks/send params ─────────────────────────────────────────────────────

export interface TasksSendParams {
  id?: string;
  sessionId?: string;
  message: A2AMessage;
  historyLength?: number;
  pushNotification?: PushNotificationConfig;
  metadata?: Record<string, any>;
}

export interface TasksGetParams {
  id: string;
  historyLength?: number;
}

export interface TasksCancelParams {
  id: string;
}

export interface TasksSendSubscribeParams extends TasksSendParams {}
