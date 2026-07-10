import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ToolLoaderService } from '~/tool/tool-loader.service';
import { ToolService } from '~/tool/tool.service';
import { MemoryService } from '~/memory/memory.service';
import { AgentService } from '../agent.service';
import { AgentToolsController } from '../agent-tools.controller';

@Controller({ version: '1', path: 'runtime/agents/:agentId/tools' })
export class RuntimeToolBridgeController {
  constructor(
    private readonly agents: AgentService,
    private readonly loader: ToolLoaderService,
    private readonly toolService: ToolService,
    private readonly memory: MemoryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Get()
  async list(
    @Param('agentId') agentId: string,
    @Headers('x-agent-commons-agent-id') binding: string | undefined,
    @Req() req: any,
  ) {
    this.assertRuntimeCaller(agentId, binding, req.principal);
    const agent = await this.agents.getAgent({ agentId });
    const staticToolDefs = this.toolService
      .getStaticTools()
      .map((tool) => tool.schema);
    const tools = await this.loader.loadToolsForAgent({
      agentId,
      userId: agent.ownerUserId ?? agent.owner ?? undefined,
      staticToolDefs,
      endpoint: '/v1/runtime/agents/:agentId/tools/invoke',
    });
    return {
      data: [
        {
          name: 'shared_memory_search',
          description:
            'Search the latest version of memories shared across this agent team.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              limit: { type: 'number' },
            },
            required: ['query'],
          },
          category: 'platform-memory',
        },
        {
          name: 'shared_memory_write',
          description:
            'Append an attributed version to shared team memory. Pass expectedVersion to prevent lost concurrent updates.',
          parameters: {
            type: 'object',
            properties: {
              scopeId: { type: 'string' },
              key: { type: 'string' },
              content: { type: 'string' },
              summary: { type: 'string' },
              expectedVersion: { type: 'number' },
            },
            required: ['scopeId', 'key', 'content'],
          },
          category: 'platform-memory',
        },
        ...tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description ?? '',
          parameters: tool.function.parameters ?? {
            type: 'object',
            properties: {},
          },
          category: tool.category,
          toolId: tool.toolId,
        })),
      ],
    };
  }

  @Post('invoke')
  async invoke(
    @Param('agentId') agentId: string,
    @Headers('x-agent-commons-agent-id') binding: string | undefined,
    @Body()
    body: { name?: string; args?: Record<string, unknown>; sessionId?: string },
    @Req() req: any,
  ) {
    this.assertRuntimeCaller(agentId, binding, req.principal);
    if (!body.name) throw new ForbiddenException('Tool name is required');
    if (body.name === 'shared_memory_search') {
      return {
        data: await this.memory.retrieveSharedRelevant(
          agentId,
          String(body.args?.query ?? ''),
          Number(body.args?.limit ?? 12),
        ),
      };
    }
    if (body.name === 'shared_memory_write') {
      return {
        data: await this.memory.appendSharedMemory({
          scopeId: String(body.args?.scopeId ?? ''),
          agentId,
          sessionId: body.sessionId,
          key: String(body.args?.key ?? ''),
          content: String(body.args?.content ?? ''),
          summary: body.args?.summary ? String(body.args.summary) : undefined,
          expectedVersion:
            body.args?.expectedVersion === undefined
              ? undefined
              : Number(body.args.expectedVersion),
        }),
      };
    }
    const controller = this.moduleRef.get(AgentToolsController, {
      strict: false,
    });
    return controller.makeAgentToolCall(
      {
        toolCall: { name: body.name, args: body.args ?? {} },
        metadata: {
          agentId,
          sessionId: body.sessionId,
        },
      },
      process.env.API_SECRET_KEY,
    );
  }

  private assertRuntimeCaller(
    agentId: string,
    binding: string | undefined,
    principal: any,
  ) {
    if (
      principal?.principalType !== 'service' ||
      !principal.scopes?.includes('agents:run')
    ) {
      throw new ForbiddenException(
        'Agent runtime service authorization required',
      );
    }
    if (!binding || binding !== agentId) {
      throw new ForbiddenException('Runtime binding does not match agent');
    }
  }
}
