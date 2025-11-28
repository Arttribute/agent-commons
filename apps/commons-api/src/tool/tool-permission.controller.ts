// src/tool/tool-permission.controller.ts

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ToolAccessService } from './tool-access.service';

@Controller({ version: '1', path: 'tool-permissions' })
export class ToolPermissionController {
  constructor(private readonly toolAccessService: ToolAccessService) {}

  /**
   * POST /v1/tool-permissions/grant
   * Grant permission to a user or agent for a tool
   */
  @Post('grant')
  async grantPermission(
    @Body()
    body: {
      toolId: string;
      subjectId: string;
      subjectType: 'user' | 'agent';
      permission: 'read' | 'execute' | 'admin';
      grantedBy: string;
      expiresAt?: string;
    },
  ) {
    const permission = await this.toolAccessService.grantPermission({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return { success: true, data: permission };
  }

  /**
   * POST /v1/tool-permissions/batch-grant
   * Grant permissions to multiple users/agents at once
   */
  @Post('batch-grant')
  async batchGrantPermissions(
    @Body()
    body: {
      toolId: string;
      subjects: Array<{
        subjectId: string;
        subjectType: 'user' | 'agent';
      }>;
      permission: 'read' | 'execute' | 'admin';
      grantedBy: string;
      expiresAt?: string;
    },
  ) {
    const permissions = await this.toolAccessService.batchGrantPermissions({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return { success: true, data: permissions };
  }

  /**
   * DELETE /v1/tool-permissions/:permissionId
   * Revoke a permission
   */
  @Delete(':permissionId')
  async revokePermission(@Param('permissionId') permissionId: string) {
    const result = await this.toolAccessService.revokePermission(permissionId);
    return result;
  }

  /**
   * GET /v1/tool-permissions/tool/:toolId
   * List all permissions for a specific tool
   */
  @Get('tool/:toolId')
  async listToolPermissions(@Param('toolId') toolId: string) {
    const permissions =
      await this.toolAccessService.listToolPermissions(toolId);
    return { success: true, data: permissions };
  }

  /**
   * GET /v1/tool-permissions/subject
   * List all permissions for a user or agent
   */
  @Get('subject')
  async listSubjectPermissions(
    @Query('subjectId') subjectId: string,
    @Query('subjectType') subjectType: 'user' | 'agent',
  ) {
    const permissions = await this.toolAccessService.listSubjectPermissions(
      subjectId,
      subjectType,
    );

    return { success: true, data: permissions };
  }

  /**
   * GET /v1/tool-permissions/accessible-tools
   * Get all tools accessible to a user or agent
   */
  @Get('accessible-tools')
  async getAccessibleTools(
    @Query('subjectId') subjectId: string,
    @Query('subjectType') subjectType: 'user' | 'agent',
  ) {
    const tools = await this.toolAccessService.getAccessibleTools(
      subjectId,
      subjectType,
    );

    return { success: true, data: tools };
  }

  /**
   * GET /v1/tool-permissions/check
   * Check if a subject has permission for a tool
   */
  @Get('check')
  async checkPermission(
    @Query('toolId') toolId: string,
    @Query('subjectId') subjectId: string,
    @Query('subjectType') subjectType: 'user' | 'agent',
    @Query('permission') permission: 'read' | 'execute' | 'admin',
  ) {
    const hasPermission = await this.toolAccessService.hasPermission(
      toolId,
      subjectId,
      subjectType,
      permission,
    );

    return { success: true, data: { hasPermission } };
  }

  /**
   * GET /v1/tool-permissions/check-agent-access
   * Check if an agent can use a specific tool (combines access + key availability)
   */
  @Get('check-agent-access')
  async checkAgentToolAccess(
    @Query('toolId') toolId: string,
    @Query('agentId') agentId: string,
    @Query('userId') userId?: string,
  ) {
    const access = await this.toolAccessService.checkAgentToolAccess(
      toolId,
      agentId,
      userId,
    );

    return { success: true, data: access };
  }

  /**
   * POST /v1/tool-permissions/transfer-ownership
   * Transfer tool ownership
   */
  @Post('transfer-ownership')
  async transferOwnership(
    @Body()
    body: {
      toolId: string;
      newOwnerId: string;
      newOwnerType: 'user' | 'agent';
    },
  ) {
    const tool = await this.toolAccessService.transferOwnership(
      body.toolId,
      body.newOwnerId,
      body.newOwnerType,
    );

    return { success: true, data: tool };
  }
}
