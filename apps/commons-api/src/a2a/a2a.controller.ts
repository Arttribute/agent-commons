import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  Sse,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { Public } from '../modules/auth';
import { A2aService } from './a2a.service';
import {
  JsonRpcRequest,
  JsonRpcResponse,
  RPC_ERRORS,
  TasksSendParams,
  TasksGetParams,
  TasksCancelParams,
  PushNotificationConfig,
} from './a2a.types';

/**
 * A2A (Agent-to-Agent) Protocol Controller
 *
 * Endpoints:
 *   GET  /.well-known/agent.json?agentId=xxx   — Agent Card (discovery)
 *   GET  /v1/a2a/:agentId/.well-known          — Agent Card (per-agent)
 *   POST /v1/a2a/:agentId                      — JSON-RPC 2.0 task handler
 *   GET  /v1/a2a/:agentId/tasks/:taskId/stream — SSE stream for a task
 *   GET  /v1/a2a/:agentId/tasks                — List tasks for agent
 */
@Controller()
export class A2aController {
  constructor(private readonly a2aService: A2aService) {}

  // ── Agent Card endpoints ───────────────────────────────────────────────────

  /**
   * Global discovery endpoint.
   * GET /.well-known/agent.json?agentId=xxx
   *
   * A2A clients look here first to discover the agent's capabilities.
   */
  @Public()
  @Get('.well-known/agent.json')
  async getGlobalAgentCard(
    @Query('agentId') agentId: string,
    @Req() req: Request,
  ) {
    if (!agentId) throw new BadRequestException('agentId query param is required');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return this.a2aService.getAgentCard(agentId, baseUrl);
  }

