// Extended tool types for comprehensive tool management

export interface Tool {
  toolId: string;
  name: string;
  displayName?: string;
  description?: string;
  schema: any; // ChatCompletionTool format
  apiSpec?: ToolApiSpec;
  visibility: 'public' | 'private' | 'platform';
  ownerId?: string;
  ownerType?: 'user' | 'agent' | 'platform';
  tags?: string[];
  rating?: number;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ToolApiSpec {
  baseUrl: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: any;
  authType?: 'none' | 'bearer' | 'api-key' | 'basic' | 'oauth2';
  authKeyName?: string;
}

export interface ToolKey {
  keyId: string;
  keyName: string;
  displayName?: string;
  description?: string;
  maskedValue?: string;
  ownerId: string;
  ownerType: 'user' | 'agent';
  toolId?: string;
  keyType?: 'api-key' | 'bearer-token' | 'oauth-token' | 'secret';
  isActive: boolean;
  usageCount?: number;
  lastUsedAt?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface ToolPermission {
  id: string;
  toolId: string;
  subjectId: string;
  subjectType: 'user' | 'agent';
  permission: 'read' | 'execute' | 'admin';
  grantedBy?: string;
  createdAt?: string;
  expiresAt?: string;
}

export interface AccessListEntry {
  id: string;
  walletAddress: string;
  type: 'user' | 'agent';
  permission: 'read' | 'execute' | 'admin';
  grantedAt?: string;
  expiresAt?: string;
}
