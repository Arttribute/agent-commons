import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OAuthConnectionService } from './oauth-connection.service';
import { OAuthFlowService } from './oauth-flow.service';

/**
 * OAuthTokenInjectionService
 *
 * Automatically injects OAuth tokens into tool HTTP requests.
 * Handles token resolution, refresh, and injection based on tool configuration.
 *
 * Key features:
 * - Automatic OAuth connection resolution (initiator → owner priority)
 * - Auto-refresh expired tokens
 * - Flexible token injection (header/query/body)
 * - Usage tracking
 */
@Injectable()
export class OAuthTokenInjectionService {
  private readonly logger = new Logger(OAuthTokenInjectionService.name);

  constructor(
    private readonly connectionService: OAuthConnectionService,
    private readonly flowService: OAuthFlowService,
  ) {}

  /**
   * Inject OAuth token into HTTP request
   *
   * @param params - Injection parameters
   * @returns Modified HTTP request with OAuth token
   */
  async injectOAuthToken(params: {
    toolConfig: {
      authType?: string;
      oauthProviderKey?: string;
      oauthTokenLocation?: 'header' | 'query' | 'body';
      oauthTokenKey?: string;
      oauthTokenPrefix?: string;
    };
    sessionInitiator?: string; // Wallet address of user who started conversation
    agentOwnerId?: string; // Wallet address of agent owner
    httpRequest: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: any;
    };
  }): Promise<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  }> {
    try {
      // Check if tool requires OAuth
      if (
        params.toolConfig.authType !== 'oauth2' ||
        !params.toolConfig.oauthProviderKey
      ) {
        // No OAuth needed, return request unchanged
        return params.httpRequest;
      }

      // Resolve OAuth connection
      const connection = await this.resolveOAuthConnection({
        providerKey: params.toolConfig.oauthProviderKey,
        sessionInitiator: params.sessionInitiator,
        agentOwnerId: params.agentOwnerId,
      });

      if (!connection) {
        throw new UnauthorizedException(
          `No OAuth connection found for provider: ${params.toolConfig.oauthProviderKey}. ` +
            `Please connect your account at /oauth/connect`,
        );
      }

      // Get fresh access token (auto-refresh if needed)
      const accessToken = await this.getFreshAccessToken(
        connection.connectionId,
      );

      // Inject token into request
      const modifiedRequest = this.injectTokenIntoRequest(
        params.httpRequest,
        accessToken,
        params.toolConfig,
      );

      // Track usage
      await this.connectionService.incrementUsage(connection.connectionId);

      this.logger.debug(
        `Injected OAuth token for provider ${params.toolConfig.oauthProviderKey} into request`,
      );

      return modifiedRequest;
    } catch (error: any) {
      this.logger.error(
        `Failed to inject OAuth token: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Resolve OAuth connection for tool execution
   * Priority: session initiator → agent owner
   *
   * @param params - Resolution parameters
   * @returns Connection or null
   */
  async resolveOAuthConnection(params: {
    providerKey: string;
    sessionInitiator?: string;
    agentOwnerId?: string;
  }) {
    // Priority 1: Session initiator's connection (user who started conversation)
    if (params.sessionInitiator) {
      const initiatorConnection =
        await this.connectionService.getConnectionByOwner(
          params.sessionInitiator,
          params.providerKey,
          'user',
        );

      if (initiatorConnection && initiatorConnection.status === 'active') {
        this.logger.debug(
          `Resolved OAuth connection via session initiator: ${params.sessionInitiator}`,
        );
        return initiatorConnection;
      }
    }

    // Priority 2: Agent owner's connection (fallback)
    if (params.agentOwnerId) {
      const ownerConnection =
        await this.connectionService.getConnectionByOwner(
          params.agentOwnerId,
          params.providerKey,
          'user',
        );

      if (ownerConnection && ownerConnection.status === 'active') {
        this.logger.debug(
          `Resolved OAuth connection via agent owner: ${params.agentOwnerId}`,
        );
        return ownerConnection;
      }
    }

    this.logger.debug(
      `No active OAuth connection found for provider: ${params.providerKey}`,
    );
    return null;
  }

  /**
   * Get fresh access token (auto-refresh if needed)
   *
   * @param connectionId - Connection UUID
   * @returns Fresh access token
   */
  async getFreshAccessToken(connectionId: string): Promise<string> {
    return this.flowService.getFreshAccessToken(connectionId);
  }

  /**
   * Inject token into HTTP request based on configuration
   *
   * @param request - Original HTTP request
   * @param accessToken - Access token to inject
   * @param config - Tool OAuth configuration
   * @returns Modified request
   */
  private injectTokenIntoRequest(
    request: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: any;
    },
    accessToken: string,
    config: {
      oauthTokenLocation?: 'header' | 'query' | 'body';
      oauthTokenKey?: string;
      oauthTokenPrefix?: string;
    },
  ): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: any;
  } {
    // Defaults
    const location = config.oauthTokenLocation || 'header';
    const tokenKey = config.oauthTokenKey || 'Authorization';
    const tokenPrefix = config.oauthTokenPrefix || 'Bearer ';

    const modifiedRequest = { ...request };

    switch (location) {
      case 'header':
        // Inject into headers (most common)
        modifiedRequest.headers = {
          ...modifiedRequest.headers,
          [tokenKey]: `${tokenPrefix}${accessToken}`,
        };
        break;

      case 'query':
        // Inject into query string
        const url = new URL(modifiedRequest.url);
        url.searchParams.append(tokenKey, accessToken);
        modifiedRequest.url = url.toString();
        break;

      case 'body':
        // Inject into body (for POST/PUT requests)
        if (typeof modifiedRequest.body === 'object') {
          modifiedRequest.body = {
            ...modifiedRequest.body,
            [tokenKey]: accessToken,
          };
        } else {
          this.logger.warn(
            'Cannot inject token into body: body is not an object',
          );
        }
        break;

      default:
        this.logger.warn(
          `Unknown token location: ${location}, defaulting to header`,
        );
        modifiedRequest.headers = {
          ...modifiedRequest.headers,
          [tokenKey]: `${tokenPrefix}${accessToken}`,
        };
    }

    return modifiedRequest;
  }

  /**
   * Check if a tool requires OAuth authentication
   *
   * @param toolConfig - Tool configuration
   * @returns True if OAuth is required
   */
  requiresOAuth(toolConfig: {
    authType?: string;
    oauthProviderKey?: string;
  }): boolean {
    return (
      toolConfig.authType === 'oauth2' && !!toolConfig.oauthProviderKey
    );
  }

  /**
   * Get OAuth provider key from tool configuration
   *
   * @param toolConfig - Tool configuration
   * @returns Provider key or null
   */
  getProviderKey(toolConfig: {
    authType?: string;
    oauthProviderKey?: string;
  }): string | null {
    if (this.requiresOAuth(toolConfig)) {
      return toolConfig.oauthProviderKey || null;
    }
    return null;
  }

  /**
   * Validate OAuth connection availability for a user
   *
   * @param params - Validation parameters
   * @returns True if connection is available
   */
  async hasOAuthConnection(params: {
    providerKey: string;
    sessionInitiator?: string;
    agentOwnerId?: string;
  }): Promise<boolean> {
    const connection = await this.resolveOAuthConnection(params);
    return connection !== null && connection.status === 'active';
  }

  /**
   * Get OAuth connection info for a user (for error messages)
   *
   * @param params - Connection parameters
   * @returns Connection info or suggestion
   */
  async getOAuthConnectionInfo(params: {
    providerKey: string;
    sessionInitiator?: string;
    agentOwnerId?: string;
  }): Promise<{
    hasConnection: boolean;
    status?: string;
    message: string;
  }> {
    const connection = await this.resolveOAuthConnection(params);

    if (!connection) {
      return {
        hasConnection: false,
        message: `No OAuth connection found for ${params.providerKey}. Please connect your account.`,
      };
    }

    if (connection.status !== 'active') {
      return {
        hasConnection: true,
        status: connection.status,
        message: `OAuth connection is not active (status: ${connection.status}). Please reconnect your account.`,
      };
    }

    return {
      hasConnection: true,
      status: 'active',
      message: 'OAuth connection is active and ready to use.',
    };
  }
}
