// src/tool/tool.service.ts

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { eq, and } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { InferSelectModel } from 'drizzle-orm';
import { ChatCompletionTool } from 'openai/resources/chat/completions.mjs';
import typia from 'typia';
import { CommonTool } from '~/tool/tools/common-tool.service';
import { EthereumTool } from '~/tool/tools/ethereum-tool.service';
import { map } from 'lodash';

@Injectable()
export class ToolService {
  constructor(private db: DatabaseService) {}

  /**
   * Create a new tool in the DB
   */
  async createTool(params: {
    name: string;
    schema: ChatCompletionTool; // The JSON function spec from OpenAI
    owner?: string;
    ownerType?: 'user' | 'agent' | 'platform';
    visibility?: 'public' | 'private' | 'platform';
    tags?: string[];
    rating?: number;
    version?: string;
  }) {
    // Validate that name doesn't exist already
    const existing = await this.db.query.tool.findFirst({
      where: (t) => eq(t.name, params.name),
    });
    if (existing) {
      throw new BadRequestException('Tool name already exists');
    }

    const [inserted] = await this.db
      .insert(schema.tool)
      .values({
        name: params.name,
        schema: params.schema,
        owner: params.owner,
        ownerType: params.ownerType,
        visibility: params.visibility || 'private',
        tags: params.tags,
        rating: params.rating,
        version: params.version,
      })
      .returning();

    return inserted;
  }

  /**
   * Retrieve a tool by name
   */
  async getToolByName(
    name: string,
  ): Promise<InferSelectModel<typeof schema.tool>> {
    const tool = await this.db.query.tool.findFirst({
      where: (t) => eq(t.name, name),
    });

    if (!tool) {
      throw new BadRequestException(`Tool "${name}" not found`);
    }

    return tool;
  }

  /**
   * Return all tools (with optional filters)
   */
  async getAllTools(filters?: {
    owner?: string;
    ownerType?: 'user' | 'agent' | 'platform';
    visibility?: 'public' | 'private' | 'platform';
  }): Promise<InferSelectModel<typeof schema.tool>[]> {
    if (!filters || (!filters.owner && !filters.visibility && !filters.ownerType)) {
      return this.db.query.tool.findMany();
    }

    const conditions = [];

    // Filter by ownerType first (most important for separating platform from user tools)
    if (filters.ownerType) {
      conditions.push(eq(schema.tool.ownerType, filters.ownerType));
    }

    // Then filter by specific owner if provided
    if (filters.owner) {
      conditions.push(eq(schema.tool.owner, filters.owner));
    }

    // Filter by visibility
    if (filters.visibility) {
      conditions.push(eq(schema.tool.visibility, filters.visibility));
    }

    if (conditions.length === 0) {
      return this.db.query.tool.findMany();
    }

    return this.db.query.tool.findMany({
      where: and(...conditions),
    });
  }

  /**
   * Return a tool by its primary key (toolId), if needed
   */
  async getToolById(
    toolId: string,
  ): Promise<Omit<InferSelectModel<typeof schema.tool>, 'secureKeyRef'>> {
    const tool = await this.db.query.tool.findFirst({
      where: (t) => eq(t.toolId, toolId),
    });
    if (!tool) {
      throw new BadRequestException('Tool not found');
    }
    return tool;
  }

  /**
   * Update a tool by name or by id
   */
  async updateToolByName(params: {
    name: string;
    schema?: ChatCompletionTool;
    visibility?: 'public' | 'private' | 'platform';
    tags?: string[];
    rating?: number;
    version?: string;
  }) {
    const [updated] = await this.db
      .update(schema.tool)
      .set({
        ...(params.schema && { schema: params.schema }),
        ...(params.visibility && { visibility: params.visibility }),
        ...(params.tags && { tags: params.tags }),
        ...(params.rating && { rating: params.rating }),
        ...(params.version && { version: params.version }),
      })
      .where(eq(schema.tool.name, params.name))
      .returning();

    if (!updated) {
      throw new BadRequestException('Unable to update tool');
    }

    return updated;
  }

  /**
   * Delete a tool by name
   */
  async deleteToolByName(name: string) {
    const [deleted] = await this.db
      .delete(schema.tool)
      .where(eq(schema.tool.name, name))
      .returning();

    if (!deleted) {
      throw new NotFoundException(`Tool "${name}" not found`);
    }

    return deleted;
  }

  /**
   * Get static/common tools available to all agents
   * These are generated from the CommonTool and EthereumTool interfaces
   */
  getStaticTools(): Array<{
    toolId: string;
    name: string;
    displayName: string;
    description: string;
    schema: ChatCompletionTool;
    visibility: 'platform';
    ownerType: 'platform';
  }> {
    // Generate tool definitions from CommonTool and EthereumTool using typia
    const app = typia.llm.application<EthereumTool & CommonTool, 'chatgpt'>();

    const staticDefs = map(app.functions, (_) => ({
      type: 'function',
      function: {
        ..._,
        parameters:
          _?.parameters as unknown as ChatCompletionTool['function']['parameters'],
      },
    })) as ChatCompletionTool[];

    // Transform to tool format expected by frontend
    return staticDefs.map((def) => ({
      toolId: this.generateStaticToolId(def.function.name),
      name: def.function.name,
      displayName: this.formatDisplayName(def.function.name),
      description: def.function.description || '',
      schema: def,
      visibility: 'platform' as const,
      ownerType: 'platform' as const,
    }));
  }

  /**
   * Sync static tools to the database
   * This ensures static tools have proper UUIDs and work seamlessly with the rest of the system
   */
  async syncStaticToolsToDatabase(): Promise<void> {
    const staticTools = this.getStaticTools();

    for (const tool of staticTools) {
      // Check if tool already exists
      const existing = await this.db.query.tool.findFirst({
        where: (t) => eq(t.toolId, tool.toolId),
      });

      if (existing) {
        // Update existing tool to ensure schema is current
        await this.db
          .update(schema.tool)
          .set({
            schema: tool.schema,
            visibility: tool.visibility,
            ownerType: tool.ownerType,
            // Update description if changed
            ...(existing.description !== tool.description && {
              description: tool.description,
            }),
          })
          .where(eq(schema.tool.toolId, tool.toolId));
      } else {
        // Insert new static tool
        await this.db.insert(schema.tool).values({
          toolId: tool.toolId,
          name: tool.name,
          schema: tool.schema,
          ownerType: tool.ownerType,
          visibility: tool.visibility,
          description: tool.description,
          tags: ['platform', 'static'],
          version: '1.0.0',
        });
      }
    }
  }

  /**
   * Generate a deterministic UUID for static tools
   * This ensures the same tool always gets the same UUID
   */
  private generateStaticToolId(toolName: string): string {
    // Use a namespace UUID (v5) for deterministic generation
    // This ensures static tools always have the same UUID
    const crypto = require('crypto');
    const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // Standard namespace UUID
    const hash = crypto
      .createHash('sha1')
      .update(namespace + toolName)
      .digest('hex');

    // Format as UUID v5
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '5' + hash.substring(13, 16),
      ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) +
        hash.substring(18, 20),
      hash.substring(20, 32),
    ].join('-');
  }

  /**
   * Helper to convert camelCase to Title Case for display names
   */
  private formatDisplayName(name: string): string {
    // Convert camelCase to Title Case
    // e.g., "createGoal" -> "Create Goal"
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }
}
