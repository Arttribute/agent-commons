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
  ) {}

  @Post('tools')
  async makeAgentToolCall(
    @TypedBody()
    body: {
      toolCall: any;
      metadata: any; // e.g. { agentId: string }
    },
  ) {
    const { metadata, toolCall } = body;
    const args = toolCall.args;
    const functionName = toolCall.name;
    const { agentId } = metadata;

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

    // ------------------------------------------------------------------------------------
    // 3) First check: a DB-based "tool" from the tool table
    // If found AND has an apiSpec, do dynamic approach. Otherwise, fallback to next check.
    // ------------------------------------------------------------------------------------
    let dbTool = null;
    try {
      dbTool = await this.toolService.getToolByName(functionName);
    } catch (err) {
      // Not found in tool table
      dbTool = null;
    }

    if (dbTool && dbTool.schema?.apiSpec) {
      // => dynamic approach (API fetch)
      return await this.invokeDynamicTool(dbTool.schema.apiSpec, args);
    } else if (dbTool) {
      // If a DB-based tool is found but no apiSpec, you might do a code-based approach or error out
      // For now, let's just error or handle a partial scenario:
      console.log('Tool found in DB, but no apiSpec:', dbTool);
      throw new BadRequestException(
        `Tool "${functionName}" found in DB, but has no apiSpec or static method.`,
      );
    }

    // ------------------------------------------------------------------------------------
    // 4) Second check: "static" approach in our local code (commonToolService, ethereumToolService)
    // ------------------------------------------------------------------------------------
    const staticService = [
      this.commonToolService,
      this.ethereumToolService,
    ].find((service) => typeof (service as any)[functionName] === 'function');

    if (staticService) {
      // 4a) Call the static method
      // @ts-expect-error because we know it's a function
      const data = await staticService[functionName](args, metadata);
      return data;
    }

    // ------------------------------------------------------------------------------------
    // 5) Third check: Resource-based tools in resource table
    //    For example, the functionName might be "resourceTool_123",
    //    or the resource might store a name inside resource.schema.tool.name
    // ------------------------------------------------------------------------------------

    // (A) If your approach is to name them "resourceTool_<id>", parse the ID from the name:
    const match = functionName.match(/^resourceTool_(\w+)$/);
    if (match) {
      const resourceId = match[1]; // captured group
      console.log('Resource-based tool ID:', resourceId);

      // Try to fetch that resource
      const resource = await this.resourceService.getResourceById(resourceId);
      if (!resource) {
        console.log('Resource-based tool not found:', resourceId);
        throw new BadRequestException(
          `Resource-based tool not found for ID "${resourceId}"`,
        );
      }

      // If resource.schema.tool has an apiSpec, do dynamic approach:
      if (resource.schema?.apiSpec) {
        return await this.invokeDynamicTool(resource.schema.apiSpec, args);
      }
      // Otherwise, if it points to a static method name, you'd do that approach
      // Or throw an error if no approach:
      console.log('Resource-based tool has no apiSpec:', resource);
      throw new BadRequestException(
        `Resource-based tool #${resourceId} has no "apiSpec" or static fallback`,
      );
    }

    // (B) If your approach is to store the "functionName" inside resource.schema.tool.name
    // you'd do a direct resource search by that name. e.g.:
    //
    // const resource = await this.resourceService.findResourceByFunctionName(functionName);
    // if (resource && resource.schema?.tool?.apiSpec) { ... }

    // For now, let's just throw an error if we got here
    console.log('No tool found for:', functionName);
    throw new BadRequestException(
      `No static, dynamic, or resource-based tool found for "${functionName}"`,
    );
  }

  /**
   * The "dynamic" approach for either DB-based or resource-based apiSpec:
   * build a request to external API from the tool's `apiSpec`.
   */
  private async invokeDynamicTool(
    apiSpec: {
      method: string;
      baseUrl: string;
      path: string;
      headers?: Record<string, string>;
      queryParams?: Record<string, string>;
      bodyTemplate?: any;
    },
    parsedArgs: Record<string, any>,
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

    // 2) Build request body if not GET
    let requestBody: any;
    if (method.toUpperCase() !== 'GET' && bodyTemplate) {
      requestBody = this.buildBodyFromTemplate(bodyTemplate, parsedArgs);
    }

    // 3) Execute fetch
    const response = await fetch(finalUrl, {
      method,
      headers: headers ?? {},
      body: requestBody ? JSON.stringify(requestBody) : undefined,
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
}
