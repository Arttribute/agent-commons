// src/agent/agent-tools.controller.ts
import { TypedBody } from '@nestia/core';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  forwardRef,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Public, RateLimitGuard, RateLimit } from '~/modules/auth';
import { ChatCompletionMessageToolCall } from 'openai/resources/index.mjs';

import { AgentService } from './agent.service';
import { CommonToolService } from '~/tool/tools/common-tool.service';
import { EthereumToolService } from '~/tool/tools/ethereum-tool.service';
import { ToolService } from '~/tool/tool.service';
import {
  ToolInvocationService,
  DynamicInvocationContext,
} from '~/tool/tool-invocation.service';
import { SpaceToolsService } from '~/space/space-tools.service';
import { SessionService } from '~/session/session.service';
import { DatabaseService } from '~/modules/database/database.service';
import { McpToolDiscoveryService } from '~/mcp/mcp-tool-discovery.service';
import * as schema from '#/models/schema';
import { eq, sql } from 'drizzle-orm';

@Controller({ version: '1', path: 'agents' })
export class AgentToolsController {
  constructor(
    private readonly agent: AgentService,

    // "forwardRef" for potential circular dependencies
    @Inject(forwardRef(() => EthereumToolService))
    private ethereumToolService: EthereumToolService,

    @Inject(forwardRef(() => CommonToolService))
    private commonToolService: CommonToolService,

    // The DB-based tool service for dynamic "apiSpec" calls
    private readonly toolService: ToolService,
    private readonly spaceTools: SpaceToolsService,

    // Session service (OAuth token injection now lives in ToolInvocationService)
    private readonly sessionService: SessionService,

    // Database and MCP services
    private readonly db: DatabaseService,
    private readonly mcpToolDiscovery: McpToolDiscoveryService,

    // Shared OAuth-aware dynamic tool executor (also used by workflows)
    private readonly toolInvocation: ToolInvocationService,
  ) {}

