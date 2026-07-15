import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthConnectionService } from './oauth-connection.service';
import { OAuthStateService } from './oauth-state.service';

type ProviderRuntimeConfig = {
  scopeDelimiter?: string;
  pkce?: boolean;
  tokenClientAuth?: 'body' | 'basic';
  omitAuthorizationCodeGrantType?: boolean;
  revokeRefreshToken?: boolean;
  includeClientCredentialsOnRevoke?: boolean;
};

type ProviderTokenSet = {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  scope?: string | string[];
};

type ProviderUserIdentity = {
  id?: string;
  email?: string;
  name?: string;
};

function providerRuntimeConfig(providerKey: string): ProviderRuntimeConfig {
  switch (providerKey) {
    case 'canva':
      return {
        pkce: true,
        revokeRefreshToken: true,
        includeClientCredentialsOnRevoke: true,
      };
    case 'slack':
      return {
        scopeDelimiter: ',',
        omitAuthorizationCodeGrantType: true,
      };
    case 'x':
    case 'twitter':
      return {
        pkce: true,
        tokenClientAuth: 'basic',
        revokeRefreshToken: true,
        includeClientCredentialsOnRevoke: true,
      };
    default:
      return {};
  }
}

function parseScopes(scopes?: string | string[]) {
  if (Array.isArray(scopes)) return scopes;
  if (!scopes) return [];
  return scopes
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function extractTokenSet(providerKey: string, payload: any): ProviderTokenSet {
  if (providerKey === 'slack') {
    if (payload?.ok === false) {
      throw new Error(payload.error || 'Slack OAuth token exchange failed');
    }

    const authedUser = payload?.authed_user;
    return {
      accessToken: payload?.access_token || authedUser?.access_token,
      refreshToken: payload?.refresh_token || authedUser?.refresh_token,
      expiresIn: payload?.expires_in || authedUser?.expires_in,
      scope: payload?.scope || authedUser?.scope,
    };
  }

  return {
    accessToken: payload?.access_token,
    refreshToken: payload?.refresh_token,
    idToken: payload?.id_token,
    expiresIn: payload?.expires_in,
    scope: payload?.scope,
  };
}

function extractProviderUserIdentity(
  providerKey: string,
  userInfo: any,
  tokenPayload: any,
): ProviderUserIdentity {
  if (providerKey === 'slack') {
    return {
      id:
        userInfo?.user_id ||
        userInfo?.bot_id ||
        tokenPayload?.authed_user?.id ||
        tokenPayload?.bot_user_id,
      name: userInfo?.user || userInfo?.team || tokenPayload?.team?.name,
    };
  }

  if (providerKey === 'canva') {
    return {
      id: userInfo?.user?.id || userInfo?.profile?.id,
      email: userInfo?.user?.email || userInfo?.profile?.email,
      name: userInfo?.profile?.display_name || userInfo?.user?.display_name,
    };
  }

  if (providerKey === 'x' || providerKey === 'twitter') {
    return {
      id: userInfo?.data?.id,
      name: userInfo?.data?.username || userInfo?.data?.name,
    };
  }

  return {
    id: userInfo?.id || userInfo?.sub,
    email: userInfo?.email,
    name: userInfo?.name || userInfo?.login,
  };
}

/**
 * OAuthFlowService
 *
 * Orchestrates OAuth 2.0 authorization code flows.
 * Handles initiation, callback, token refresh, and revocation.
 *
 * Key features:
 * - Generate authorization URLs with CSRF protection
 * - Exchange authorization codes for tokens
 * - Automatic token refresh
 * - Token revocation
 * - User info fetching
 */
@Injectable()
export class OAuthFlowService {
  private readonly logger = new Logger(OAuthFlowService.name);

  constructor(
    private readonly providerService: OAuthProviderService,
    private readonly connectionService: OAuthConnectionService,
    private readonly stateService: OAuthStateService,
  ) {}

  /**
   * Initiate OAuth flow (generate authorization URL)
   *
   * @param params - Flow parameters
   * @returns Authorization URL and state ID
   */
  async initiateFlow(params: {
    userId: string; // Wallet address
    providerKey: string; // 'google_workspace', 'github', etc.
    requestedScopes?: string[]; // Optional: specific scopes to request
    scopeGroups?: string[]; // Optional: scope groups (e.g., ['classroom', 'drive'])
    redirectUri: string; // Where provider should redirect after authorization
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    try {
      // Get provider configuration
      const provider = await this.providerService.getProvider(
        params.providerKey,
      );

      if (!provider.isActive) {
        throw new BadRequestException(
          `Provider ${params.providerKey} is not active`,
        );
      }

      // Determine scopes to request
      let scopes: string[];

      if (params.requestedScopes && params.requestedScopes.length > 0) {
        // Use explicitly requested scopes
        scopes = params.requestedScopes;
      } else if (params.scopeGroups && params.scopeGroups.length > 0) {
        // Use scope groups
        scopes = await this.providerService.getProviderScopes(
          params.providerKey,
          params.scopeGroups,
        );
      } else {
        // Use default scopes
        const providerScopes = provider.scopes as Record<string, string[]>;
        scopes = providerScopes.default || [];
      }

      // Create state for CSRF protection
      const runtimeConfig = providerRuntimeConfig(provider.providerKey);
      const codeVerifier = runtimeConfig.pkce
        ? this.stateService.generateCodeVerifier()
        : undefined;
      const state = await this.stateService.createState({
        ownerId: params.userId,
        providerId: provider.providerId,
        redirectUri: params.redirectUri,
        requestedScopes: scopes,
        codeVerifier,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      // Build authorization URL
      const authUrl = new URL(provider.authUrl);

      // Standard OAuth 2.0 parameters
      authUrl.searchParams.append('client_id', provider.clientId);
      authUrl.searchParams.append('redirect_uri', params.redirectUri);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('state', state.stateId);
      if (scopes.length > 0) {
        authUrl.searchParams.append(
          'scope',
          scopes.join(runtimeConfig.scopeDelimiter || ' '),
        );
      }

      if (runtimeConfig.pkce && codeVerifier) {
        const codeChallenge =
          await this.stateService.generateCodeChallenge(codeVerifier);
        authUrl.searchParams.append('code_challenge', codeChallenge);
        authUrl.searchParams.append('code_challenge_method', 'S256');
      }

      // Add provider-specific authorization parameters
      const authParams = provider.authorizationParams as Record<string, any>;
      if (authParams) {
        Object.entries(authParams).forEach(([key, value]) => {
          authUrl.searchParams.append(key, String(value));
        });
      }

      // Google incremental authorization: without this, re-consenting for one
      // product (e.g. Calendar) issues a token limited to the newly requested
      // scopes and silently drops previously granted ones (e.g. Gmail),
      // because we keep a single connection per user per provider.
      if (
        authUrl.hostname.endsWith('google.com') &&
        !authUrl.searchParams.has('include_granted_scopes')
      ) {
        authUrl.searchParams.append('include_granted_scopes', 'true');
      }

      this.logger.log(
        `Initiated OAuth flow for user ${params.userId} with provider ${params.providerKey}`,
      );

      return {
        authorizationUrl: authUrl.toString(),
        state: state.stateId,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to initiate OAuth flow: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Handle OAuth callback (exchange code for tokens)
   *
   * @param params - Callback parameters
   * @returns Connection info
   */
  async handleCallback(params: {
    code: string; // Authorization code from provider
    state: string; // State parameter for CSRF validation
    redirectUri: string; // Must match the redirect_uri used in initiate
  }): Promise<{
    connectionId: string;
    userId: string;
    providerKey: string;
  }> {
    try {
      // Validate state (CSRF check)
      const stateRecord = await this.stateService.getState(params.state);

      if (!stateRecord) {
        throw new BadRequestException('Invalid or expired state parameter');
      }
      const redirectUri = stateRecord.redirectUri || params.redirectUri;

      // Get provider configuration
      const provider = await this.providerService.getProviderById(
        stateRecord.providerId,
      );
      const runtimeConfig = providerRuntimeConfig(provider.providerKey);

      // Get decrypted client secret
      const clientSecret =
        await this.providerService.getDecryptedClientSecret(provider.providerId);

      // Exchange authorization code for tokens
      const tokenParams = new URLSearchParams({
        code: params.code,
        redirect_uri: redirectUri,
      });

      // For Basic-authenticated confidential clients the identity is already
      // in the header; X omits both client fields from the form body.
      if (runtimeConfig.tokenClientAuth !== 'basic') {
        tokenParams.append('client_id', provider.clientId);
        tokenParams.append('client_secret', clientSecret);
      }

      if (!runtimeConfig.omitAuthorizationCodeGrantType) {
        tokenParams.append('grant_type', 'authorization_code');
      }

      if (runtimeConfig.pkce && stateRecord.codeVerifier) {
        tokenParams.append('code_verifier', stateRecord.codeVerifier);
      }

      // Add provider-specific token parameters
      const providerTokenParams = provider.tokenParams as Record<string, any>;
      if (providerTokenParams) {
        Object.entries(providerTokenParams).forEach(([key, value]) => {
          tokenParams.append(key, String(value));
        });
      }

      // Request tokens from provider
      const tokenResponse = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...(runtimeConfig.tokenClientAuth === 'basic'
            ? {
                Authorization: `Basic ${Buffer.from(
                  `${provider.clientId}:${clientSecret}`,
                ).toString('base64')}`,
              }
            : {}),
        },
        body: tokenParams.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        this.logger.error(
          `Token exchange failed: ${tokenResponse.status} ${errorText}`,
        );
        throw new Error(
          `Token exchange failed: ${tokenResponse.statusText}`,
        );
      }

      const tokens: any = await tokenResponse.json();
      const tokenSet = extractTokenSet(provider.providerKey, tokens);

      if (!tokenSet.accessToken) {
        throw new Error('No access token received from provider');
      }

      if (!tokenSet.refreshToken) {
        this.logger.warn(
          'No refresh token received - long-term access may not be possible',
        );
      }

      // Calculate access token expiry
      let accessTokenExpiresAt: Date | undefined;
      if (tokenSet.expiresIn) {
        accessTokenExpiresAt = new Date(
          Date.now() + tokenSet.expiresIn * 1000,
        );
      }

      // Fetch user info from provider (if supported)
      let providerUserInfo: any = null;
      if (provider.userInfoUrl && tokenSet.accessToken) {
        try {
          const userInfoResponse = await fetch(provider.userInfoUrl, {
            headers: {
              Authorization: `Bearer ${tokenSet.accessToken}`,
            },
          });

          if (userInfoResponse.ok) {
            providerUserInfo = await userInfoResponse.json();
          }
        } catch (error) {
          this.logger.warn(
            `Failed to fetch user info from provider: ${error}`,
          );
        }
      }

      // Parse scopes (handle both string and array formats)
      let grantedScopes: string[];
      if (tokenSet.scope) {
        grantedScopes = parseScopes(tokenSet.scope);
      } else {
        grantedScopes = stateRecord.requestedScopes;
      }
      const providerUserIdentity = extractProviderUserIdentity(
        provider.providerKey,
        providerUserInfo,
        tokens,
      );

      // Store connection
      const connection = await this.connectionService.createConnection({
        ownerId: stateRecord.ownerId,
        ownerType: 'user',
        providerId: provider.providerId,
        accessToken: tokenSet.accessToken,
        accessTokenExpiresAt,
        refreshToken: tokenSet.refreshToken || '',
        idToken: tokenSet.idToken,
        scopes: grantedScopes,
        providerUserId: providerUserIdentity.id,
        providerUserEmail: providerUserIdentity.email,
        providerUserName: providerUserIdentity.name,
        providerMetadata: providerUserInfo,
      });

      // Delete state (one-time use)
      await this.stateService.deleteState(params.state);

      this.logger.log(
        `Completed OAuth flow for user ${stateRecord.ownerId} with provider ${provider.providerKey}`,
      );

      return {
        connectionId: connection.connectionId,
        userId: stateRecord.ownerId,
        providerKey: provider.providerKey,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to handle OAuth callback: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param connectionId - Connection UUID
   * @returns New access token and expiry
   */
  async refreshAccessToken(connectionId: string): Promise<{
    accessToken: string;
    expiresAt?: Date;
  }> {
    try {
      // Get connection and verify it's active
      const connection =
        await this.connectionService.getConnection(connectionId);

      if (connection.status !== 'active') {
        throw new Error(
          `Connection is not active (status: ${connection.status})`,
        );
      }

      // Get provider configuration
      const provider = await this.providerService.getProviderById(
        connection.providerId,
      );
      const runtimeConfig = providerRuntimeConfig(provider.providerKey);

      // Get decrypted tokens
      const tokens =
        await this.connectionService.getDecryptedTokens(connectionId);

      if (!tokens.refreshToken) {
        throw new Error('No refresh token available for this connection');
      }

      // Get decrypted client secret
      const clientSecret =
        await this.providerService.getDecryptedClientSecret(provider.providerId);

      // Request new access token using refresh token
      const tokenParams = new URLSearchParams({
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      });

      if (runtimeConfig.tokenClientAuth !== 'basic') {
        tokenParams.append('client_id', provider.clientId);
        tokenParams.append('client_secret', clientSecret);
      }

      // Add provider-specific token parameters
      const providerTokenParams = provider.tokenParams as Record<string, any>;
      if (providerTokenParams) {
        Object.entries(providerTokenParams).forEach(([key, value]) => {
          tokenParams.append(key, String(value));
        });
      }

      const tokenResponse = await fetch(provider.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...(runtimeConfig.tokenClientAuth === 'basic'
            ? {
                Authorization: `Basic ${Buffer.from(
                  `${provider.clientId}:${clientSecret}`,
                ).toString('base64')}`,
              }
            : {}),
        },
        body: tokenParams.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        this.logger.error(
          `Token refresh failed for connection ${connectionId}: ${tokenResponse.status} ${errorText}`,
        );

        // Record error in connection
        await this.connectionService.recordError(
          connectionId,
          `Token refresh failed: ${tokenResponse.statusText}`,
        );

        throw new Error(
          `Token refresh failed: ${tokenResponse.statusText}`,
        );
      }

      const newTokens: any = await tokenResponse.json();
      const newTokenSet = extractTokenSet(provider.providerKey, newTokens);

      if (!newTokenSet.accessToken) {
        throw new Error('No access token received from token refresh');
      }

      // Calculate access token expiry
      let accessTokenExpiresAt: Date | undefined;
      if (newTokenSet.expiresIn) {
        accessTokenExpiresAt = new Date(
          Date.now() + newTokenSet.expiresIn * 1000,
        );
      }

      // Update connection with new tokens
      // Note: Some providers return new refresh tokens, some don't
      await this.connectionService.updateConnectionTokens(connectionId, {
        accessToken: newTokenSet.accessToken,
        accessTokenExpiresAt,
        refreshToken: newTokenSet.refreshToken, // May be undefined
        idToken: newTokenSet.idToken, // May be undefined
      });

      this.logger.log(`Refreshed access token for connection ${connectionId}`);

      return {
        accessToken: newTokenSet.accessToken,
        expiresAt: accessTokenExpiresAt,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to refresh access token for connection ${connectionId}: ${error.message}`,
      );

      // Record error in connection
      await this.connectionService.recordError(
        connectionId,
        `Token refresh failed: ${error.message}`,
      );

      throw error;
    }
  }

  /**
   * Revoke OAuth token and delete connection
   *
   * @param connectionId - Connection UUID
   */
  async revokeToken(connectionId: string): Promise<void> {
    try {
      // Get connection
      const connection =
        await this.connectionService.getConnection(connectionId);

      // Get provider configuration
      const provider = await this.providerService.getProviderById(
        connection.providerId,
      );

      // If provider supports token revocation, call revoke endpoint
      if (provider.revokeUrl) {
        try {
          // Get decrypted tokens
          const tokens =
            await this.connectionService.getDecryptedTokens(connectionId);
          const runtimeConfig = providerRuntimeConfig(provider.providerKey);

          // Revoke access token
          const revokeParams = new URLSearchParams({
            token:
              runtimeConfig.revokeRefreshToken && tokens.refreshToken
                ? tokens.refreshToken
                : tokens.accessToken,
          });

          let revokeAuthorization: string | undefined;
          if (runtimeConfig.includeClientCredentialsOnRevoke) {
            const clientSecret =
              await this.providerService.getDecryptedClientSecret(
                provider.providerId,
              );
            if (runtimeConfig.tokenClientAuth === 'basic') {
              revokeAuthorization = `Basic ${Buffer.from(
                `${provider.clientId}:${clientSecret}`,
              ).toString('base64')}`;
            } else {
              revokeParams.append('client_id', provider.clientId);
              revokeParams.append('client_secret', clientSecret);
            }
          }

          const revokeResponse = await fetch(provider.revokeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              ...(revokeAuthorization
                ? { Authorization: revokeAuthorization }
                : {}),
            },
            body: revokeParams.toString(),
          });

          if (!revokeResponse.ok) {
            this.logger.warn(
              `Failed to revoke token at provider: ${revokeResponse.statusText}`,
            );
          } else {
            this.logger.log(
              `Revoked token at provider for connection ${connectionId}`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Error revoking token at provider: ${error}`,
          );
          // Continue with local deletion even if remote revocation fails
        }
      }

      // Delete connection from database
      await this.connectionService.deleteConnection(connectionId);

      this.logger.log(
        `Revoked and deleted connection ${connectionId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to revoke token for connection ${connectionId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Validate that a connection's access token is valid
   *
   * @param connectionId - Connection UUID
   * @returns True if token is valid and not expired
   */
  async validateToken(connectionId: string): Promise<boolean> {
    try {
      const connection =
        await this.connectionService.getConnection(connectionId);

      // Check if connection is active
      if (connection.status !== 'active') {
        return false;
      }

      // Check if token is expired
      if (connection.accessTokenExpiresAt) {
        const now = new Date();
        if (now > new Date(connection.accessTokenExpiresAt)) {
          return false;
        }
      }

      // Optionally: Make a lightweight API call to verify token works
      // For now, just check expiry and status
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to validate token for connection ${connectionId}: ${error}`,
      );
      return false;
    }
  }

  /**
   * Get fresh access token (auto-refresh if needed)
   *
   * @param connectionId - Connection UUID
   * @returns Fresh access token
   */
  async getFreshAccessToken(connectionId: string): Promise<string> {
    // Check if token needs refresh
    const needsRefresh =
      await this.connectionService.needsRefresh(connectionId);

    if (needsRefresh) {
      this.logger.debug(
        `Access token for connection ${connectionId} needs refresh`,
      );
      const refreshed = await this.refreshAccessToken(connectionId);
      return refreshed.accessToken;
    }

    // Token is still valid, return it
    const tokens =
      await this.connectionService.getDecryptedTokens(connectionId);
    return tokens.accessToken;
  }
}
