import { Injectable } from '@nestjs/common';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { EmbeddingService } from '~/embedding/embedding.service';
import { EmbeddingType, ResourceType } from '~/embedding/dto/embedding.dto';
import { eq, or, sql } from 'drizzle-orm';
import { ToolSchema } from '~/tool/dto/tool.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ResourceService {
  constructor(
    private db: DatabaseService,
    private embedding: EmbeddingService,
  ) {}

  async createResource(props: {
    agentId: string;
    resourceMetadata: string;
    resourceFile: string;
    resourceType: ResourceType;
    embeddingType: EmbeddingType;
    schema?: ToolSchema;
    tags: string[];
  }) {
    const {
      agentId,
      resourceFile,
      resourceMetadata,
      resourceType,
      embeddingType,
      schema,
      tags,
    } = props;

    // Generate a local resource ID (no on-chain interaction)
    const resourceId = uuidv4();

    const resource = this.embedding.create({
      resourceId,
      content: resourceFile || 'does not require resource file',
      resourceType,
      embeddingType,
      schema,
      tags,
      resourceFile,
    });

    return resource;
  }

  textToDataURLBase64(text: string) {
    const mimeType = 'text/plain';
    const base64Text = btoa(encodeURIComponent(text));
    return `data:${mimeType};base64,${base64Text}`;
  }

  findResources(props: { query: string; resourceType: ResourceType }) {
    const { query, resourceType } = props;
    if (
      resourceType === ResourceType.text ||
      resourceType === ResourceType.audio ||
      resourceType === ResourceType.image
    ) {
      const resources = this.embedding.find({
        content: query,
        embeddingType: resourceType as unknown as EmbeddingType,
      });
      return resources;
    }

    const normalizedQuery = query?.trim().toLowerCase();

    const resourceEntriesPromise = this.db.query.resource.findMany({
      where: (t) =>
        or(
          query
            ? sql`
            (setweight(to_tsvector('english', array_to_string(${t.tags}, ', ')), 'A'))
            @@ websearch_to_tsquery('english', ${query})
            `
            : undefined,
          normalizedQuery
            ? sql`similarity(array_to_string(${t.tags}, ', '), ${normalizedQuery}) > 0.3`
            : undefined,
        ),
    });

    return resourceEntriesPromise;
  }

  async getResourceById(resourceId: string) {
    return this.db.query.resource.findFirst({
      where: (r) => eq(r.resourceId, resourceId),
    });
  }
}
