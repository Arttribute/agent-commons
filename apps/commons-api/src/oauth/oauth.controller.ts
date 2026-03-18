// src/oauth/oauth.controller.ts

import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthConnectionService } from './oauth-connection.service';
import { OAuthFlowService } from './oauth-flow.service';
import {
  InitiateOAuthFlowDto,
  InitiateOAuthFlowResponseDto,
  OAuthCallbackQueryDto,
  OAuthCallbackResponseDto,
  ListOAuthProvidersResponseDto,
  ListOAuthConnectionsResponseDto,
  GetOAuthConnectionResponseDto,
  RefreshOAuthTokenResponseDto,
  RevokeOAuthConnectionResponseDto,
  TestOAuthConnectionResponseDto,
  UpdateOAuthConnectionDto,
  UpdateOAuthConnectionResponseDto,
  GetOAuthProviderResponseDto,
  OAuthProviderDto,
  OAuthConnectionDto,
} from './dto/oauth.dto';

@Controller({ version: '1', path: 'oauth' })
export class OAuthController {
  constructor(
    private readonly providerService: OAuthProviderService,
    private readonly connectionService: OAuthConnectionService,
    private readonly flowService: OAuthFlowService,
  ) {}

  // ==================== Provider Endpoints ====================

  /**
   * GET /v1/oauth/providers
   * List all available OAuth providers
   */
  @Get('providers')
  async listProviders(): Promise<ListOAuthProvidersResponseDto> {
    const providers = await this.providerService.listProviders();

    const providersDto: OAuthProviderDto[] = providers.map((p) => ({
      providerId: p.providerId,
      providerKey: p.providerKey,
      displayName: p.displayName,
      description: p.description || '',
      logoUrl: p.logoUrl || '',
      defaultScopes:
        typeof p.scopes === 'object' && p.scopes !== null
          ? (p.scopes as any).default || []
          : [],
      isActive: p.isActive,
      isPlatform: p.isPlatform,
    }));

    return { providers: providersDto };
  }

  /**
   * GET /v1/oauth/providers/:providerKey
   * Get provider details including auth URL and scope groups
   */
  @Get('providers/:providerKey')
  async getProvider(
    @Param('providerKey') providerKey: string,
  ): Promise<GetOAuthProviderResponseDto> {
    const provider = await this.providerService.getProvider(providerKey);

    if (!provider) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }

