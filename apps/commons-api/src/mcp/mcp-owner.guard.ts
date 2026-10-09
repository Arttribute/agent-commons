import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import { resolveCallerId } from '~/modules/auth/owner.guard';
import type { ApiKeyPrincipal } from '~/modules/auth/api-key.service';

const PUBLIC_CATALOG = 'mcp_public_catalog';
export const PublicMcpCatalog = () => SetMetadata(PUBLIC_CATALOG, true);
export type McpRequest = Request & { mcpOwner?: { ownerId: string; ownerType: 'user' | 'agent' } };

/** Connection configuration and invocations are private, including public catalog entries. */
@Injectable()
export class McpOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.get<boolean>(PUBLIC_CATALOG, context.getHandler())) return true;
    const req = context.switchToHttp().getRequest<McpRequest>();
    const caller = resolveCallerId(req);
    if (!caller) throw new ForbiddenException('Owner identity is required');
    let serverId = req.params.serverId;
    if (req.params.mcpToolId) {
      this.validateId(req.params.mcpToolId);
      const tool = await this.db.query.mcpTool.findFirst({ where: (t) => eq(t.mcpToolId, req.params.mcpToolId) });
      if (!tool) throw new NotFoundException('MCP tool not found');
      serverId = tool.serverId;
    }
    if (serverId) {
      this.validateId(serverId);
      const server = await this.db.query.mcpServer.findFirst({ where: (s) => eq(s.serverId, serverId) });
      if (!server) throw new NotFoundException('MCP server not found');
      await this.authorize(req, caller, server.ownerId, server.ownerType);
    } else {
      const principal = (req as any).principal as ApiKeyPrincipal | undefined;
      const ownerId = req.query.ownerId ?? caller;
      const ownerType = req.query.ownerType ?? (principal?.principalType === 'agent' ? 'agent' : 'user');
      if (typeof ownerId !== 'string' || !ownerId.trim() || typeof ownerType !== 'string' || !['user', 'agent'].includes(ownerType)) throw new BadRequestException('Invalid MCP owner');
      await this.authorize(req, caller, ownerId, ownerType);
      req.mcpOwner = { ownerId, ownerType: ownerType as 'user' | 'agent' };
    }
    return true;
  }

  private validateId(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException('Invalid MCP resource ID');
  }

  private async authorize(req: McpRequest, caller: string, ownerId: string, ownerType: string) {
    const principal = (req as any).principal as ApiKeyPrincipal | undefined;
    if (ownerType === 'user' && principal?.principalType !== 'agent' && ownerId.toLowerCase() === caller.toLowerCase()) return;
    if (ownerType === 'agent') {
      this.validateId(ownerId);
      if (ownerId.toLowerCase() === caller.toLowerCase() && principal?.principalType !== 'user') return;
      const agent = await this.db.query.agent.findFirst({ where: (a) => eq(a.agentId, ownerId), columns: { ownerUserId: true, workspaceId: true, owner: true } });
      if (agent && ([agent.ownerUserId, agent.owner].some((id) => id?.toLowerCase() === caller.toLowerCase())
        || (principal?.principalType === 'user' && principal.workspaceId && agent.workspaceId?.toLowerCase() === principal.workspaceId.toLowerCase()))) return;
    }
    throw new ForbiddenException('You do not own this MCP connection');
  }
}
