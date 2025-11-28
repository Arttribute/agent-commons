import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './workflow-executor.service';

/**
 * WorkflowController
 *
 * REST API endpoints for workflow management
 */
@Controller({ version: '1', path: 'workflows' })
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly workflowExecutor: WorkflowExecutorService,
  ) {}

  /**
   * Create a new workflow
   * POST /v1/workflows
   */
  @Post()
  async createWorkflow(
    @Body()
    body: {
      name: string;
      description?: string;
      definition: any;
      ownerId: string;
      ownerType: 'user' | 'agent';
      inputSchema?: any;
      outputSchema?: any;
      isPublic?: boolean;
      category?: string;
      tags?: string[];
    },
  ) {
    return this.workflowService.createWorkflow(body);
  }

  /**
   * List workflows
   * GET /v1/workflows?ownerId=xxx&ownerType=user
   */
  @Get()
  async listWorkflows(
    @Query('ownerId') ownerId?: string,
    @Query('ownerType') ownerType?: 'user' | 'agent',
    @Query('limit') limit?: number,
  ) {
    if (!ownerId || !ownerType) {
      throw new BadRequestException('ownerId and ownerType are required');
    }

    return this.workflowService.listWorkflows(ownerId, ownerType);
  }

  /**
   * Discover public workflows
   * GET /v1/workflows/public?category=automation&tags=api,data
   */
  @Get('public')
  async discoverPublicWorkflows(
    @Query('category') category?: string,
    @Query('tags') tags?: string,
    @Query('limit') limit?: number,
  ) {
    return this.workflowService.discoverPublicWorkflows({
      category,
      tags: tags ? tags.split(',') : undefined,
      limit: limit ? parseInt(limit.toString()) : 50,
    });
  }

  /**
   * Get workflow by ID
   * GET /v1/workflows/:id
   */
  @Get(':id')
  async getWorkflow(@Param('id') workflowId: string) {
    return this.workflowService.getWorkflow(workflowId);
  }

  /**
   * Update workflow
   * PUT /v1/workflows/:id
   */
  @Put(':id')
  async updateWorkflow(
    @Param('id') workflowId: string,
    @Body()
    updates: {
      name?: string;
      description?: string;
      definition?: any;
      inputSchema?: any;
      outputSchema?: any;
      isPublic?: boolean;
      category?: string;
      tags?: string[];
    },
  ) {
    return this.workflowService.updateWorkflow(workflowId, updates);
  }

  /**
   * Delete workflow
   * DELETE /v1/workflows/:id
   */
  @Delete(':id')
  async deleteWorkflow(@Param('id') workflowId: string) {
    return this.workflowService.deleteWorkflow(workflowId);
  }

  /**
   * Fork/remix a public workflow
   * POST /v1/workflows/:id/fork
   */
  @Post(':id/fork')
  async forkWorkflow(
    @Param('id') workflowId: string,
    @Body()
    body: {
      newOwnerId: string;
      newOwnerType: 'user' | 'agent';
      customizations?: {
        name?: string;
        description?: string;
        isPublic?: boolean;
      };
    },
  ) {
    return this.workflowService.forkWorkflow({
      workflowId,
      newOwnerId: body.newOwnerId,
      newOwnerType: body.newOwnerType,
      name: body.customizations?.name,
    });
  }

  /**
   * Execute a workflow
   * POST /v1/workflows/:id/execute
   */
  @Post(':id/execute')
  async executeWorkflow(
    @Param('id') workflowId: string,
    @Body()
    body: {
      agentId: string;
      sessionId?: string;
      taskId?: string;
      inputData?: Record<string, any>;
      userId?: string;
    },
  ) {
    const executionId = await this.workflowExecutor.executeWorkflow({
      workflowId,
      agentId: body.agentId,
      sessionId: body.sessionId,
      taskId: body.taskId,
      inputData: body.inputData || {},
      userId: body.userId,
    });

    return {
      executionId,
      status: 'started',
      message: 'Workflow execution started',
    };
  }

  /**
   * Get workflow execution status
   * GET /v1/workflows/:id/executions/:executionId
   */
  @Get(':id/executions/:executionId')
  async getExecutionStatus(
    @Param('id') workflowId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.workflowExecutor.getExecutionStatus(executionId);
  }

  /**
   * List workflow executions
   * GET /v1/workflows/:id/executions
   */
  @Get(':id/executions')
  async listExecutions(
    @Param('id') workflowId: string,
    @Query('limit') limit?: number,
  ) {
    return this.workflowExecutor.listExecutions(
      workflowId,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  /**
   * Cancel a running workflow execution
   * POST /v1/workflows/:id/executions/:executionId/cancel
   */
  @Post(':id/executions/:executionId/cancel')
  async cancelExecution(
    @Param('id') workflowId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.workflowExecutor.cancelExecution(executionId);
  }
}
