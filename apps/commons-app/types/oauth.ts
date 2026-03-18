// types/oauth.ts

// OAuth Provider
export interface OAuthProvider {
  providerId: string;
  providerKey: string; // 'google_workspace', 'github', etc.
  displayName: string;
  description: string;
  logoUrl: string;
  defaultScopes: string[];
  isActive: boolean;
  isPlatform: boolean;
}

export interface OAuthProviderDetails extends OAuthProvider {
  authUrl: string;
  scopeGroups: Record<string, string[]>; // { default: [...], classroom: [...] }
  authorizationParams: Record<string, any>;
}

// OAuth Connection
export enum OAuthConnectionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  ERROR = 'error',
}

export interface OAuthConnection {
  connectionId: string;
  ownerId: string;
  ownerType: 'user' | 'agent';
  providerKey: string;
  providerDisplayName: string;
  providerLogoUrl: string;
  providerUserEmail: string;
  providerUserName: string;
  scopes: string[];
  status: OAuthConnectionStatus;
  displayName?: string;
  description?: string;
  accessTokenExpiresAt: Date | string;
  lastRefreshedAt?: Date | string;
  lastUsedAt?: Date | string;
  usageCount: number;
  lastError?: string;
  lastErrorAt?: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// API Request/Response Types

export interface InitiateOAuthFlowRequest {
  providerKey: string;
  scopes?: string[];
  redirectUri?: string;
}

export interface InitiateOAuthFlowResponse {
  authorizationUrl: string;
  state: string;
  expiresAt: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  connectionId?: string;
  providerKey?: string;
  providerUserEmail?: string;
  scopes?: string[];
  error?: string;
  redirectUrl?: string;
}

export interface ListOAuthProvidersResponse {
  providers: OAuthProvider[];
}

export interface GetOAuthProviderResponse {
  provider: OAuthProviderDetails;
}

export interface ListOAuthConnectionsResponse {
  connections: OAuthConnection[];
}

export interface GetOAuthConnectionResponse {
  connection: OAuthConnection;
}

export interface UpdateOAuthConnectionRequest {
  displayName?: string;
  description?: string;
}

export interface UpdateOAuthConnectionResponse {
  success: boolean;
  connection: OAuthConnection;
}

export interface RefreshOAuthTokenResponse {
  success: boolean;
  connectionId: string;
  accessTokenExpiresAt: string;
  lastRefreshedAt: string;
}

export interface RevokeOAuthConnectionResponse {
  success: boolean;
  connectionId: string;
  message: string;
}

export interface TestOAuthConnectionResponse {
  success: boolean;
  connectionId: string;
  status: OAuthConnectionStatus;
  providerUserEmail?: string;
  accessTokenValid: boolean;
  accessTokenExpiresAt: string;
  error?: string;
}