  /**
   * Per-agent discovery endpoint.
   * GET /v1/a2a/:agentId/.well-known
   */
  @Public()
  @Get('v1/a2a/:agentId/.well-known')
  async getAgentCard(@Param('agentId') agentId: string, @Req() req: Request) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return this.a2aService.getAgentCard(agentId, baseUrl);
  }

  // ── JSON-RPC 2.0 task handler ──────────────────────────────────────────────

  /**
   * Main A2A endpoint — JSON-RPC 2.0.
   * POST /v1/a2a/:agentId
   *
   * Supported methods:
   *   tasks/send            — synchronous task (returns completed task)
   *   tasks/sendSubscribe   — streaming task (returns SSE stream)
   *   tasks/get             — get task status
   *   tasks/cancel          — cancel a task
   *   tasks/pushNotificationConfig/set  — set webhook config
   *   tasks/pushNotificationConfig/get  — get webhook config
   */
  @Post('v1/a2a/:agentId')
  async handleRpc(
    @Param('agentId') agentId: string,
    @Body() rpc: JsonRpcRequest,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!rpc || rpc.jsonrpc !== '2.0' || !rpc.method) {
      res.status(400).json(this.errorResponse(rpc?.id ?? null, RPC_ERRORS.INVALID_REQUEST));
      return;
    }

    const callerId = req.headers['x-agent-id'] as string | undefined;

    try {
      switch (rpc.method) {
        case 'tasks/send':
          await this.handleSend(agentId, rpc, req, res, callerId);
          break;

        case 'tasks/sendSubscribe':
          await this.handleSendSubscribe(agentId, rpc, req, res, callerId);
          break;

        case 'tasks/get':
          await this.handleGet(rpc, res);
          break;

        case 'tasks/cancel':
          await this.handleCancel(rpc, res);
          break;

        case 'tasks/pushNotificationConfig/set':
          await this.handlePushSet(rpc, res);
          break;

        case 'tasks/pushNotificationConfig/get':
          await this.handlePushGet(rpc, res);
          break;

        default:
          res.json(this.errorResponse(rpc.id, RPC_ERRORS.METHOD_NOT_FOUND));
      }
    } catch (error: any) {
      const code = error.code ?? RPC_ERRORS.INTERNAL_ERROR.code;
      res.status(200).json(this.errorResponse(rpc.id, { code, message: error.message }));
    }
  }

  // ── SSE stream for a task ─────────────────────────────────────────────────

  /**
   * Stream task updates as Server-Sent Events.
   * GET /v1/a2a/:agentId/tasks/:taskId/stream
   *
   * Events:
   *   data: { type: 'TaskStatusUpdateEvent', ... }
   *   data: { type: 'TaskArtifactUpdateEvent', ... }
   */
  @Public()
  @Get('v1/a2a/:agentId/tasks/:taskId/stream')
  @Sse('v1/a2a/:agentId/tasks/:taskId/stream')
  streamTask(
    @Param('agentId') _agentId: string,
    @Param('taskId') taskId: string,
    @Req() req: Request,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;

      const keepalive = setInterval(() => {
        if (!closed) subscriber.next({ data: JSON.stringify({ type: 'keepalive' }) } as any);
      }, 5000);

      // Poll task status every 750ms (same pattern as workflow SSE)
      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const task = await this.a2aService.getTask(taskId);
          subscriber.next({ data: JSON.stringify({ type: 'TaskStatusUpdateEvent', taskId, status: task.status }) } as any);
          const state = task.status.state;
          if (state === 'completed' || state === 'failed' || state === 'canceled') {
            if (task.artifacts?.length) {
              subscriber.next({ data: JSON.stringify({ type: 'TaskArtifactUpdateEvent', taskId, artifacts: task.artifacts }) } as any);
            }
            subscriber.complete();
          }
        } catch (e: any) {
          subscriber.next({ data: JSON.stringify({ type: 'error', message: e.message }) } as any);
          subscriber.complete();
        }
      }, 750);

      req.on('close', () => {
        closed = true;
        clearInterval(keepalive);
        clearInterval(poll);
      });

      return () => {
        closed = true;
        clearInterval(keepalive);
        clearInterval(poll);
      };
    });
  }

  // ── List tasks ────────────────────────────────────────────────────────────

  /**
   * List recent A2A tasks for an agent.
   * GET /v1/a2a/:agentId/tasks?limit=50
   */
  @Get('v1/a2a/:agentId/tasks')
  async listTasks(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: number,
  ) {
    const tasks = await this.a2aService.listTasks(agentId, limit ? Number(limit) : 50);
    return { tasks, total: tasks.length };
  }

  // ── Private: RPC method handlers ──────────────────────────────────────────

  private async handleSend(
    agentId: string,
    rpc: JsonRpcRequest,
    req: Request,
    res: Response,
    callerId?: string,
  ): Promise<void> {
    const params = rpc.params as TasksSendParams;
    if (!params?.message) {
      res.json(this.errorResponse(rpc.id, RPC_ERRORS.INVALID_PARAMS));
      return;
    }
    const task = await this.a2aService.sendTask({
      agentId,
      taskId: params.id,
      contextId: params.message.contextId,
      message: params.message,
      callerId,
      callerUrl: req.headers['x-agent-url'] as string | undefined,
      pushNotification: params.pushNotification,
    });
    res.json(this.okResponse(rpc.id, task));
  }

  private async handleSendSubscribe(
    agentId: string,
    rpc: JsonRpcRequest,
    req: Request,
    res: Response,
    callerId?: string,
  ): Promise<void> {
    const params = rpc.params as TasksSendParams;
    if (!params?.message) {
      res.json(this.errorResponse(rpc.id, RPC_ERRORS.INVALID_PARAMS));
      return;
    }

    // Switch to SSE response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (eventType: string, data: any) => {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const gen = this.a2aService.sendSubscribeTask({
        agentId,
        taskId: params.id,
        contextId: params.message.contextId,
        message: params.message,
        callerId,
        pushNotification: params.pushNotification,
      });

      for await (const event of gen) {
        if (req.closed) break;
        // Wrap in JSON-RPC notification envelope
        sendEvent(event.type, {
          jsonrpc: '2.0',
          method: event.type,
          params: event.data,
        });
      }
    } catch (error: any) {
      sendEvent('error', this.errorResponse(rpc.id, { code: RPC_ERRORS.INTERNAL_ERROR.code, message: error.message }));
    } finally {
      res.end();
    }
  }

  private async handleGet(rpc: JsonRpcRequest, res: Response): Promise<void> {
    const params = rpc.params as TasksGetParams;
    if (!params?.id) {
      res.json(this.errorResponse(rpc.id, RPC_ERRORS.INVALID_PARAMS));
      return;
    }
    const task = await this.a2aService.getTask(params.id);
    res.json(this.okResponse(rpc.id, task));
  }

  private async handleCancel(rpc: JsonRpcRequest, res: Response): Promise<void> {
    const params = rpc.params as TasksCancelParams;
    if (!params?.id) {
      res.json(this.errorResponse(rpc.id, RPC_ERRORS.INVALID_PARAMS));
      return;
    }
    const task = await this.a2aService.cancelTask(params.id);
    res.json(this.okResponse(rpc.id, task));
  }

  private async handlePushSet(rpc: JsonRpcRequest, res: Response): Promise<void> {
    const { id, pushNotificationConfig } = rpc.params ?? {};
    if (!id || !pushNotificationConfig?.url) {
      res.json(this.errorResponse(rpc.id, RPC_ERRORS.INVALID_PARAMS));
      return;
    }
    await this.a2aService.setPushNotificationConfig(id, pushNotificationConfig as PushNotificationConfig);
    res.json(this.okResponse(rpc.id, { success: true }));
  }

  private async handlePushGet(rpc: JsonRpcRequest, res: Response): Promise<void> {
    const { id } = rpc.params ?? {};
    if (!id) {
      res.json(this.errorResponse(rpc.id, RPC_ERRORS.INVALID_PARAMS));
      return;
    }
    const config = await this.a2aService.getPushNotificationConfig(id);
    res.json(this.okResponse(rpc.id, config));
  }

  // ── JSON-RPC helpers ──────────────────────────────────────────────────────

  private okResponse(id: string | number, result: any): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result };
  }

  private errorResponse(id: string | number | null, error: { code: number; message: string; data?: any }): JsonRpcResponse {
    return { jsonrpc: '2.0', id: id ?? 0, error };
  }
}
