// src/tool/tool.controller.ts

import { Controller, Post, Get, Body, Param, Put } from '@nestjs/common';
import { ToolService } from './tool.service';
import { ChatCompletionTool } from 'openai/resources/chat/completions.mjs';

@Controller({ version: '1', path: 'tools' })
export class ToolController {
  constructor(private readonly toolService: ToolService) {}

  /**
   * POST /v1/tools
   * Create a tool definition
   */
  @Post()
  async createTool(
    @Body()
    body: {
      name: string;
      schema: ChatCompletionTool;
      tags?: string[];
      rating?: number;
      version?: string;
    },
  ) {
    const created = await this.toolService.createTool(body);
    return { data: created };
  }

  /**
   * GET /v1/tools
   * Retrieve all tools
   */
  @Get()
  async getAllTools() {
    const tools = await this.toolService.getAllTools();
    return { data: tools };
  }

  /**
   * GET /v1/tools/:name
   * Retrieve a specific tool by name
   */
  @Get(':name')
  async getToolByName(@Param('name') name: string) {
    const tool = await this.toolService.getToolByName(name);
    return { data: tool };
  }

  /**
   * PUT /v1/tools/:name
   * Update the schema for a tool
   */
  @Put(':name')
  async updateTool(
    @Param('name') name: string,
    @Body()
    body: {
      schema?: ChatCompletionTool;
      tags?: string[];
      rating?: number;
      version?: string;
    },
  ) {
    const updated = await this.toolService.updateToolByName({
      name,
      ...body,
    });
    return { data: updated };
  }
}
