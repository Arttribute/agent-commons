import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { resolveCallerId } from '~/modules/auth';
import { OAuthProviderService } from '~/oauth/oauth-provider.service';
import { OAuthConnectionService } from '~/oauth/oauth-connection.service';
import { ManagedMcpService } from '~/oauth/managed-mcp.service';
import { ToolService } from './tool.service';
import { ToolInvocationService } from './tool-invocation.service';

/** Exposes provider tools to a local model without sending its chat to a cloud model. */
@Controller({ path: 'connected-apps', version: '1' })
export class ConnectedAppsController {
  constructor(private readonly tools: ToolService, private readonly providers: OAuthProviderService, private readonly connections: OAuthConnectionService, private readonly invocation: ToolInvocationService, private readonly mcp: ManagedMcpService) {}

  private caller(req: Request) {
    const id = resolveCallerId(req);
    if (!id) throw new UnauthorizedException('Sign in to connect your apps.');
    return id;
  }

  @Get()
  async catalog(@Req() req: Request, @Query('discover') discover?: string) {
    const ownerId = this.caller(req);
    const [tools, providers] = await Promise.all([this.tools.getAllTools({ ownerType: 'platform', visibility: 'platform' }), this.providers.listProviders()]);
    const apps = await Promise.all(providers.map(async (provider) => {
      const connection = await this.connections.getConnectionByOwner(ownerId, provider.providerKey, 'user');
      const appTools = tools.filter((tool) => tool.apiSpec?.authType === 'oauth2' && tool.apiSpec.oauthProviderKey === provider.providerKey);
      const scopes = [...new Set([...((provider.scopes as any)?.default ?? []), ...appTools.flatMap((tool) => tool.apiSpec?.oauthScopes ?? [])])];
      if (provider.providerKey === 'hubspot_mcp') {
        let error: string | undefined;
        const remote = connection?.status === 'active' && discover === '1' ? await this.mcp.list(ownerId).catch((cause) => { error = cause.message; return []; }) : [];
        return { id: 'oauth:hubspot_mcp', providerKey: provider.providerKey, name: provider.displayName, connected: connection?.status === 'active', connectionId: connection?.connectionId, accountName: connection?.providerUserEmail || connection?.providerUserName, scopes: [], error, tools: remote.slice(0, 90).map((tool) => ({ name: `hubspot_mcp__${tool.name}`, readOnly: tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint !== true, schema: { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } } })) };
      }
      return { id: `oauth:${provider.providerKey}`, providerKey: provider.providerKey, name: provider.displayName, connected: connection?.status === 'active', connectionId: connection?.connectionId, accountName: connection?.providerUserEmail || connection?.providerUserName, scopes, tools: connection?.status === 'active' ? appTools.filter((tool) => (tool.apiSpec?.oauthScopes ?? []).every((scope) => connection.scopes?.includes(scope))).map((tool) => ({ schema: tool.schema, readOnly: !tool.apiSpec?.requiresConfirmation && (['GET', 'HEAD'].includes(tool.apiSpec?.method?.toUpperCase() ?? '') || tool.tags?.includes('read')), name: tool.name })) : [] };
    }));
    return { apps };
  }

  @Post(':name/invoke')
  async invoke(@Req() req: Request, @Param('name') name: string, @Body() args: Record<string, unknown>) {
    const ownerId = this.caller(req);
    if (!args || typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 16000) throw new BadRequestException('Provide a JSON object with up to 16,000 characters.');
    const { _commonsConnectionId, _commonsConfirmed, ...inputArgs } = args;
    const expectedConnectionId = typeof _commonsConnectionId === "string" ? _commonsConnectionId : undefined;
    if (name.startsWith('hubspot_mcp__')) { return this.mcp.invoke(ownerId, 'hubspot_mcp', name.slice('hubspot_mcp__'.length), inputArgs, _commonsConfirmed === true, expectedConnectionId); }
    const tool = await this.tools.getToolByName(name);
    const spec = tool.apiSpec;
    if (tool.ownerType !== 'platform' || tool.visibility !== 'platform' || spec?.authType !== 'oauth2' || !spec.oauthProviderKey) throw new NotFoundException('Connected app tool not found.');
    const connection = await this.connections.getConnectionByOwner(ownerId, spec.oauthProviderKey, 'user');
    if (connection?.status !== 'active' || !(spec.oauthScopes ?? []).every((scope) => connection.scopes?.includes(scope))) throw new UnauthorizedException('Connect this app and approve the required permissions first.');
    if (expectedConnectionId && connection.connectionId !== expectedConnectionId) throw new UnauthorizedException('The connected account changed. Select the app again.');
    const readOnly = !spec.requiresConfirmation && (['GET', 'HEAD'].includes(spec.method?.toUpperCase() ?? '') || tool.tags?.includes('read'));
    return this.invocation.invokeDynamicTool({ ...spec, requiresConfirmation: !readOnly } as any, { ...inputArgs, ...(_commonsConfirmed === true ? { confirmed: true } : {}) }, { sessionInitiator: ownerId });
  }
}
