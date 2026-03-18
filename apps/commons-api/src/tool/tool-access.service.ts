import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { eq, and, or } from 'drizzle-orm';
import { DatabaseService } from '../modules/database';
import * as schema from '../../models/schema';

/**
 * ToolAccessService
 *
 * Manages access control and permissions for tools.
 *
 * Permission levels:
 * - platform: Available to all (static/built-in tools)
 * - public: Available to all users (but may require own keys)
 * - private: Only accessible with explicit permission
 *
 * Permission types:
 * - read: Can view tool details
 * - execute: Can execute the tool
 * - admin: Can modify tool and grant permissions
 */
@Injectable()
export class ToolAccessService {
  private readonly logger = new Logger(ToolAccessService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Check if a subject (user or agent) can execute a tool
   *
   * @param toolId - The tool ID
   * @param subjectId - User ID or Agent ID
   * @param subjectType - 'user' or 'agent'
   * @returns True if allowed, throws ForbiddenException otherwise
   */
  async canExecuteTool(
    toolId: string,
    subjectId: string,
    subjectType: 'user' | 'agent',
  ): Promise<boolean> {
    // Get tool
    const tool = await this.db.query.tool.findFirst({
      where: (t) => eq(t.toolId, toolId),
    });

    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    // Check visibility level
    if (tool.visibility === 'platform') {
      // Platform tools are always accessible
      return true;
    }

    if (tool.visibility === 'public') {
      // Public tools are accessible to all
      return true;
    }

    // For private tools, check explicit permissions
    if (tool.visibility === 'private') {
      // Check if subject is the owner
      if (tool.owner === subjectId && tool.ownerType === subjectType) {
        return true;
      }

      // Check explicit permissions
      const hasPermission = await this.hasPermission(
        toolId,
        subjectId,
        subjectType,
        'execute',
      );

      if (!hasPermission) {
        throw new ForbiddenException(
          `${subjectType} ${subjectId} does not have permission to execute tool ${toolId}`,
        );
      }

      return true;
    }

    // Default deny
    return false;
  }

  /**
   * Check if a subject has a specific permission for a tool
   *
   * @param toolId - The tool ID
   * @param subjectId - User ID or Agent ID
   * @param subjectType - 'user' or 'agent'
   * @param permission - 'read' | 'execute' | 'admin'
   * @returns True if has permission
   */
  async hasPermission(
    toolId: string,
    subjectId: string,
    subjectType: 'user' | 'agent',
    permission: 'read' | 'execute' | 'admin',
  ): Promise<boolean> {
    const permissions = await this.db.query.toolPermission.findMany({
      where: (p) =>
        and(
          eq(p.toolId, toolId),
          eq(p.subjectId, subjectId),
          eq(p.subjectType, subjectType),
          or(
            eq(p.permission, permission),
            // Admin has all permissions
            eq(p.permission, 'admin'),
          ),
        ),
    });

    // Check if any permission is still valid (not expired)
    const now = new Date();
    return permissions.some((p) => !p.expiresAt || p.expiresAt > now);
  }

  /**
   * Grant permission to a subject for a tool
   *
   * @param params - Permission grant parameters
   * @returns Created permission
   */
  async grantPermission(params: {
    toolId: string;
    subjectId: string;
    subjectType: 'user' | 'agent';
    permission: 'read' | 'execute' | 'admin';
    grantedBy: string;
    expiresAt?: Date;
  }) {
    // Check if permission already exists
    const existing = await this.db.query.toolPermission.findFirst({
      where: (p) =>
        and(
          eq(p.toolId, params.toolId),
          eq(p.subjectId, params.subjectId),
          eq(p.subjectType, params.subjectType),
          eq(p.permission, params.permission),
        ),
    });

    if (existing) {
      // Update expiration if exists
      if (params.expiresAt) {
        const [updated] = await this.db
          .update(schema.toolPermission)
          .set({ expiresAt: params.expiresAt })
          .where(eq(schema.toolPermission.id, existing.id))
          .returning();

        this.logger.log(
          `Updated permission ${existing.id} for ${params.subjectType} ${params.subjectId} on tool ${params.toolId}`,
        );

        return updated;
      }

      return existing;
    }

    // Create new permission
    const [permission] = await this.db
      .insert(schema.toolPermission)
      .values({
        toolId: params.toolId,
        subjectId: params.subjectId,
        subjectType: params.subjectType,
        permission: params.permission,
        grantedBy: params.grantedBy,
        expiresAt: params.expiresAt,
      })
      .returning();

    this.logger.log(
      `Granted ${params.permission} permission to ${params.subjectType} ${params.subjectId} for tool ${params.toolId}`,
    );

    return permission;
  }

  /**
   * Revoke a permission
   *
   * @param permissionId - The permission ID
   * @returns Success indicator
   */
  async revokePermission(permissionId: string) {
    const result = await this.db
      .delete(schema.toolPermission)
      .where(eq(schema.toolPermission.id, permissionId))
      .returning();

    if (!result.length) {
      throw new Error(`Permission ${permissionId} not found`);
    }

    this.logger.log(`Revoked permission ${permissionId}`);

    return { success: true };
  }

  /**
   * List all permissions for a tool
   *
   * @param toolId - The tool ID
   * @returns List of permissions
   */
  async listToolPermissions(toolId: string) {
    return this.db.query.toolPermission.findMany({
      where: (p) => eq(p.toolId, toolId),
    });
  }

  /**
   * List all permissions for a subject (user or agent)
   *
   * @param subjectId - User ID or Agent ID
   * @param subjectType - 'user' or 'agent'
   * @returns List of permissions
   */
  async listSubjectPermissions(
    subjectId: string,
    subjectType: 'user' | 'agent',
  ) {
    return this.db.query.toolPermission.findMany({
      where: (p) =>
        and(eq(p.subjectId, subjectId), eq(p.subjectType, subjectType)),
      with: {
        tool: true,
      },
    });
  }

  /**
   * Get all tools accessible to a subject
   * Considers visibility levels and explicit permissions
   *
   * @param subjectId - User ID or Agent ID
   * @param subjectType - 'user' or 'agent'
   * @returns List of accessible tools
   */
  async getAccessibleTools(subjectId: string, subjectType: 'user' | 'agent') {
    // Get all tools
    const allTools = await this.db.query.tool.findMany();

    // Filter based on access
    const accessible = [];

    for (const tool of allTools) {
      try {
        // Platform and public tools are always accessible
        if (tool.visibility === 'platform' || tool.visibility === 'public') {
          accessible.push(tool);
          continue;
        }

        // Check if owner
        if (tool.owner === subjectId && tool.ownerType === subjectType) {
          accessible.push(tool);
          continue;
        }

        // Check explicit permissions
        const hasAccess = await this.hasPermission(
          tool.toolId,
          subjectId,
          subjectType,
          'execute',
        );

        if (hasAccess) {
          accessible.push(tool);
        }
      } catch (error: any) {
        // Skip tools with errors
        continue;
      }
    }

    return accessible;
  }

  /**
   * Batch grant permissions to multiple subjects
   *
   * @param params - Batch grant parameters
   * @returns Created permissions
   */
  async batchGrantPermissions(params: {
    toolId: string;
    subjects: Array<{
      subjectId: string;
      subjectType: 'user' | 'agent';
    }>;
    permission: 'read' | 'execute' | 'admin';
    grantedBy: string;
    expiresAt?: Date;
  }) {
    const permissions = [];

    for (const subject of params.subjects) {
      try {
        const permission = await this.grantPermission({
          toolId: params.toolId,
          subjectId: subject.subjectId,
          subjectType: subject.subjectType,
          permission: params.permission,
          grantedBy: params.grantedBy,
          expiresAt: params.expiresAt,
        });

        permissions.push(permission);
      } catch (error: any) {
        this.logger.error(
          `Failed to grant permission to ${subject.subjectType} ${subject.subjectId}: ${error.message}`,
        );
      }
    }

    return permissions;
  }

  /**
   * Transfer tool ownership
   *
   * @param toolId - The tool ID
   * @param newOwnerId - New owner ID
   * @param newOwnerType - 'user' | 'agent'
   * @returns Updated tool
   */
  async transferOwnership(
    toolId: string,
    newOwnerId: string,
    newOwnerType: 'user' | 'agent',
  ) {
    const [updated] = await this.db
      .update(schema.tool)
      .set({
        owner: newOwnerId,
        ownerType: newOwnerType,
        updatedAt: new Date(),
      })
      .where(eq(schema.tool.toolId, toolId))
      .returning();

    if (!updated) {
      throw new Error(`Tool ${toolId} not found`);
    }

    this.logger.log(
      `Transferred ownership of tool ${toolId} to ${newOwnerType} ${newOwnerId}`,
    );

    return updated;
  }

  /**
   * Clean up expired permissions
   *
   * @returns Number of deleted permissions
   */
  async cleanupExpiredPermissions() {
    const now = new Date();

    const result = await this.db
      .delete(schema.toolPermission)
      .where(
        and(
          eq(schema.toolPermission.expiresAt, now),
          // Only delete if expiresAt is in the past
        ),
      )
      .returning();

    this.logger.log(`Cleaned up ${result.length} expired permissions`);

    return result.length;
  }

  /**
   * Check if an agent can use a specific tool (combines tool access + key availability)
   *
   * @param toolId - The tool ID
   * @param agentId - The agent ID
   * @param userId - The user who owns the agent (optional)
   * @returns Access check result
   */
  async checkAgentToolAccess(
    toolId: string,
    agentId: string,
    userId?: string,
  ): Promise<{
    canExecute: boolean;
    reason?: string;
    requiresKey: boolean;
    hasKey: boolean;
  }> {
    try {
      // Check basic access permission
      const canExecute = await this.canExecuteTool(toolId, agentId, 'agent');

      if (!canExecute) {
        return {
          canExecute: false,
          reason: 'No permission to execute tool',
          requiresKey: false,
          hasKey: false,
        };
      }

      // Get tool to check if it requires a key
      const tool = await this.db.query.tool.findFirst({
        where: (t) => eq(t.toolId, toolId),
      });

      if (!tool) {
        return {
          canExecute: false,
          reason: 'Tool not found',
          requiresKey: false,
          hasKey: false,
        };
      }

      // Check if tool requires authentication
      const requiresKey =
        tool.apiSpec?.authType &&
        tool.apiSpec.authType !== 'none' &&
        !!tool.apiSpec.authKeyName;

      if (!requiresKey) {
        return {
          canExecute: true,
          requiresKey: false,
          hasKey: false,
        };
      }

      // Check if key is available (would need ToolKeyService for this)
      // For now, we'll just return that a key is required
      return {
        canExecute: true,
        requiresKey: true,
        hasKey: false, // This should be checked by ToolKeyService
      };
    } catch (error: any) {
      return {
        canExecute: false,
        reason: error.message,
        requiresKey: false,
        hasKey: false,
      };
    }
  }
}
