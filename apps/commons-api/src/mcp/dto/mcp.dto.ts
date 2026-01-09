import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsBoolean,
  IsArray,
  IsUrl,
  IsInt,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

/* ─────────────────────────  REQUEST DTOs  ───────────────────────── */

/**
 * DTO for creating a new MCP server connection
 */
export class CreateMcpServerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['stdio', 'sse'])
  connectionType!: 'stdio' | 'sse';

  @IsObject()
  connectionConfig!: {
    // For stdio connections
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    // For SSE connections
    url?: string;
  };

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

/**
 * DTO for updating an existing MCP server
 */
export class UpdateMcpServerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  connectionConfig?: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

/**
 * DTO for syncing tools from an MCP server
 */
export class SyncMcpToolsDto {
  @IsBoolean()
  @IsOptional()
  forceRefresh?: boolean; // Force refresh even if recently synced
}

/* ─────────────────────────  RESPONSE DTOs  ───────────────────────── */

/**
 * Response DTO for MCP server
 */
export interface McpServerResponseDto {
  serverId: string;
  name: string;
  description: string | null;
  connectionType: 'stdio' | 'sse';
  connectionConfig: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  status: 'connected' | 'disconnected' | 'error';
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
  ownerType: 'user' | 'agent';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response DTO for MCP tool
 */
export interface McpToolResponseDto {
  mcpToolId: string;
  serverId: string;
  serverName: string;
  toolName: string;
  displayName: string | null;
  description: string | null;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
  isActive: boolean;
  usageCount: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response DTO for MCP server connection status
 */
export interface McpStatusResponseDto {
  connected: boolean;
  capabilities: string[];
  toolsDiscovered: number;
  lastConnectedAt: Date | null;
  lastError: string | null;
}

/**
 * Response DTO for sync operation
 */
export interface McpSyncResponseDto {
  success: boolean;
  toolsDiscovered: number;
  toolsAdded: number;
  toolsUpdated: number;
  toolsRemoved: number;
  syncedAt: Date;
  error?: string;
}

/**
 * Response DTO for server list
 */
export interface McpServerListResponseDto {
  servers: McpServerResponseDto[];
  total: number;
}

/**
 * Response DTO for tool list
 */
export interface McpToolListResponseDto {
  tools: McpToolResponseDto[];
  total: number;
}

/**
 * Response DTO for marketplace templates
 */
export interface McpMarketplaceTemplateDto {
  id: string;
  name: string;
  description: string;
  providerKey: string; // e.g., 'github', 'slack', 'linear'
  logoUrl?: string;
  category: string;
  tags: string[];
  connectionType: 'stdio' | 'sse';
  configTemplate: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
  };
  setupInstructions: string;
  isPopular: boolean;
  usageCount?: number;
}
