// src/agent/agent-tools.controller.ts
import { TypedBody } from '@nestia/core';
import {
  BadRequestException,
  Controller,
  forwardRef,
  Inject,
  Post,
} from '@nestjs/common';
import { ChatCompletionMessageToolCall } from 'openai/resources/index.mjs';
import { merge } from 'lodash';

import { AgentService } from './agent.service';
import { CommonToolService } from '~/tool/tools/common-tool.service';
import { EthereumToolService } from '~/tool/tools/ethereum-tool.service';
import { ToolService } from '~/tool/tool.service';
import { ResourceService } from '~/resource/resource.service';
import { SpaceToolsService } from '~/space/space-tools.service';
import { SessionService } from '~/session/session.service';
import { OAuthTokenInjectionService } from '~/oauth/oauth-token-injection.service';
import { DatabaseService } from '~/modules/database/database.service';
import { McpToolDiscoveryService } from '~/mcp/mcp-tool-discovery.service';
import * as schema from '#/models/schema';
import { eq } from 'drizzle-orm';

@Controller({ version: '1', path: 'agents' })
export class AgentToolsController {
  constructor(
    private readonly agent: AgentService,

    // "forwardRef" for potential circular dependencies
    @Inject(forwardRef(() => EthereumToolService))
    private ethereumToolService: EthereumToolService,

    @Inject(forwardRef(() => CommonToolService))
    private commonToolService: CommonToolService,

    @Inject(forwardRef(() => ResourceService))
    private resourceService: ResourceService,

    // The DB-based tool service for dynamic "apiSpec" calls
    private readonly toolService: ToolService,
    private readonly spaceTools: SpaceToolsService,

    // OAuth and session services
    private readonly sessionService: SessionService,
    private readonly oauthTokenInjection: OAuthTokenInjectionService,

    // Database and MCP services
    private readonly db: DatabaseService,
    private readonly mcpToolDiscovery: McpToolDiscoveryService,
  ) {}