    return {
      provider: {
        providerId: provider.providerId,
        providerKey: provider.providerKey,
        displayName: provider.displayName,
        description: provider.description || '',
        logoUrl: provider.logoUrl || '',
        authUrl: provider.authUrl,
        defaultScopes:
          typeof provider.scopes === 'object' && provider.scopes !== null
            ? (provider.scopes as any).default || []
            : [],
        scopeGroups:
          typeof provider.scopes === 'object' && provider.scopes !== null
            ? (provider.scopes as Record<string, string[]>)
            : {},
        authorizationParams:
          typeof provider.authorizationParams === 'object' &&
          provider.authorizationParams !== null
            ? (provider.authorizationParams as Record<string, any>)
            : {},
        isActive: provider.isActive,
        isPlatform: provider.isPlatform,
      },
    };
  }

  // ==================== OAuth Flow Endpoints ====================

  /**
   * POST /v1/oauth/connect
   * Initiate OAuth flow - returns authorization URL
   */
  @Post('connect')
  async initiateFlow(
    @Body() dto: InitiateOAuthFlowDto,
    @Req() req: Request,
  ): Promise<InitiateOAuthFlowResponseDto> {
    // Get owner from request (should be set by auth middleware)
    const ownerId = req.headers['x-initiator'] as string;

    if (!ownerId) {
      throw new HttpException(
        'Missing x-initiator header',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const result = await this.flowService.initiateFlow({
      userId: ownerId,
      providerKey: dto.providerKey,
      requestedScopes: dto.scopes,
      redirectUri: dto.redirectUri || `${req.protocol}://${req.get('host')}/api/oauth/callback/${dto.providerKey}`,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    return {
      authorizationUrl: result.authorizationUrl,
      state: result.state,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    };
  }

  /**
   * GET /v1/oauth/callback/:providerKey
   * OAuth callback endpoint - exchanges code for tokens
   */
  @Get('callback/:providerKey')
  async handleCallback(
    @Param('providerKey') providerKey: string,
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      // Handle OAuth errors from provider
      if (query.error) {
        const errorMessage =
          query.error_description || query.error || 'OAuth authorization failed';

        // Redirect to error page
        return res.redirect(
          `/oauth/error?message=${encodeURIComponent(errorMessage)}`,
        );
      }

      // Exchange code for tokens
      const result = await this.flowService.handleCallback({
        code: query.code,
        state: query.state,
        redirectUri: `${req.protocol}://${req.get('host')}/api/oauth/callback/${providerKey}`,
      });

      // Redirect to success page
      return res.redirect(
        `/oauth/success?connectionId=${result.connectionId}&provider=${providerKey}`,
      );
    } catch (error) {
      console.error('OAuth callback error:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'OAuth callback failed';

      return res.redirect(
        `/oauth/error?message=${encodeURIComponent(errorMessage)}`,
      );
    }
  }

  // ==================== Connection Management Endpoints ====================

  /**
   * GET /v1/oauth/connections
   * List user's OAuth connections
   */
  @Get('connections')
  async listConnections(
    @Query('ownerId') ownerId: string,
    @Query('ownerType') ownerType: 'user' | 'agent' = 'user',
  ): Promise<ListOAuthConnectionsResponseDto> {
    const connections = await this.connectionService.listConnections({
      ownerId,
      ownerType: ownerType as any,
    });

    // Fetch provider info for each connection
    const connectionsWithProviderInfo = await Promise.all(
      connections.map(async (conn) => {
        const provider = await this.providerService.getProviderById(
          conn.providerId,
        );

        return {
          connectionId: conn.connectionId,
          ownerId: conn.ownerId,
          ownerType: conn.ownerType as 'user' | 'agent',
          providerKey: provider?.providerKey || '',
          providerDisplayName: provider?.displayName || '',
          providerLogoUrl: provider?.logoUrl || '',
          providerUserEmail: conn.providerUserEmail || '',
          providerUserName: conn.providerUserName || '',
          scopes: conn.scopes || [],
          status: conn.status as any,
          displayName: conn.displayName || undefined,
          description: conn.description || undefined,
          accessTokenExpiresAt: conn.accessTokenExpiresAt,
          lastRefreshedAt: conn.lastRefreshedAt || undefined,
          lastUsedAt: conn.lastUsedAt || undefined,
          usageCount: conn.usageCount || 0,
          lastError: conn.lastError || undefined,
          lastErrorAt: conn.lastErrorAt || undefined,
          createdAt: conn.createdAt,
          updatedAt: conn.updatedAt,
        } as OAuthConnectionDto;
      }),
    );

    return { connections: connectionsWithProviderInfo };
  }

  /**
   * GET /v1/oauth/connections/:connectionId
   * Get connection details
   */
  @Get('connections/:connectionId')
  async getConnection(
    @Param('connectionId') connectionId: string,
  ): Promise<GetOAuthConnectionResponseDto> {
    const conn = await this.connectionService.getConnection(connectionId);

    if (!conn) {
      throw new HttpException('Connection not found', HttpStatus.NOT_FOUND);
    }

    const provider = await this.providerService.getProviderById(conn.providerId);

    const connectionDto: OAuthConnectionDto = {
      connectionId: conn.connectionId,
      ownerId: conn.ownerId,
      ownerType: conn.ownerType as 'user' | 'agent',
      providerKey: provider?.providerKey || '',
      providerDisplayName: provider?.displayName || '',
      providerLogoUrl: provider?.logoUrl || '',
      providerUserEmail: conn.providerUserEmail || '',
      providerUserName: conn.providerUserName || '',
      scopes: conn.scopes || [],
      status: conn.status as any,
      displayName: conn.displayName || undefined,
      description: conn.description || undefined,
      accessTokenExpiresAt: conn.accessTokenExpiresAt,
      lastRefreshedAt: conn.lastRefreshedAt || undefined,
      lastUsedAt: conn.lastUsedAt || undefined,
      usageCount: conn.usageCount || 0,
      lastError: conn.lastError || undefined,
      lastErrorAt: conn.lastErrorAt || undefined,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    };

    return { connection: connectionDto };
  }

  /**
   * PUT /v1/oauth/connections/:connectionId
   * Update connection metadata (display name, description)
   */
  @Put('connections/:connectionId')
  async updateConnection(
    @Param('connectionId') connectionId: string,
    @Body() dto: UpdateOAuthConnectionDto,
  ): Promise<UpdateOAuthConnectionResponseDto> {
    const updated = await this.connectionService.updateConnection(
      connectionId,
      dto,
    );

    const provider = await this.providerService.getProviderById(
      updated.providerId,
    );

    const connectionDto: OAuthConnectionDto = {
      connectionId: updated.connectionId,
      ownerId: updated.ownerId,
      ownerType: updated.ownerType as 'user' | 'agent',
      providerKey: provider?.providerKey || '',
      providerDisplayName: provider?.displayName || '',
      providerLogoUrl: provider?.logoUrl || '',
      providerUserEmail: updated.providerUserEmail || '',
      providerUserName: updated.providerUserName || '',
      scopes: updated.scopes || [],
      status: updated.status as any,
      displayName: updated.displayName || undefined,
      description: updated.description || undefined,
      accessTokenExpiresAt: updated.accessTokenExpiresAt,
      lastRefreshedAt: updated.lastRefreshedAt || undefined,
      lastUsedAt: updated.lastUsedAt || undefined,
      usageCount: updated.usageCount || 0,
      lastError: updated.lastError || undefined,
      lastErrorAt: updated.lastErrorAt || undefined,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    return { success: true, connection: connectionDto };
  }

  /**
   * DELETE /v1/oauth/connections/:connectionId
   * Revoke and delete OAuth connection
   */
  @Delete('connections/:connectionId')
  async revokeConnection(
    @Param('connectionId') connectionId: string,
  ): Promise<RevokeOAuthConnectionResponseDto> {
    try {
      await this.flowService.revokeToken(connectionId);

      return {
        success: true,
        connectionId,
        message: 'Connection revoked successfully',
      };
    } catch (error) {
      console.error('Revoke connection error:', error);

      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to revoke connection',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /v1/oauth/connections/:connectionId/refresh
   * Manually refresh access token
   */
  @Post('connections/:connectionId/refresh')
  async refreshToken(
    @Param('connectionId') connectionId: string,
  ): Promise<RefreshOAuthTokenResponseDto> {
    try {
      await this.flowService.refreshAccessToken(connectionId);

      // Get updated connection to return fresh data
      const connection = await this.connectionService.getConnection(connectionId);

      return {
        success: true,
        connectionId,
        accessTokenExpiresAt: connection.accessTokenExpiresAt,
        lastRefreshedAt: connection.lastRefreshedAt || connection.updatedAt,
      };
    } catch (error) {
      console.error('Refresh token error:', error);

      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to refresh token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /v1/oauth/connections/:connectionId/test
   * Test connection validity
   */
  @Get('connections/:connectionId/test')
  async testConnection(
    @Param('connectionId') connectionId: string,
  ): Promise<TestOAuthConnectionResponseDto> {
    try {
      const conn = await this.connectionService.getConnection(connectionId);

      if (!conn) {
        throw new HttpException('Connection not found', HttpStatus.NOT_FOUND);
      }

      // Check if token is expired
      const now = new Date();
      const isExpired = conn.accessTokenExpiresAt < now;
      const accessTokenValid = !isExpired && conn.status === 'active';

      return {
        success: true,
        connectionId,
        status: conn.status as any,
        providerUserEmail: conn.providerUserEmail || undefined,
        accessTokenValid,
        accessTokenExpiresAt: conn.accessTokenExpiresAt,
        error: conn.lastError || undefined,
      };
    } catch (error) {
      console.error('Test connection error:', error);

      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to test connection',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
