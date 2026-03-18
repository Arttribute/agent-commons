import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { eq } from 'drizzle-orm';
import * as schema from '../../../models/schema';

export const OWNER_RESOURCE_KEY = 'owner_resource';

export interface OwnerResourceOptions {
  /**
   * Which schema table to look up. Currently supports: 'agent' | 'task' | 'workflow'
   */
  table: 'agent' | 'task' | 'workflow';
  /**
   * Route param name holding the resource ID (default: same as table + 'Id', e.g. 'agentId')
   */
  idParam?: string;
}

/**
 * Decorate a controller method to enforce owner-only access.
 *
 * Usage:
 *   @OwnerOnly({ table: 'agent' })        // checks req.params.agentId
 *   @OwnerOnly({ table: 'task', idParam: 'id' })
 *
 * The guard compares the resource's `owner` column against:
 *   1. The `x-owner-id` request header (set by SDK / web clients)
 *   2. The `x-initiator` header (used by agent-to-agent calls)
 *
 * Enforcement is only active when OWNER_AUTH_REQUIRED=true in env.
 * When disabled, the guard passes through (safe default for dev).
 */
export const OwnerOnly = (options: OwnerResourceOptions) =>
  SetMetadata(OWNER_RESOURCE_KEY, options);

@Injectable()
export class OwnerGuard implements CanActivate {
  private readonly enforced: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {
    this.enforced = process.env.OWNER_AUTH_REQUIRED === 'true';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enforced) return true;

    const opts = this.reflector.getAllAndOverride<OwnerResourceOptions | undefined>(
      OWNER_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!opts) return true; // No @OwnerOnly decorator — pass through

    const req = context.switchToHttp().getRequest<Request>();

    // Resolve caller identity
    const callerId =
      (req.headers['x-owner-id'] as string) ??
      (req.headers['x-initiator'] as string);

    if (!callerId) {
      throw new ForbiddenException('Owner identity required (x-owner-id or x-initiator header missing)');
    }

    // Resolve resource ID from route params
    const idParam = opts.idParam ?? `${opts.table}Id`;
    const resourceId = req.params[idParam];

    if (!resourceId) return true; // No ID in params (e.g. POST /agents) — let through

    const owner = await this.resolveOwner(opts.table, resourceId);

    if (owner === null) {
      throw new NotFoundException(`${opts.table} ${resourceId} not found`);
    }

    // Platform resources (owner=null) are accessible to everyone
    if (owner === undefined) return true;

    if (owner.toLowerCase() !== callerId.toLowerCase()) {
      throw new ForbiddenException(`You do not own this ${opts.table}`);
    }

    return true;
  }

  private async resolveOwner(
    table: OwnerResourceOptions['table'],
    id: string,
  ): Promise<string | null | undefined> {
    switch (table) {
      case 'agent': {
        const row = await this.db.query.agent.findFirst({
          where: (t) => eq(t.agentId, id),
        });
        if (!row) return null;
        return row.owner ?? undefined;
      }
      case 'task': {
        const row = await this.db.query.task.findFirst({
          where: (t) => eq(t.taskId, id),
        });
        if (!row) return null;
        return (row as any).owner ?? (row as any).createdBy ?? undefined;
      }
      case 'workflow': {
        const row = await this.db.query.workflow.findFirst({
          where: (t) => eq(t.workflowId, id),
        });
        if (!row) return null;
        return (row as any).ownerId ?? (row as any).owner ?? undefined;
      }
      default:
        return undefined;
    }
  }
}
