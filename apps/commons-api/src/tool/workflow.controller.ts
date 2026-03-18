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
  Sse,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { WorkflowService } from './workflow.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { OwnerGuard, OwnerOnly } from '~/modules/auth';

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
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'workflow', idParam: 'id' })
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
  @UseGuards(OwnerGuard)
  @OwnerOnly({ table: 'workflow', idParam: 'id' })
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
      agentId?: string;
      sessionId?: string;
      taskId?: string;
      inputData?: Record<string, any>;
      inputs?: Record<string, any>; // Accept both inputData and inputs
      userId?: string;
    },
  ) {
    const executionId = await this.workflowExecutor.executeWorkflow({
      workflowId,
      agentId: body.agentId,
      sessionId: body.sessionId,
      taskId: body.taskId,
      inputData: body.inputData || body.inputs || {},
      userId: body.userId,
    });

    // Fetch and return the execution details
    const execution = await this.workflowExecutor.getExecutionStatus(executionId);

    return {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      result: execution.outputData,
      error: execution.errorMessage,
      stepResults: execution.nodeResults,
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
    const execution = await this.workflowExecutor.getExecutionStatus(executionId);

    return {
      executionId: execution.executionId,
      workflowId: execution.workflowId,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      result: execution.outputData,
      error: execution.errorMessage,
      stepResults: execution.nodeResults,
    };
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

  /**
   * Approve a paused human_approval step
   * POST /v1/workflows/:id/executions/:executionId/approve
   */
  @Post(':id/executions/:executionId/approve')
  async approveExecution(
    @Param('id') _workflowId: string,
    @Param('executionId') executionId: string,
    @Body() body: { approvalToken: string; approvalData?: Record<string, any> },
  ) {
    if (!body.approvalToken) throw new BadRequestException('approvalToken is required');
    await this.workflowExecutor.approveExecution(executionId, body.approvalToken, body.approvalData);
    return { success: true, executionId, action: 'approved' };
  }

  /**
   * Reject a paused human_approval step
   * POST /v1/workflows/:id/executions/:executionId/reject
   */
  @Post(':id/executions/:executionId/reject')
  async rejectExecution(
    @Param('id') _workflowId: string,
    @Param('executionId') executionId: string,
    @Body() body: { approvalToken: string; reason?: string },
  ) {
    if (!body.approvalToken) throw new BadRequestException('approvalToken is required');
    await this.workflowExecutor.rejectExecution(executionId, body.approvalToken, body.reason);
    return { success: true, executionId, action: 'rejected' };
  }

  /**
   * Stream workflow execution progress as SSE
   * GET /v1/workflows/:id/executions/:executionId/stream
   *
   * Emits events:
   *   { type: 'status', status, currentNode, nodeResults }
   *   { type: 'completed', outputData, nodeResults }
   *   { type: 'failed', errorMessage }
   *   { type: 'heartbeat' }  — every 5s to keep connection alive
   */
  @Get(':id/executions/:executionId/stream')
  @Sse(':id/executions/:executionId/stream')
  streamExecution(
    @Param('id') _workflowId: string,
    @Param('executionId') executionId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let lastStatus = '';
      let lastCurrentNode = '';
      let closed = false;

      const heartbeat = setInterval(() => {
        if (!closed) subscriber.next({ data: JSON.stringify({ type: 'heartbeat' }) } as any);
      }, 5000);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const execution = await this.workflowExecutor.getExecutionStatus(executionId);
          const currentNode = (execution as any).currentNode ?? '';
          if (execution.status !== lastStatus || currentNode !== lastCurrentNode) {
            lastStatus = execution.status;
            lastCurrentNode = currentNode;
            subscriber.next({
              data: JSON.stringify({
                type: 'status',
                status: execution.status,
                currentNode,
                nodeResults: execution.nodeResults,
              }),
            } as any);
          }
          if (execution.status === 'completed') {
            subscriber.next({ data: JSON.stringify({ type: 'completed', outputData: execution.outputData, nodeResults: execution.nodeResults }) } as any);
            subscriber.complete();
          } else if (execution.status === 'awaiting_approval') {
            subscriber.next({
              data: JSON.stringify({
                type: 'awaiting_approval',
                pausedAtNode: (execution as any).pausedAtNode,
                approvalToken: (execution as any).approvalToken,
              }),
            } as any);
            // Keep stream open — client will continue polling after approval
          } else if (execution.status === 'failed' || execution.status === 'cancelled') {
            subscriber.next({ data: JSON.stringify({ type: execution.status, errorMessage: (execution as any).errorMessage }) } as any);
            subscriber.complete();
          }
        } catch (err: any) {
          subscriber.next({ data: JSON.stringify({ type: 'error', message: err.message }) } as any);
          subscriber.complete();
        }
      }, 750);

      req.on('close', () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(poll);
      });

      return () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(poll);
      };
    });
  }
}
