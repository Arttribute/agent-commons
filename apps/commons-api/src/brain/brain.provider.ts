import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import type {
  KnowledgeDocumentWrite,
  KnowledgeProviderDefinition,
  KnowledgeProviderId,
} from './brain.types';

export interface KnowledgeProvider {
  readonly definition: KnowledgeProviderDefinition;
  write(
    input: KnowledgeDocumentWrite,
  ): Promise<typeof schema.knowledgeDocument.$inferSelect>;
  remove(documentId: string): Promise<void>;
}

@Injectable()
export class NativeKnowledgeProvider implements KnowledgeProvider {
  readonly definition: KnowledgeProviderDefinition = {
    id: 'native',
    name: 'Commons Knowledge',
    description: 'Private Markdown, indexed and ready for every Commons agent.',
    capabilities: { editable: true, import: true, clientSync: false },
  };

  constructor(private readonly db: DatabaseService) {}

  async write(input: KnowledgeDocumentWrite) {
    if (!input.documentId) {
      try {
        const [created] = await this.db
          .insert(schema.knowledgeDocument)
          .values({
            spaceId: input.spaceId,
            path: input.path,
            title: input.title,
            content: input.content,
            contentHash: input.contentHash,
            frontmatter: input.frontmatter,
            tags: input.tags,
            providerDocumentId: input.providerDocumentId,
            providerRevision: input.providerRevision,
            createdByType: input.actor.principalType,
            createdById: input.actor.principalId,
            updatedByType: input.actor.principalType,
            updatedById: input.actor.principalId,
          })
          .returning();
        await this.snapshot(created, input);
        return created;
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new ConflictException(
            `A document already exists at ${input.path}`,
          );
        }
        throw error;
      }
    }

    const existing = await this.db.query.knowledgeDocument.findFirst({
      where: (table) =>
        and(
          eq(table.documentId, input.documentId!),
          eq(table.spaceId, input.spaceId),
          isNull(table.deletedAt),
        ),
    });
    if (!existing) throw new NotFoundException('Knowledge document not found');
    if (
      input.expectedRevision !== undefined &&
      existing.revision !== input.expectedRevision
    ) {
      throw new ConflictException({
        message: 'This note changed since it was opened',
        code: 'KNOWLEDGE_REVISION_CONFLICT',
        currentRevision: existing.revision,
      });
    }
    if (
      existing.contentHash === input.contentHash &&
      existing.path === input.path &&
      existing.title === input.title
    ) {
      return existing;
    }
    try {
      const [updated] = await this.db
        .update(schema.knowledgeDocument)
        .set({
          path: input.path,
          title: input.title,
          content: input.content,
          contentHash: input.contentHash,
          revision: sql`${schema.knowledgeDocument.revision} + 1`,
          frontmatter: input.frontmatter,
          tags: input.tags,
          providerDocumentId:
            input.providerDocumentId ?? existing.providerDocumentId,
          providerRevision: input.providerRevision ?? existing.providerRevision,
          updatedByType: input.actor.principalType,
          updatedById: input.actor.principalId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.knowledgeDocument.documentId, input.documentId),
            eq(schema.knowledgeDocument.revision, existing.revision),
            isNull(schema.knowledgeDocument.deletedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new ConflictException({
          message: 'This note changed while it was being saved',
          code: 'KNOWLEDGE_REVISION_CONFLICT',
        });
      }
      await this.snapshot(updated, input);
      return updated;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          `A document already exists at ${input.path}`,
        );
      }
      throw error;
    }
  }

  async remove(documentId: string) {
    const [removed] = await this.db
      .update(schema.knowledgeDocument)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.knowledgeDocument.documentId, documentId),
          isNull(schema.knowledgeDocument.deletedAt),
        ),
      )
      .returning({ documentId: schema.knowledgeDocument.documentId });
    if (!removed) throw new NotFoundException('Knowledge document not found');
  }

  protected snapshot(
    document: typeof schema.knowledgeDocument.$inferSelect,
    input: KnowledgeDocumentWrite,
  ) {
    return this.db.insert(schema.knowledgeDocumentRevision).values({
      documentId: document.documentId,
      revision: document.revision,
      path: document.path,
      title: document.title,
      content: document.content,
      contentHash: document.contentHash,
      actorType: input.actor.principalType,
      actorId: input.actor.principalId,
      provenanceTraceId: input.provenanceTraceId,
    });
  }
}

/**
 * Browser filesystem spaces keep the canonical cloud mirror in the native
 * provider. The browser connector owns local directory permission and sync;
 * agents therefore keep working while the user's device is offline.
 */
@Injectable()
export class BrowserFilesystemKnowledgeProvider extends NativeKnowledgeProvider {
  override readonly definition: KnowledgeProviderDefinition = {
    id: 'browser_filesystem',
    name: 'Markdown folder',
    description: 'Connect an Obsidian-compatible folder through your browser.',
    capabilities: { editable: true, import: true, clientSync: true },
  };

  constructor(db: DatabaseService) {
    super(db);
  }
}

@Injectable()
export class KnowledgeProviderRegistry {
  private readonly providers: Map<KnowledgeProviderId, KnowledgeProvider>;

  constructor(
    native: NativeKnowledgeProvider,
    browserFilesystem: BrowserFilesystemKnowledgeProvider,
  ) {
    this.providers = new Map([
      ['native', native],
      ['browser_filesystem', browserFilesystem],
    ]);
  }

  catalog() {
    return [...this.providers.values()].map((provider) => provider.definition);
  }

  resolve(id: string) {
    const provider = this.providers.get(id as KnowledgeProviderId);
    if (!provider)
      throw new NotFoundException(`Knowledge provider ${id} not found`);
    return provider;
  }
}
