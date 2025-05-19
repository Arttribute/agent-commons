// src/tool/tool.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '~/modules/database/database.service';
import { eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { InferSelectModel } from 'drizzle-orm';
import { ChatCompletionTool } from 'openai/resources/chat/completions.mjs';

@Injectable()
export class ToolService {
  constructor(private db: DatabaseService) {}

  /**
   * Create a new tool in the DB
   */
  async createTool(params: {
    name: string;
    schema: ChatCompletionTool; // The JSON function spec from OpenAI
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
   * Return all tools
   */
  async getAllTools(): Promise<InferSelectModel<typeof schema.tool>[]> {
    return this.db.query.tool.findMany();
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
    tags?: string[];
    rating?: number;
    version?: string;
  }) {
    const [updated] = await this.db
      .update(schema.tool)
      .set({
        ...(params.schema && { schema: params.schema }),
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
}