  @Post('tools')
  async makeAgentToolCall(
    @TypedBody()
    body: {
      toolCall: any;
      metadata: {
        agentId: string;
        privateKey?: string;
        sessionId?: string;
        spaceId?: string;
      };
    },
  ) {
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

    // 2) Merge the agent's private key into metadata if needed
    const privateKey = this.agent.seedToPrivateKey(agent.wallet.seed);
    merge(metadata, { privateKey });

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
        const result = await this.invokeDynamicTool(
          spaceToolMatch.tool.apiSpec,
          args,
          metadata,
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
        // => dynamic approach (API fetch)
        const result = await this.invokeDynamicTool(
          dbTool.apiSpec,
          args,
          metadata,
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
        // @ts-expect-error because we know it's a function
        const data = await staticService[functionName](args, metadata);
        await this.logToolSuccess(executionLogId, startTime, data);
        return data;
      }

      // ------------------------------------------------------------------------------------
      // 5) Resource-based tools in resource table
      //    For example, the functionName might be "resourceTool_123",
      //    or the resource might store a name inside resource.schema.tool.name
      // ------------------------------------------------------------------------------------

      // (A) If your approach is to name them "resourceTool_<id>", parse the ID from the name:
      const match = functionName.match(/^resourceTool_(\w+)$/);
      if (match) {
        const resourceId = match[1]; // captured group
        console.log('Resource-based tool ID:', resourceId);

        // Try to fetch that resource
        const resource =
          await this.resourceService.getResourceById(resourceId);
        if (!resource) {
          console.log('Resource-based tool not found:', resourceId);
          const error = new BadRequestException(
            `Resource-based tool not found for ID "${resourceId}"`,
          );
          await this.logToolError(executionLogId, startTime, error);
          throw error;
        }

        // If resource.schema.tool has an apiSpec, do dynamic approach:
        if (resource.schema?.apiSpec) {
          const result = await this.invokeDynamicTool(
            resource.schema.apiSpec,
            args,
            metadata,
          );
          await this.logToolSuccess(executionLogId, startTime, result);
          return result;
        }
        // Otherwise, if it points to a static method name, you'd do that approach
        // Or throw an error if no approach:
        console.log('Resource-based tool has no apiSpec:', resource);
        const error = new BadRequestException(
          `Resource-based tool #${resourceId} has no "apiSpec" or static fallback`,
        );
        await this.logToolError(executionLogId, startTime, error);
        throw error;
      }

      // (B) If your approach is to store the "functionName" inside resource.schema.tool.name
      // you'd do a direct resource search by that name. e.g.:
      //
      // const resource = await this.resourceService.findResourceByFunctionName(functionName);
      // if (resource && resource.schema?.tool?.apiSpec) { ... }

      // For now, let's just throw an error if we got here
      console.log('No tool found for:', functionName);
      const error = new BadRequestException(
        `No static, dynamic, MCP, or resource-based tool found for "${functionName}"`,
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
   * The "dynamic" approach for either DB-based or resource-based apiSpec:
   * build a request to external API from the tool's `apiSpec`.
   * Automatically injects OAuth tokens if required.
   */
  private async invokeDynamicTool(
    apiSpec: {
      method: string;
      baseUrl: string;
      path: string;
      headers?: Record<string, string>;
      queryParams?: Record<string, string>;
      bodyTemplate?: any;
      authType?: string;
      oauthProviderKey?: string;
      oauthTokenLocation?: 'header' | 'query' | 'body';
      oauthTokenKey?: string;
      oauthTokenPrefix?: string;
    },
    parsedArgs: Record<string, any>,
    metadata: {
      agentId: string;
      sessionId?: string;
      spaceId?: string;
      privateKey?: string;
    },
  ): Promise<any> {
    const { method, baseUrl, path, headers, queryParams, bodyTemplate } =
      apiSpec;

    // 1) Build final URL with query params
    let finalUrl = `${baseUrl}${path}`;
    const url = new URL(finalUrl);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        const matched = v.match(/^\{(.+)\}$/);
        if (matched) {
          const argKey = matched[1];
          if (parsedArgs[argKey] !== undefined) {
            url.searchParams.set(k, parsedArgs[argKey].toString());
          }
        } else {
          url.searchParams.set(k, v);
        }
      }
    }
    finalUrl = url.toString();

    // 2) Build request body for non-GET
    let requestBody: any = undefined;
    const methodUpper = method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(methodUpper)) {
      if (bodyTemplate) {
        requestBody = this.buildBodyFromTemplate(bodyTemplate, parsedArgs);
      } else if (parsedArgs && Object.keys(parsedArgs).length > 0) {
        // If no template, but args exist, send args as JSON body
        requestBody = parsedArgs;
      }
    }

    // 3) Prepare HTTP request
    let httpRequest: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: any;
    } = {
      url: finalUrl,
      method,
      headers: headers ?? {},
      body: requestBody,
    };

    // 4) Inject OAuth token if required
    if (apiSpec.authType === 'oauth2' && apiSpec.oauthProviderKey) {
      try {
        // Get session initiator and agent owner for OAuth resolution
        let sessionInitiator: string | undefined;
        let agentOwner: string | undefined;

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

        // Get agent owner
        if (metadata.agentId) {
          const agent = await this.agent.getAgent({ agentId: metadata.agentId });
          agentOwner = agent?.owner || undefined;
        }

        // Inject OAuth token
        httpRequest = await this.oauthTokenInjection.injectOAuthToken({
          toolConfig: apiSpec,
          sessionInitiator,
          agentOwnerId: agentOwner,
          httpRequest,
        });
      } catch (oauthError: any) {
        throw new BadRequestException(
          `OAuth authentication failed: ${oauthError.message}`,
        );
      }
    }

    // 5) Execute fetch
    const response = await fetch(httpRequest.url, {
      method: httpRequest.method,
      headers: httpRequest.headers,
      body: httpRequest.body ? JSON.stringify(httpRequest.body) : undefined,
    });

    if (!response.ok) {
      throw new BadRequestException(
        `Dynamic API error: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  }

  /**
   * Recursively replace placeholders in a JSON template object
   */
  private buildBodyFromTemplate(template: any, args: Record<string, any>): any {
    if (Array.isArray(template)) {
      return template.map((elem) => this.buildBodyFromTemplate(elem, args));
    } else if (template && typeof template === 'object') {
      const result: any = {};
      for (const [key, val] of Object.entries(template)) {
        result[key] = this.buildBodyFromTemplate(val, args);
      }
      return result;
    } else if (typeof template === 'string') {
      const matched = template.match(/^\{(.+)\}$/);
      if (matched) {
        const argKey = matched[1];
        return args[argKey];
      }
      return template;
    } else {
      // number, boolean, etc.
      return template;
    }
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
