// src/tool/tool.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
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
      owner?: string;
      ownerType?: 'user' | 'agent' | 'platform';
      visibility?: 'public' | 'private' | 'platform';
      tags?: string[];
      rating?: number;
      version?: string;
    },
  ) {
    const created = await this.toolService.createTool(body);
    return { data: created };
  }

  /**
   * GET /v1/tools/static
   * Retrieve static/common tools available to all agents
   */
  @Get('static')
  async getStaticTools() {
    const tools = this.toolService.getStaticTools();
    return { data: tools };
  }

  /**
   * GET /v1/tools
   * Retrieve all tools (with optional owner filter)
   */
  @Get()
  async getAllTools(
    @Query('owner') owner?: string,
    @Query('ownerType') ownerType?: 'user' | 'agent' | 'platform',
    @Query('visibility') visibility?: 'public' | 'private' | 'platform',
  ) {
    const tools = await this.toolService.getAllTools({
      owner,
      ownerType,
      visibility,
    });
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
      visibility?: 'public' | 'private' | 'platform';
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

  /**
   * DELETE /v1/tools/:name
   * Delete a tool by name
   */
  @Delete(':name')
  async deleteTool(@Param('name') name: string) {
    const result = await this.toolService.deleteToolByName(name);
    return { success: true, data: result };
  }
}
