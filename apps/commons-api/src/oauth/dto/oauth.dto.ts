import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsEnum,
  IsBoolean,
  IsUrl,
} from 'class-validator';

// ==================== Initiate OAuth Flow ====================

export class InitiateOAuthFlowDto {
  @IsString()
  providerKey!: string; // 'google_workspace', 'github', etc.

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[]; // Custom scopes (optional, uses provider defaults)

  @IsUrl()
  @IsOptional()
  redirectUri?: string; // Custom redirect URI (optional)
}

export interface InitiateOAuthFlowResponseDto {
  authorizationUrl: string;
  state: string;
  expiresAt: Date;
}

// ==================== OAuth Callback ====================

export class OAuthCallbackQueryDto {
  @IsString()
  code!: string; // Authorization code from provider

  @IsString()
  state!: string; // CSRF token

  @IsString()
  @IsOptional()
  error?: string; // Error from provider (optional)

  @IsString()
  @IsOptional()
  error_description?: string; // Error description (optional)
}

export interface OAuthCallbackResponseDto {
  success: boolean;
  connectionId?: string;
  providerKey?: string;
  providerUserEmail?: string;
  scopes?: string[];
  error?: string;
  redirectUrl?: string; // Frontend redirect URL
}

// ==================== List Providers ====================

export interface OAuthProviderDto {
  providerId: string;
  providerKey: string;
  displayName: string;
  description: string;
  logoUrl: string;
  defaultScopes: string[];
  isActive: boolean;
  isPlatform: boolean;
}

export interface ListOAuthProvidersResponseDto {
  providers: OAuthProviderDto[];
}

// ==================== Connection Management ====================

export enum OAuthConnectionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  ERROR = 'error',
}

export interface OAuthConnectionDto {
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
  accessTokenExpiresAt: Date;
  lastRefreshedAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
  lastError?: string;
  lastErrorAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListOAuthConnectionsResponseDto {
  connections: OAuthConnectionDto[];
}

export interface GetOAuthConnectionResponseDto {
  connection: OAuthConnectionDto;
}

// ==================== Refresh Token ====================

export interface RefreshOAuthTokenResponseDto {
  success: boolean;
  connectionId: string;
  accessTokenExpiresAt: Date;
  lastRefreshedAt: Date;
}

// ==================== Revoke Connection ====================

export interface RevokeOAuthConnectionResponseDto {
  success: boolean;
  connectionId: string;
  message: string;
}

// ==================== Test Connection ====================

export interface TestOAuthConnectionResponseDto {
  success: boolean;
  connectionId: string;
  status: OAuthConnectionStatus;
  providerUserEmail?: string;
  accessTokenValid: boolean;
  accessTokenExpiresAt: Date;
  error?: string;
}

// ==================== Update Connection ====================

export class UpdateOAuthConnectionDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export interface UpdateOAuthConnectionResponseDto {
  success: boolean;
  connection: OAuthConnectionDto;
}

// ==================== Provider Details ====================

export interface GetOAuthProviderResponseDto {
  provider: OAuthProviderDto & {
    authUrl: string;
    scopeGroups: Record<string, string[]>; // { default: [...], classroom: [...] }
    authorizationParams: Record<string, any>;
  };
}
