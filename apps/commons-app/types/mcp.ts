// MCP (Model Context Protocol) types matching backend schema

export type ConnectionType = "stdio" | "sse";
export type ServerStatus = "connected" | "disconnected" | "error";

export interface StdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SseConfig {
  url: string;
}

export type ConnectionConfig = StdioConfig | SseConfig;

export interface McpServer {
  serverId: string;
  name: string;
  description: string | null;
  connectionType: ConnectionType;
  connectionConfig: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  status: ServerStatus;
  lastError: string | null;
  lastConnectedAt: Date | null;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  } | null;
  toolsCount: number;
  lastSyncedAt: Date | null;
  isPublic: boolean;
  tags: string[] | null;
  ownerId: string;
  ownerType: "user" | "agent";
  createdAt: Date;
  updatedAt: Date;
}

export interface McpTool {
  mcpToolId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  displayName: string | null;
  description: string | null;
  inputSchema: {
    type: "object";
    properties?: Record<string, any>;
    required?: string[];
  };
  isActive: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpConnectionStatus {
  connected: boolean;
  capabilities: string[];
  toolsDiscovered: number;
  lastConnectedAt: Date | null;
  lastError: string | null;
}

export interface McpSyncResult {
  success: boolean;
  toolsDiscovered: number;
  toolsAdded: number;
  toolsUpdated: number;
  toolsRemoved: number;
  syncedAt: Date;
  error?: string;
}

export interface CreateMcpServerRequest {
  name: string;
  description?: string;
  connectionType: ConnectionType;
  connectionConfig: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  isPublic?: boolean;
  tags?: string[];
}

export interface UpdateMcpServerRequest {
  name?: string;
  description?: string;
  connectionConfig?: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  isPublic?: boolean;
  tags?: string[];
}
