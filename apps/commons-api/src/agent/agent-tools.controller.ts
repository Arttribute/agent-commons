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
import { ResourceService } from '~/resource/resource.service';
import { SpaceToolsService } from '~/space/space-tools.service';
import { SessionService } from '~/session/session.service';
import { OAuthTokenInjectionService } from '~/oauth/oauth-token-injection.service';
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
        // OAuth-backed tools act with a user's connected account, so they
        // must be explicitly enabled for this agent — platform visibility
        // alone is not enough.
        if (dbTool.apiSpec.authType === 'oauth2') {
          await this.assertAgentToolEnabled(dbTool.toolId, functionName, agentId);
        }
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
      bodyTransform?: string;
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

    // 1) Build final URL with query params.
    // Path segments are URI-encoded during substitution; query values must be
    // substituted raw because URLSearchParams encodes them itself (encoding
    // twice mangles RFC3339 timestamps etc. and upstream APIs reject them).
    let finalUrl = `${baseUrl}${this.replaceTemplate(path, parsedArgs, { encode: true })}`;
    const url = new URL(finalUrl);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        const value = this.replaceTemplate(v, parsedArgs, { encode: false });
        if (value !== '') {
          url.searchParams.set(k, value);
        }
      }
    }
    finalUrl = url.toString();

    // 2) Build request body for non-GET
    let requestBody: any = undefined;
    const methodUpper = method.toUpperCase();
    if (['POST', 'PUT', 'PATCH'].includes(methodUpper)) {
      if (apiSpec.bodyTransform) {
        requestBody = this.applyBodyTransform(apiSpec.bodyTransform, parsedArgs);
      } else if (bodyTemplate) {
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
          agentOwner = agent?.ownerUserId || agent?.owner || undefined;
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
          `OAuth authorization failed for provider "${apiSpec.oauthProviderKey}": ${oauthError.message} ` +
            `The user must connect (or reconnect) this provider in Studio → Tools before this tool can run.`,
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
      // Surface the upstream error detail so the agent (and user) can see the
      // real cause — e.g. Google's "Invalid value" or "insufficient scopes" —
      // instead of an opaque status code.
      const detail = await this.extractUpstreamError(response);
      if (response.status === 401 || response.status === 403) {
        throw new BadRequestException(
          `Upstream API rejected the request (${response.status}): ${detail}. ` +
            `The connected ${apiSpec.oauthProviderKey ?? 'API'} account is likely missing the required scopes — ` +
            `the user should reconnect the provider and grant the needed permissions.`,
        );
      }
      throw new BadRequestException(
        `Upstream API error (${response.status} ${response.statusText}): ${detail}`,
      );
    }
    return await response.json();
  }

  /** Pull a human-readable error message out of an upstream API response. */
  private async extractUpstreamError(response: Response): Promise<string> {
    try {
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        return (
          parsed?.error?.message ??
          parsed?.error_description ??
          (typeof parsed?.error === 'string' ? parsed.error : undefined) ??
          parsed?.message ??
          text.slice(0, 500)
        );
      } catch {
        return text.slice(0, 500) || response.statusText;
      }
    } catch {
      return response.statusText;
    }
  }

  /**
   * Named body transforms for tools whose request body cannot be expressed as
   * a JSON template (e.g. Gmail's base64url RFC822 `raw` message).
   */
  private applyBodyTransform(
    transform: string,
    args: Record<string, any>,
  ): any {
    switch (transform) {
      case 'gmailRawMessage': {
        const to = String(args.to ?? '').trim();
        const subject = String(args.subject ?? '');
        const body = String(args.body ?? '');
        if (!to) {
          throw new BadRequestException(
            'Missing required "to" recipient for Gmail send',
          );
        }
        const headers = [
          `To: ${to}`,
          args.cc ? `Cc: ${String(args.cc)}` : null,
          args.bcc ? `Bcc: ${String(args.bcc)}` : null,
          // RFC 2047 base64 encoding keeps non-ASCII subjects intact
          `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset="UTF-8"',
          'Content-Transfer-Encoding: 7bit',
        ].filter(Boolean);
        const rfc822 = `${headers.join('\r\n')}\r\n\r\n${body}`;
        const raw = Buffer.from(rfc822, 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        return { raw };
      }
      default:
        throw new BadRequestException(`Unknown bodyTransform "${transform}"`);
    }
  }

  private replaceTemplate(
    template: string,
    args: Record<string, any>,
    options: { encode: boolean } = { encode: true },
  ): string {
    return template.replace(/\{([^}]+)\}/g, (_match, key) => {
      const value = args[key];
      if (value === undefined || value === null) return '';
      return options.encode
        ? encodeURIComponent(String(value))
        : String(value);
    });
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