  @Post('tools')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 200, windowMs: 60_000, keyStrategy: 'agent' })
  async makeAgentToolCall(
    @TypedBody()
    body: {
      toolCall: any;
      metadata: {
        agentId: string;
        privateKey?: string;
        sessionId?: string;
        spaceId?: string;
        runId?: string;
        toolCallId?: string;
      };
    },
    @Headers('x-internal-tool-secret') internalSecret?: string,
  ) {
    // This endpoint executes tools with server-held credentials (OAuth tokens,
    // tool keys). It is only ever called by this API's own agent loop, so it
    // must never be reachable with arbitrary external input.
    this.assertInternalCaller(internalSecret);

    const { metadata, toolCall } = body;
    const args = toolCall.args;
    const functionName = toolCall.name;
    const { agentId, spaceId } = metadata;

    // 1) Verify agent
    const agent = await this.agent.getAgent({ agentId });
    if (!agent) {
      console.log('Agent not found:', agentId);
      throw new BadRequestException(`Agent "${agentId}" not found`);
    }

    console.log('Tool Call', { functionName, args, metadata });

    // Initialize execution logging
    const startTime = Date.now();
    let executionLogId: string | null = null;
    let toolId: string | null = null;

    try {
      // ------------------------------------------------------------------------------------
      // 3a) SPACE tools (discovered from web capture) take highest precedence
      // ------------------------------------------------------------------------------------
      const spaceToolMatch = spaceId
        ? this.spaceTools.findToolByName(functionName, spaceId)
        : this.spaceTools.findToolByName(functionName);
      if (spaceToolMatch) {
        const result = await this.toolInvocation.invokeDynamicTool(
          spaceToolMatch.tool.apiSpec,
          args,
          await this.resolveInjectionContext(metadata),
        );
        await this.logToolSuccess(executionLogId, startTime, result);
        return result;
      }

      // ------------------------------------------------------------------------------------
      // 3b) MCP tools - Check for tools from MCP servers
      // ------------------------------------------------------------------------------------
      try {
        const mcpTools = await this.mcpToolDiscovery.getToolsByOwner({
          ownerId: agent.owner || agentId,
          ownerType: agent.owner ? 'user' : 'agent',
        });
        const mcpTool = mcpTools.find((t) => t.toolName === functionName);

        if (mcpTool) {
          console.log('Executing MCP tool:', functionName);
          const result = await this.mcpToolDiscovery.invokeTool({
            serverId: mcpTool.serverId,
            toolName: mcpTool.toolName,
            args,
          });
          await this.logToolSuccess(executionLogId, startTime, result);
          return result;
        }
      } catch (mcpError) {
        console.warn('MCP tool check failed:', mcpError);
        // Continue to next tool source
      }

      // ------------------------------------------------------------------------------------
      // 3c) DB-based "tool" from the tool table
      // If found AND has an apiSpec, do dynamic approach. Otherwise, fallback to next check.
      // ------------------------------------------------------------------------------------
      let dbTool = null;
      try {
        dbTool = await this.toolService.getToolByName(functionName);
        toolId = dbTool?.toolId || null;
      } catch (err) {
        // Not found in tool table
        dbTool = null;
      }

      // Create execution log entry
      if (toolId || dbTool) {
        executionLogId = await this.logToolStart(
          toolId,
          agentId,
          metadata.sessionId,
          args,
        );
      }

      if (dbTool && dbTool.apiSpec) {
        // OAuth-backed tools act with a user's connected account, so they
        // must be explicitly enabled for this agent — platform visibility
        // alone is not enough.
        if (dbTool.apiSpec.authType === 'oauth2') {
          await this.assertAgentToolEnabled(dbTool.toolId, functionName, agentId);
        }
        // => dynamic approach (API fetch)
        const result = await this.toolInvocation.invokeDynamicTool(
          dbTool.apiSpec,
          args,
          await this.resolveInjectionContext(metadata),
        );
        await this.logToolSuccess(executionLogId, startTime, result);
        return result;
      } else if (dbTool) {
        // If a DB-based tool is found but no apiSpec, you might do a code-based approach or error out
        // For now, let's just error or handle a partial scenario:
        console.log('Tool found in DB, but no apiSpec:', dbTool);
        const error = new BadRequestException(
          `Tool "${functionName}" found in DB, but has no apiSpec or static method.`,
        );
        await this.logToolError(executionLogId, startTime, error);
        throw error;
      }

      // ------------------------------------------------------------------------------------
      // 4) Static approach in our local code (commonToolService, ethereumToolService)
      // ------------------------------------------------------------------------------------
      const staticService = [
        this.commonToolService,
        this.ethereumToolService,
      ].find(
        (service) => typeof (service as any)[functionName] === 'function',
      );

      if (staticService) {
        // 4a) Call the static method
        const staticArgs =
          args && typeof args === 'object'
            ? {
                ...args,
                agentId: args.agentId ?? metadata.agentId,
                sessionId: args.sessionId ?? metadata.sessionId,
              }
            : args;
        // @ts-expect-error because we know it's a function
        const data = await staticService[functionName](staticArgs, metadata);
        await this.logToolSuccess(executionLogId, startTime, data);
        return data;
      }

      // For now, let's just throw an error if we got here
      console.log('No tool found for:', functionName);
      const error = new BadRequestException(
        `No static, dynamic, or MCP tool found for "${functionName}"`,
      );
      await this.logToolError(executionLogId, startTime, error);
      throw error;
    } catch (error: any) {
      // Log any uncaught errors
      await this.logToolError(executionLogId, startTime, error);
      throw error;
    }
  }

  /**
   * Only this API's own agent loop may call the tool-execution endpoint.
   * When API_SECRET_KEY is configured the caller must present it via the
   * x-internal-tool-secret header; without it (local dev with auth disabled)
   * the check is skipped.
   */
  private assertInternalCaller(internalSecret?: string) {
    const expected = process.env.API_SECRET_KEY;
    const authRequired = process.env.API_AUTH_REQUIRED !== 'false';
    if (!expected || !authRequired) return;

    const provided = internalSecret ?? '';
    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    const matches =
      expectedBuf.length === providedBuf.length &&
      timingSafeEqual(expectedBuf, providedBuf);

    if (!matches) {
      throw new UnauthorizedException(
        'Tool execution endpoint is internal to the agent runtime',
      );
    }
  }

  /**
   * OAuth-backed tools must be explicitly enabled for the calling agent via
   * an agent_tool assignment (created in Studio → Agent → Tools).
   */
  private async assertAgentToolEnabled(
    toolId: string,
    functionName: string,
    agentId: string,
  ) {
    const mappings = await this.db.query.agentTool.findMany({
      // Use the column ref so Drizzle applies its table alias; cast to text
      // in case the column type drifts from the schema.
      where: (t) => sql`${t.agentId}::text = ${agentId}`,
    });

    const enabled = mappings.some(
      (m: any) => m.toolId === toolId && m.isEnabled,
    );

    if (!enabled) {
      throw new ForbiddenException(
        `Tool "${functionName}" uses a connected account and is not enabled for this agent. ` +
          `Enable it for the agent in Studio → Agents → Tools before use.`,
      );
    }
  }

  /**
   * Resolve the OAuth account context for a dynamic tool call: the session's
   * initiator and the calling agent's owner. Delegated execution lives in
   * ToolInvocationService (shared with the workflow executor).
   */
  private async resolveInjectionContext(metadata: {
    agentId: string;
    sessionId?: string;
  }): Promise<DynamicInvocationContext> {
    let sessionInitiator: string | undefined;
    let agentOwnerId: string | undefined;

    if (metadata.sessionId) {
      try {
        const session = await this.sessionService.getSession({
          id: metadata.sessionId,
        });
        sessionInitiator = session?.initiator || undefined;
      } catch (err) {
        console.warn('Failed to get session for OAuth resolution:', err);
      }
    }

    if (metadata.agentId) {
      const agent = await this.agent.getAgent({ agentId: metadata.agentId });
      agentOwnerId = agent?.ownerUserId || agent?.owner || undefined;
    }

    return { sessionInitiator, agentOwnerId };
  }

  /**
   * Log tool execution start
   */
  private async logToolStart(
    toolId: string | null,
    agentId: string,
    sessionId: string | undefined,
    args: Record<string, any>,
  ): Promise<string | null> {
    try {
      if (!toolId) return null;

      const [log] = await this.db
        .insert(schema.toolExecutionLog)
        .values({
          toolId,
          agentId,
          sessionId: sessionId || null,
          status: 'success', // Will update to success/error later
          startedAt: new Date(),
          inputArgs: args,
        })
        .returning();

      return log.logId;
    } catch (error) {
      console.error('Failed to log tool start:', error);
      return null;
    }
  }

  /**
   * Log tool execution success
   */
  private async logToolSuccess(
    logId: string | null,
    startTime: number,
    result: any,
  ): Promise<void> {
    try {
      if (!logId) return;

      // Sanitize result to remove any sensitive data
      const sanitizedResult = this.sanitizeOutput(result);

      await this.db
        .update(schema.toolExecutionLog)
        .set({
          status: 'success',
          completedAt: new Date(),
          duration: Date.now() - startTime,
          outputData: sanitizedResult,
        })
        .where(eq(schema.toolExecutionLog.logId, logId));
    } catch (error) {
      console.error('Failed to log tool success:', error);
    }
  }

  /**
   * Log tool execution error
   */
  private async logToolError(
    logId: string | null,
    startTime: number,
    error: any,
  ): Promise<void> {
    try {
      if (!logId) return;

      await this.db
        .update(schema.toolExecutionLog)
        .set({
          status: 'error',
          completedAt: new Date(),
          duration: Date.now() - startTime,
          errorMessage: error?.message || String(error),
          errorStack: error?.stack || null,
        })
        .where(eq(schema.toolExecutionLog.logId, logId));
    } catch (err) {
      console.error('Failed to log tool error:', err);
    }
  }

  /**
   * Sanitize output data to remove sensitive information
   */
  private sanitizeOutput(data: any): any {
    if (!data) return data;

    // Convert to JSON and back to remove any non-serializable data
    try {
      const stringified = JSON.stringify(data, (key, value) => {
        // Remove any keys that might contain sensitive data
        if (
          key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('key')
        ) {
          return '[REDACTED]';
        }
        return value;
      });
      return JSON.parse(stringified);
    } catch {
      return { message: 'Output could not be serialized' };
    }
  }
}
