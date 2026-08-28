import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  and,
  cosineDistance,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { OpenAIService } from '~/modules/openai/openai.service';
import { ProvenanceService } from '~/provenance';
import {
  buildDocumentAliasMap,
  chunkMarkdown,
  decideFilesystemMerge,
  normalizeDocumentPath,
  normalizeKnowledgeAlias,
  parseMarkdownDocument,
  resolveLinkPath,
  titleFromPath,
} from './brain-indexer';
import { KnowledgeProviderRegistry } from './brain.provider';
import type {
  KnowledgeDocumentImport,
  KnowledgePermission,
  KnowledgePrincipal,
  KnowledgeProviderId,
} from './brain.types';

const PERMISSION_RANK: Record<KnowledgePermission, number> = {
  read: 1,
  write: 2,
  manage: 3,
};
const DEFAULT_WELCOME = `---
type: Guide
title: Welcome to your Commons Brain
description: Start here to organize portable knowledge for people and agents.
status: stable
tags:
  - start-here
---
# Welcome to your Commons Brain

This Knowledge Space is shared context for you and your agents. Everything is portable Markdown, organized in folders and connected with links.

## Start here

- Create a note or connect an existing Markdown folder.
- Link ideas with double brackets, for example [[Projects/First project]].
- Ask any Commons agent to search, read, or update this space.

## A useful structure

- **Projects/** for active outcomes
- **Decisions/** for durable choices and their reasoning
- **People/** for relationship context
- **Reference/** for long-lived source material

Only grant agents and people the access they need. Every human and agent edit is revisioned and connected to Commons provenance.
`;

@Injectable()
export class BrainService {
  constructor(
    private readonly db: DatabaseService,
    private readonly openAI: OpenAIService,
    private readonly providers: KnowledgeProviderRegistry,
    private readonly provenance: ProvenanceService,
  ) {}

  providerCatalog() {
    return this.providers.catalog();
  }

  async listSpaces(principal: KnowledgePrincipal) {
    if (principal.principalType === 'user') {
      await this.ensureDefaultForOwner(
        principal.principalId,
        principal.workspaceId,
      );
    }
    const spaces = await this.db.query.knowledgeSpace.findMany({
      where: (table) =>
        and(
          isNull(table.deletedAt),
          this.accessCondition(schema.knowledgeSpace, principal),
        ),
      orderBy: (table) => desc(table.updatedAt),
    });
    return Promise.all(
      spaces.map(async (space) => {
        const [permission, counts] = await Promise.all([
          this.effectivePermission(space, principal),
          this.spaceCounts(space.spaceId),
        ]);
        return this.publicSpace(space, permission, counts);
      }),
    );
  }

  async createSpace(
    principal: KnowledgePrincipal,
    input: {
      name: string;
      description?: string;
      provider?: KnowledgeProviderId;
      providerConfig?: Record<string, unknown>;
      color?: string;
      allAgents?: boolean;
      agentIds?: string[];
    },
  ) {
    if (principal.principalType !== 'user') {
      throw new ForbiddenException('Only a user can create a Knowledge Space');
    }
    const name = input.name?.trim().slice(0, 100);
    if (!name)
      throw new BadRequestException('Knowledge Space name is required');
    const provider = input.provider ?? 'native';
    this.providers.resolve(provider);
    const [space] = await this.db
      .insert(schema.knowledgeSpace)
      .values({
        ownerUserId: principal.principalId,
        workspaceId: principal.workspaceId ?? null,
        name,
        description: input.description?.trim().slice(0, 1_000) || null,
        provider,
        providerConfig: input.providerConfig ?? {},
        color: normalizeColor(input.color),
        autoGrantNewAgents: Boolean(input.allAgents),
      })
      .returning();
    await this.grantOwnedAgents(space, principal, {
      allAgents: input.allAgents,
      agentIds: input.agentIds,
    });
    this.captureMutation(space, principal, 'knowledge_space.created', {
      name,
      provider,
    });
    return this.getSpace(space.spaceId, principal);
  }

  async getSpace(spaceId: string, principal: KnowledgePrincipal) {
    const { space, permission } = await this.requireSpace(
      spaceId,
      principal,
      'read',
    );
    const [counts, grants] = await Promise.all([
      this.spaceCounts(spaceId),
      permission === 'manage'
        ? this.db.query.knowledgeSpaceGrant.findMany({
            where: (table) => eq(table.spaceId, spaceId),
            orderBy: (table) => desc(table.updatedAt),
          })
        : Promise.resolve([]),
    ]);
    return {
      ...this.publicSpace(space, permission, counts),
      grants,
      providerDefinition: this.providers.resolve(space.provider).definition,
    };
  }

  async updateSpace(
    spaceId: string,
    principal: KnowledgePrincipal,
    input: {
      name?: string;
      description?: string;
      color?: string;
      autoGrantNewAgents?: boolean;
      status?: 'active' | 'disconnected';
      providerConfig?: Record<string, unknown>;
    },
  ) {
    const { space } = await this.requireSpace(spaceId, principal, 'manage');
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('Knowledge Space name cannot be empty');
    }
    const [updated] = await this.db
      .update(schema.knowledgeSpace)
      .set({
        name: name?.slice(0, 100),
        description:
          input.description === undefined
            ? undefined
            : input.description.trim().slice(0, 1_000) || null,
        color: input.color ? normalizeColor(input.color) : undefined,
        autoGrantNewAgents: input.autoGrantNewAgents,
        status: input.status,
        providerConfig: input.providerConfig,
        updatedAt: new Date(),
      })
      .where(eq(schema.knowledgeSpace.spaceId, space.spaceId))
      .returning();
    if (input.autoGrantNewAgents) {
      await this.grantOwnedAgents(updated, principal, { allAgents: true });
    }
    this.captureMutation(updated, principal, 'knowledge_space.updated', input);
    return this.getSpace(spaceId, principal);
  }

  async removeSpace(spaceId: string, principal: KnowledgePrincipal) {
    const { space } = await this.requireSpace(spaceId, principal, 'manage');
    if (space.isDefault) {
      throw new BadRequestException(
        'The default Commons Brain cannot be deleted. Rename it or create another space.',
      );
    }
    await this.db
      .update(schema.knowledgeSpace)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.knowledgeSpace.spaceId, spaceId));
    this.captureMutation(space, principal, 'knowledge_space.deleted', {
      spaceId,
    });
    return { deleted: true };
  }

  async setGrant(
    spaceId: string,
    principal: KnowledgePrincipal,
    input: {
      subjectType: 'user' | 'agent' | 'workspace';
      subjectId: string;
      permission?: KnowledgePermission;
      autoRetrieve?: boolean;
    },
  ) {
    const { space } = await this.requireSpace(spaceId, principal, 'manage');
    const subjectId = input.subjectId?.trim();
    if (!subjectId) throw new BadRequestException('subjectId is required');
    const permission = input.permission ?? 'read';
    if (!PERMISSION_RANK[permission]) {
      throw new BadRequestException('Invalid Knowledge Space permission');
    }
    const [grant] = await this.db
      .insert(schema.knowledgeSpaceGrant)
      .values({
        spaceId,
        subjectType: input.subjectType,
        subjectId,
        permission,
        autoRetrieve: input.autoRetrieve ?? true,
        createdBy: principal.principalId,
      })
      .onConflictDoUpdate({
        target: [
          schema.knowledgeSpaceGrant.spaceId,
          schema.knowledgeSpaceGrant.subjectType,
          schema.knowledgeSpaceGrant.subjectId,
        ],
        set: {
          permission,
          autoRetrieve: input.autoRetrieve ?? true,
          updatedAt: new Date(),
        },
      })
      .returning();
    this.captureMutation(space, principal, 'knowledge_space.grant_updated', {
      subjectType: input.subjectType,
      subjectId,
      permission,
      autoRetrieve: grant.autoRetrieve,
    });
    return grant;
  }

  async revokeGrant(
    spaceId: string,
    grantId: string,
    principal: KnowledgePrincipal,
  ) {
    const { space } = await this.requireSpace(spaceId, principal, 'manage');
    const [removed] = await this.db
      .delete(schema.knowledgeSpaceGrant)
      .where(
        and(
          eq(schema.knowledgeSpaceGrant.spaceId, spaceId),
          eq(schema.knowledgeSpaceGrant.grantId, grantId),
        ),
      )
      .returning({ grantId: schema.knowledgeSpaceGrant.grantId });
    if (!removed) throw new NotFoundException('Knowledge grant not found');
    this.captureMutation(space, principal, 'knowledge_space.grant_revoked', {
      grantId,
    });
    return { revoked: true };
  }

  async listDocuments(
    spaceId: string,
    principal: KnowledgePrincipal,
    options: { query?: string; includeContent?: boolean; limit?: number } = {},
  ) {
    await this.requireSpace(spaceId, principal, 'read');
    const query = options.query?.trim();
    const documents = await this.db.query.knowledgeDocument.findMany({
      where: (table) =>
        and(
          eq(table.spaceId, spaceId),
          isNull(table.deletedAt),
          query
            ? or(
                ilike(table.title, `%${escapeLike(query)}%`),
                ilike(table.path, `%${escapeLike(query)}%`),
                ilike(table.content, `%${escapeLike(query)}%`),
              )
            : undefined,
        ),
      orderBy: (table) => [table.path],
      limit: clamp(options.limit ?? 1_000, 1, 2_000),
    });
    return documents.map((document) =>
      this.publicDocument(document, options.includeContent),
    );
  }

  async getDocument(documentId: string, principal: KnowledgePrincipal) {
    const document = await this.db.query.knowledgeDocument.findFirst({
      where: (table) =>
        and(eq(table.documentId, documentId), isNull(table.deletedAt)),
    });
    if (!document) throw new NotFoundException('Knowledge document not found');
    await this.requireSpace(document.spaceId, principal, 'read');
    const [outgoing, backlinks] = await Promise.all([
      this.db
        .select({
          linkId: schema.knowledgeLink.linkId,
          targetPath: schema.knowledgeLink.targetPath,
          label: schema.knowledgeLink.label,
          relation: schema.knowledgeLink.relation,
          documentId: schema.knowledgeDocument.documentId,
          title: schema.knowledgeDocument.title,
          path: schema.knowledgeDocument.path,
        })
        .from(schema.knowledgeLink)
        .leftJoin(
          schema.knowledgeDocument,
          eq(
            schema.knowledgeLink.toDocumentId,
            schema.knowledgeDocument.documentId,
          ),
        )
        .where(eq(schema.knowledgeLink.fromDocumentId, documentId)),
      this.db
        .select({
          linkId: schema.knowledgeLink.linkId,
          relation: schema.knowledgeLink.relation,
          documentId: schema.knowledgeDocument.documentId,
          title: schema.knowledgeDocument.title,
          path: schema.knowledgeDocument.path,
        })
        .from(schema.knowledgeLink)
        .innerJoin(
          schema.knowledgeDocument,
          eq(
            schema.knowledgeLink.fromDocumentId,
            schema.knowledgeDocument.documentId,
          ),
        )
        .where(eq(schema.knowledgeLink.toDocumentId, documentId)),
    ]);
    return { ...this.publicDocument(document, true), outgoing, backlinks };
  }

  async writeDocument(
    spaceId: string,
    principal: KnowledgePrincipal,
    input: {
      documentId?: string;
      path: string;
      title?: string;
      content: string;
      expectedRevision?: number;
      providerDocumentId?: string;
      providerRevision?: string;
    },
    options: { traceId?: string; deferGraph?: boolean } = {},
  ) {
    const { space } = await this.requireSpace(spaceId, principal, 'write');
    if (typeof input.content !== 'string') {
      throw new BadRequestException('Markdown content is required');
    }
    if (input.content.length > 2_000_000) {
      throw new BadRequestException('A Knowledge note cannot exceed 2 MB');
    }
    let path: string;
    try {
      path = normalizeDocumentPath(input.path);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid document path',
      );
    }
    const existing = input.documentId
      ? await this.db.query.knowledgeDocument.findFirst({
          where: (table) =>
            and(
              eq(table.documentId, input.documentId!),
              eq(table.spaceId, spaceId),
              isNull(table.deletedAt),
            ),
        })
      : undefined;
    if (input.documentId && !existing) {
      throw new NotFoundException('Knowledge document not found');
    }
    const title = (input.title?.trim() || titleFromPath(path)).slice(0, 240);
    const parsed = parseMarkdownDocument(input.content, path);
    const contentHash = sha256(input.content);
    const trace = options.traceId
      ? { traceId: options.traceId, owned: false }
      : this.startMutation(space, principal, existing ? 'update' : 'create', {
          path,
          title,
          expectedRevision: input.expectedRevision,
        });
    try {
      const document = await this.providers.resolve(space.provider).write({
        documentId: input.documentId,
        spaceId,
        path,
        title,
        content: input.content,
        contentHash,
        frontmatter: parsed.frontmatter,
        tags: parsed.tags,
        expectedRevision: input.expectedRevision,
        actor: principal,
        provenanceTraceId: trace.traceId,
        providerDocumentId: input.providerDocumentId,
        providerRevision: input.providerRevision,
      });
      await this.indexDocument(document);
      if (!options.deferGraph) await this.rebuildLinks(spaceId);
      await this.touchSpace(spaceId);
      if (trace.owned) {
        this.provenance.recordEvent(trace.traceId, {
          category: 'tool',
          eventType: existing
            ? 'knowledge.document.updated'
            : 'knowledge.document.created',
          name: existing ? 'Update knowledge note' : 'Create knowledge note',
          summary: `${existing ? 'Updated' : 'Created'} ${path}`,
          content: input.content,
          payload: { spaceId, documentId: document.documentId, path, title },
          result: { revision: document.revision, contentHash },
          performedBy: actor(principal),
        });
        this.provenance.finishRun(trace.traceId, {
          status: 'completed',
          output: {
            documentId: document.documentId,
            revision: document.revision,
          },
        });
      }
      return this.getDocument(document.documentId, principal);
    } catch (error) {
      if (trace.owned) {
        this.provenance.finishRun(trace.traceId, {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  }

  async importDocuments(
    spaceId: string,
    principal: KnowledgePrincipal,
    documents: KnowledgeDocumentImport[],
  ) {
    const { space } = await this.requireSpace(spaceId, principal, 'write');
    if (!Array.isArray(documents) || !documents.length) {
      throw new BadRequestException(
        'At least one Markdown document is required',
      );
    }
    if (documents.length > 1_000) {
      throw new BadRequestException('Import at most 1,000 notes at a time');
    }
    const totalChars = documents.reduce(
      (total, document) => total + String(document.content ?? '').length,
      0,
    );
    if (totalChars > 20_000_000) {
      throw new BadRequestException('Markdown import cannot exceed 20 MB');
    }
    const trace = this.startMutation(space, principal, 'import', {
      documentCount: documents.length,
      totalCharacters: totalChars,
    });
    const result = {
      created: 0,
      updated: 0,
      unchanged: 0,
      remoteKept: 0,
      failed: [] as any[],
    };
    for (const candidate of documents) {
      try {
        const path = normalizeDocumentPath(candidate.path);
        const existing = await this.db.query.knowledgeDocument.findFirst({
          where: (table) =>
            and(
              eq(table.spaceId, spaceId),
              sql<boolean>`lower(${table.path}) = lower(${path})`,
              isNull(table.deletedAt),
            ),
        });
        const contentMatches =
          existing?.contentHash === sha256(candidate.content);
        if (contentMatches) {
          if (
            candidate.modifiedAt &&
            existing.providerRevision !== candidate.modifiedAt
          ) {
            await this.db
              .update(schema.knowledgeDocument)
              .set({ providerRevision: candidate.modifiedAt })
              .where(
                eq(schema.knowledgeDocument.documentId, existing.documentId),
              );
          }
          result.unchanged += 1;
          continue;
        }
        if (space.provider === 'browser_filesystem' && existing) {
          const decision = decideFilesystemMerge({
            contentMatches,
            remoteActorType: existing.updatedByType,
            lastLocalRevision: existing.providerRevision,
            incomingLocalRevision: candidate.modifiedAt,
          });
          if (decision === 'keep_remote') {
            result.remoteKept += 1;
            continue;
          }
          if (decision === 'conflict') {
            throw new Error(
              'Both the connected file and an agent-edited copy changed; review the note before choosing a version',
            );
          }
        }
        await this.writeDocument(
          spaceId,
          principal,
          {
            documentId: existing?.documentId,
            path,
            title: candidate.title,
            content: candidate.content,
            expectedRevision: existing?.revision,
            providerRevision: candidate.modifiedAt,
          },
          { traceId: trace.traceId, deferGraph: true },
        );
        if (existing) result.updated += 1;
        else result.created += 1;
      } catch (error) {
        result.failed.push({
          path: candidate.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await this.rebuildLinks(spaceId);
    this.provenance.recordEvent(trace.traceId, {
      category: 'tool',
      eventType: 'knowledge.documents.imported',
      name: 'Import Markdown folder',
      summary: `Imported ${result.created + result.updated} Markdown notes`,
      payload: { requested: documents.length },
      result,
      performedBy: actor(principal),
    });
    this.provenance.finishRun(trace.traceId, {
      status:
        result.failed.length === documents.length ? 'failed' : 'completed',
      output: result,
      error:
        result.failed.length === documents.length
          ? 'Every document in the import failed'
          : undefined,
    });
    return result;
  }

  async removeDocument(documentId: string, principal: KnowledgePrincipal) {
    const document = await this.db.query.knowledgeDocument.findFirst({
      where: (table) =>
        and(eq(table.documentId, documentId), isNull(table.deletedAt)),
    });
    if (!document) throw new NotFoundException('Knowledge document not found');
    const { space } = await this.requireSpace(
      document.spaceId,
      principal,
      'write',
    );
    const trace = this.startMutation(space, principal, 'delete', {
      documentId,
      path: document.path,
    });
    await this.providers.resolve(space.provider).remove(documentId);
    await this.rebuildLinks(space.spaceId);
    await this.touchSpace(space.spaceId);
    this.provenance.recordEvent(trace.traceId, {
      category: 'tool',
      eventType: 'knowledge.document.deleted',
      name: 'Delete knowledge note',
      summary: `Deleted ${document.path}`,
      payload: { documentId, path: document.path },
      content: document.content,
      performedBy: actor(principal),
    });
    this.provenance.finishRun(trace.traceId, {
      status: 'completed',
      output: { deleted: true },
    });
    return { deleted: true };
  }

  async graph(spaceId: string, principal: KnowledgePrincipal) {
    await this.requireSpace(spaceId, principal, 'read');
    const [documents, links] = await Promise.all([
      this.db.query.knowledgeDocument.findMany({
        where: (table) =>
          and(eq(table.spaceId, spaceId), isNull(table.deletedAt)),
      }),
      this.db.query.knowledgeLink.findMany({
        where: (table) => eq(table.spaceId, spaceId),
      }),
    ]);
    const degree = new Map<string, number>();
    for (const link of links) {
      degree.set(
        link.fromDocumentId,
        (degree.get(link.fromDocumentId) ?? 0) + 1,
      );
      if (link.toDocumentId) {
        degree.set(link.toDocumentId, (degree.get(link.toDocumentId) ?? 0) + 1);
      }
    }
    return {
      nodes: documents.map((document) => ({
        id: document.documentId,
        title: document.title,
        path: document.path,
        folder: document.path.includes('/')
          ? document.path.slice(0, document.path.lastIndexOf('/'))
          : '',
        tags: document.tags,
        degree: degree.get(document.documentId) ?? 0,
        updatedAt: document.updatedAt,
      })),
      edges: links.map((link) => ({
        id: link.linkId,
        source: link.fromDocumentId,
        target: link.toDocumentId,
        targetPath: link.targetPath,
        relation: link.relation,
        resolved: Boolean(link.toDocumentId),
      })),
    };
  }

  async search(
    principal: KnowledgePrincipal,
    input: { query: string; spaceIds?: string[]; limit?: number },
    options: { traceId?: string } = {},
  ) {
    const query = input.query?.trim();
    if (!query) throw new BadRequestException('query is required');
    const accessible = await this.listSpaces(principal);
    const requested = new Set(input.spaceIds ?? []);
    const spaceIds = accessible
      .map((space) => space.spaceId)
      .filter((spaceId) => !requested.size || requested.has(spaceId));
    if (!spaceIds.length) {
      return { query, algorithm: 'hybrid_graph', results: [] };
    }
    const embedding = await this.embedQuery(query);
    const semantic = embedding
      ? sql<number>`coalesce(1 - (${cosineDistance(schema.knowledgeChunk.embedding, embedding)}), 0)`
      : sql<number>`0`;
    const lexical = sql<number>`ts_rank_cd(to_tsvector('english', ${schema.knowledgeChunk.content}), websearch_to_tsquery('english', ${query}))`;
    const titleBoost = sql<number>`CASE WHEN ${schema.knowledgeDocument.title} ILIKE ${`%${escapeLike(query)}%`} THEN 0.15 ELSE 0 END`;
    const score = embedding
      ? sql<number>`(${semantic} * 0.68) + (least(${lexical}, 1) * 0.22) + ${titleBoost}`
      : sql<number>`(least(${lexical}, 1) * 0.85) + ${titleBoost}`;
    const base = await this.db
      .select({
        spaceId: schema.knowledgeDocument.spaceId,
        documentId: schema.knowledgeDocument.documentId,
        path: schema.knowledgeDocument.path,
        title: schema.knowledgeDocument.title,
        contentHash: schema.knowledgeDocument.contentHash,
        revision: schema.knowledgeDocument.revision,
        tags: schema.knowledgeDocument.tags,
        chunkIndex: schema.knowledgeChunk.chunkIndex,
        heading: schema.knowledgeChunk.heading,
        excerpt: schema.knowledgeChunk.content,
        embeddingModel: schema.knowledgeChunk.embeddingModel,
        semantic,
        lexical,
        score,
      })
      .from(schema.knowledgeChunk)
      .innerJoin(
        schema.knowledgeDocument,
        eq(
          schema.knowledgeChunk.documentId,
          schema.knowledgeDocument.documentId,
        ),
      )
      .where(
        and(
          inArray(schema.knowledgeDocument.spaceId, spaceIds),
          isNull(schema.knowledgeDocument.deletedAt),
          embedding
            ? or(
                sql`${semantic} > 0.18`,
                sql`to_tsvector('english', ${schema.knowledgeChunk.content}) @@ websearch_to_tsquery('english', ${query})`,
                ilike(schema.knowledgeDocument.title, `%${escapeLike(query)}%`),
              )
            : or(
                sql`to_tsvector('english', ${schema.knowledgeChunk.content}) @@ websearch_to_tsquery('english', ${query})`,
                ilike(schema.knowledgeDocument.title, `%${escapeLike(query)}%`),
                ilike(schema.knowledgeChunk.content, `%${escapeLike(query)}%`),
              ),
        ),
      )
      .orderBy(desc(score))
      .limit(clamp((input.limit ?? 8) * 2, 4, 40));

    const limit = clamp(input.limit ?? 8, 1, 20);
    const byDocument = new Map<string, any>();
    for (const row of base) {
      const numericScore = Number(row.score ?? 0);
      const current = byDocument.get(row.documentId);
      if (!current || numericScore > current.score) {
        byDocument.set(row.documentId, {
          ...row,
          semantic: Number(row.semantic ?? 0),
          lexical: Number(row.lexical ?? 0),
          score: numericScore,
          graphBoost: 0,
          matchedBy: embedding ? ['semantic', 'lexical'] : ['lexical'],
        });
      }
    }
    await this.expandGraphNeighbors(byDocument, spaceIds, limit);
    const results = [...byDocument.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        percentageMatch:
          Math.round(Math.max(0, Math.min(1, row.score)) * 10_000) / 100,
        excerpt: String(row.excerpt ?? '').slice(0, 1_400),
      }));
    if (options.traceId) {
      this.provenance.recordEvent(options.traceId, {
        category: 'context',
        eventType: 'knowledge.retrieval',
        name: 'Search Knowledge Spaces',
        summary: `Retrieved ${results.length} knowledge notes`,
        payload: { query, spaceIds, limit },
        result: { query, algorithm: 'hybrid_graph', results },
      });
    }
    return { query, algorithm: 'hybrid_graph', results };
  }

  async ensureDefaultForAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
    });
    const ownerId = agent?.ownerUserId ?? agent?.owner;
    if (!agent || !ownerId)
      throw new NotFoundException('Agent owner not found');
    const space = await this.ensureDefaultForOwner(ownerId, agent.workspaceId);
    const automaticallyShared = await this.db.query.knowledgeSpace.findMany({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerId})`,
          eq(table.autoGrantNewAgents, true),
          isNull(table.deletedAt),
        ),
    });
    await this.db
      .insert(schema.knowledgeSpaceGrant)
      .values(
        (automaticallyShared.length ? automaticallyShared : [space]).map(
          (sharedSpace) => ({
            spaceId: sharedSpace.spaceId,
            subjectType: 'agent',
            subjectId: agentId,
            permission: 'write',
            autoRetrieve: true,
            createdBy: ownerId,
          }),
        ),
      )
      .onConflictDoNothing();
    return space;
  }

  async defaultWritableSpaceForAgent(agentId: string) {
    await this.ensureDefaultForAgent(agentId);
    const grants = await this.db
      .select({
        space: schema.knowledgeSpace,
        grant: schema.knowledgeSpaceGrant,
      })
      .from(schema.knowledgeSpaceGrant)
      .innerJoin(
        schema.knowledgeSpace,
        eq(schema.knowledgeSpaceGrant.spaceId, schema.knowledgeSpace.spaceId),
      )
      .where(
        and(
          eq(schema.knowledgeSpaceGrant.subjectType, 'agent'),
          eq(schema.knowledgeSpaceGrant.subjectId, agentId),
          inArray(schema.knowledgeSpaceGrant.permission, ['write', 'manage']),
          isNull(schema.knowledgeSpace.deletedAt),
        ),
      )
      .orderBy(
        desc(schema.knowledgeSpace.isDefault),
        desc(schema.knowledgeSpace.updatedAt),
      );
    if (!grants[0])
      throw new ForbiddenException('Agent has no writable Knowledge Space');
    return grants[0].space;
  }

  private async ensureDefaultForOwner(
    ownerUserId: string,
    workspaceId?: string | null,
  ) {
    let space = await this.db.query.knowledgeSpace.findFirst({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerUserId})`,
          eq(table.isDefault, true),
          isNull(table.deletedAt),
        ),
    });
    if (!space) {
      try {
        [space] = await this.db
          .insert(schema.knowledgeSpace)
          .values({
            ownerUserId,
            workspaceId: workspaceId ?? null,
            name: 'Commons Brain',
            description:
              'Shared context for you and all of your Commons agents.',
            provider: 'native',
            color: 'teal',
            isDefault: true,
            autoGrantNewAgents: true,
          })
          .returning();
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
        space = await this.db.query.knowledgeSpace.findFirst({
          where: (table) =>
            and(
              sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerUserId})`,
              eq(table.isDefault, true),
              isNull(table.deletedAt),
            ),
        });
      }
    }
    if (!space) throw new Error('Could not create the default Knowledge Space');
    await this.grantOwnedAgents(
      space,
      {
        principalId: ownerUserId,
        principalType: 'user',
        workspaceId,
      },
      { allAgents: true },
    );
    const welcome = await this.db.query.knowledgeDocument.findFirst({
      where: (table) =>
        and(eq(table.spaceId, space!.spaceId), isNull(table.deletedAt)),
    });
    if (!welcome) {
      const parsed = parseMarkdownDocument(DEFAULT_WELCOME, 'Welcome.md');
      try {
        const document = await this.providers.resolve(space.provider).write({
          spaceId: space.spaceId,
          path: 'Welcome.md',
          title: 'Welcome',
          content: DEFAULT_WELCOME,
          contentHash: sha256(DEFAULT_WELCOME),
          frontmatter: parsed.frontmatter,
          tags: parsed.tags,
          actor: {
            principalId: ownerUserId,
            principalType: 'user',
            workspaceId,
          },
        });
        await this.indexDocument(document);
        await this.rebuildLinks(space.spaceId);
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        const raced = await this.db.query.knowledgeDocument.findFirst({
          where: (table) =>
            and(
              eq(table.spaceId, space!.spaceId),
              sql<boolean>`lower(${table.path}) = lower('Welcome.md')`,
              isNull(table.deletedAt),
            ),
        });
        if (!raced) throw error;
      }
    }
    return space;
  }

  private async grantOwnedAgents(
    space: typeof schema.knowledgeSpace.$inferSelect,
    principal: KnowledgePrincipal,
    options: { allAgents?: boolean; agentIds?: string[] },
  ) {
    if (!options.allAgents && !options.agentIds?.length) return;
    const requested = new Set(options.agentIds ?? []);
    const agents = await this.db.query.agent.findMany({
      where: (table) =>
        and(
          or(
            sql<boolean>`lower(${table.ownerUserId}) = lower(${principal.principalId})`,
            sql<boolean>`lower(${table.owner}) = lower(${principal.principalId})`,
          ),
          !options.allAgents && requested.size
            ? inArray(table.agentId, [...requested])
            : undefined,
        ),
    });
    if (!agents.length) return;
    await this.db
      .insert(schema.knowledgeSpaceGrant)
      .values(
        agents.map((agent) => ({
          spaceId: space.spaceId,
          subjectType: 'agent',
          subjectId: agent.agentId,
          permission: 'write',
          autoRetrieve: true,
          createdBy: principal.principalId,
        })),
      )
      .onConflictDoNothing();
  }

  private async requireSpace(
    spaceId: string,
    principal: KnowledgePrincipal,
    required: KnowledgePermission,
  ) {
    const space = await this.db.query.knowledgeSpace.findFirst({
      where: (table) =>
        and(eq(table.spaceId, spaceId), isNull(table.deletedAt)),
    });
    if (!space) throw new NotFoundException('Knowledge Space not found');
    const permission = await this.effectivePermission(space, principal);
    if (
      !permission ||
      PERMISSION_RANK[permission] < PERMISSION_RANK[required]
    ) {
      throw new ForbiddenException(
        `This principal does not have ${required} access to the Knowledge Space`,
      );
    }
    return { space, permission };
  }

  private async effectivePermission(
    space: typeof schema.knowledgeSpace.$inferSelect,
    principal: KnowledgePrincipal,
  ): Promise<KnowledgePermission | null> {
    if (
      principal.principalType === 'user' &&
      same(space.ownerUserId, principal.principalId)
    ) {
      return 'manage';
    }
    const conditions: SQL[] = [
      and(
        eq(
          schema.knowledgeSpaceGrant.subjectType,
          principal.principalType === 'agent' ? 'agent' : 'user',
        ),
        sql<boolean>`lower(${schema.knowledgeSpaceGrant.subjectId}) = lower(${principal.principalId})`,
      )!,
    ];
    if (principal.workspaceId) {
      conditions.push(
        and(
          eq(schema.knowledgeSpaceGrant.subjectType, 'workspace'),
          sql<boolean>`lower(${schema.knowledgeSpaceGrant.subjectId}) = lower(${principal.workspaceId})`,
        )!,
      );
    }
    const grants = await this.db.query.knowledgeSpaceGrant.findMany({
      where: (table) =>
        and(eq(table.spaceId, space.spaceId), or(...conditions)),
    });
    return grants.reduce<KnowledgePermission | null>((best, grant) => {
      const permission = grant.permission as KnowledgePermission;
      if (!PERMISSION_RANK[permission]) return best;
      return !best || PERMISSION_RANK[permission] > PERMISSION_RANK[best]
        ? permission
        : best;
    }, null);
  }

  private accessCondition(
    table: typeof schema.knowledgeSpace,
    principal: KnowledgePrincipal,
  ) {
    return or(
      principal.principalType === 'user'
        ? sql<boolean>`lower(${table.ownerUserId}) = lower(${principal.principalId})`
        : undefined,
      sql<boolean>`EXISTS (
        SELECT 1 FROM knowledge_space_grant knowledge_access
        WHERE knowledge_access.space_id = ${table.spaceId}
          AND knowledge_access.subject_type = ${principal.principalType === 'agent' ? 'agent' : 'user'}
          AND lower(knowledge_access.subject_id) = lower(${principal.principalId})
      )`,
      principal.workspaceId
        ? sql<boolean>`EXISTS (
            SELECT 1 FROM knowledge_space_grant workspace_access
            WHERE workspace_access.space_id = ${table.spaceId}
              AND workspace_access.subject_type = 'workspace'
              AND lower(workspace_access.subject_id) = lower(${principal.workspaceId})
          )`
        : undefined,
    )!;
  }

  private async spaceCounts(spaceId: string) {
    const [row] = await this.db
      .select({
        documents: sql<number>`count(DISTINCT ${schema.knowledgeDocument.documentId})::int`,
        links: sql<number>`count(DISTINCT ${schema.knowledgeLink.linkId})::int`,
      })
      .from(schema.knowledgeSpace)
      .leftJoin(
        schema.knowledgeDocument,
        and(
          eq(schema.knowledgeDocument.spaceId, schema.knowledgeSpace.spaceId),
          isNull(schema.knowledgeDocument.deletedAt),
        ),
      )
      .leftJoin(
        schema.knowledgeLink,
        eq(schema.knowledgeLink.spaceId, schema.knowledgeSpace.spaceId),
      )
      .where(eq(schema.knowledgeSpace.spaceId, spaceId));
    return {
      documents: Number(row?.documents ?? 0),
      links: Number(row?.links ?? 0),
    };
  }

  private async indexDocument(
    document: typeof schema.knowledgeDocument.$inferSelect,
  ) {
    const chunks = chunkMarkdown(document.title, document.content);
    const embeddings = await this.embedChunks(
      chunks.map((chunk) => chunk.content),
    );
    await this.db
      .delete(schema.knowledgeChunk)
      .where(eq(schema.knowledgeChunk.documentId, document.documentId));
    if (!chunks.length) return;
    const model = embeddings
      ? process.env.BRAIN_EMBEDDING_MODEL ||
        process.env.ARTIFACT_EMBEDDING_MODEL ||
        'text-embedding-3-small'
      : null;
    await this.db.insert(schema.knowledgeChunk).values(
      chunks.map((chunk, index) => ({
        documentId: document.documentId,
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        embedding: embeddings?.[index],
        embeddingModel: model,
        metadata: { path: document.path, revision: document.revision },
      })),
    );
  }

  private async rebuildLinks(spaceId: string) {
    const documents = await this.db.query.knowledgeDocument.findMany({
      where: (table) =>
        and(eq(table.spaceId, spaceId), isNull(table.deletedAt)),
    });
    const aliasMap = buildDocumentAliasMap(documents);
    const links: Array<typeof schema.knowledgeLink.$inferInsert> = [];
    for (const document of documents) {
      for (const link of parseMarkdownDocument(document.content, document.path)
        .links) {
        const resolvedPath = resolveLinkPath(document.path, link.target);
        const direct = resolvedPath
          ? aliasMap.get(normalizeKnowledgeAlias(resolvedPath))
          : undefined;
        const fallback = aliasMap.get(
          normalizeKnowledgeAlias(link.target.split('#')[0] ?? ''),
        );
        links.push({
          spaceId,
          fromDocumentId: document.documentId,
          toDocumentId: direct || fallback || null,
          targetPath: link.target.slice(0, 512),
          label: link.label?.slice(0, 240),
          relation: link.relation,
        });
      }
    }
    await this.db
      .delete(schema.knowledgeLink)
      .where(eq(schema.knowledgeLink.spaceId, spaceId));
    if (links.length) await this.db.insert(schema.knowledgeLink).values(links);
  }

  private async expandGraphNeighbors(
    results: Map<string, any>,
    spaceIds: string[],
    limit: number,
  ) {
    const seeds = [...results.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.min(5, limit));
    if (!seeds.length) return;
    const seedIds = seeds.map((seed) => seed.documentId);
    const links = await this.db.query.knowledgeLink.findMany({
      where: (table) =>
        and(
          inArray(table.spaceId, spaceIds),
          or(
            inArray(table.fromDocumentId, seedIds),
            inArray(table.toDocumentId, seedIds),
          ),
        ),
    });
    const boost = new Map<string, number>();
    for (const link of links) {
      if (!link.toDocumentId) continue;
      const fromSeed = results.get(link.fromDocumentId);
      const toSeed = results.get(link.toDocumentId);
      if (fromSeed && !toSeed) {
        boost.set(
          link.toDocumentId,
          Math.max(boost.get(link.toDocumentId) ?? 0, fromSeed.score * 0.35),
        );
      }
      if (toSeed && !fromSeed) {
        boost.set(
          link.fromDocumentId,
          Math.max(boost.get(link.fromDocumentId) ?? 0, toSeed.score * 0.35),
        );
      }
    }
    const neighborIds = [...boost.keys()].filter((id) => !results.has(id));
    if (!neighborIds.length) return;
    const rows = await this.db
      .select({
        spaceId: schema.knowledgeDocument.spaceId,
        documentId: schema.knowledgeDocument.documentId,
        path: schema.knowledgeDocument.path,
        title: schema.knowledgeDocument.title,
        contentHash: schema.knowledgeDocument.contentHash,
        revision: schema.knowledgeDocument.revision,
        tags: schema.knowledgeDocument.tags,
        chunkIndex: schema.knowledgeChunk.chunkIndex,
        heading: schema.knowledgeChunk.heading,
        excerpt: schema.knowledgeChunk.content,
        embeddingModel: schema.knowledgeChunk.embeddingModel,
      })
      .from(schema.knowledgeDocument)
      .innerJoin(
        schema.knowledgeChunk,
        and(
          eq(
            schema.knowledgeChunk.documentId,
            schema.knowledgeDocument.documentId,
          ),
          eq(schema.knowledgeChunk.chunkIndex, 0),
        ),
      )
      .where(inArray(schema.knowledgeDocument.documentId, neighborIds));
    for (const row of rows) {
      const graphBoost = boost.get(row.documentId) ?? 0;
      results.set(row.documentId, {
        ...row,
        semantic: 0,
        lexical: 0,
        graphBoost,
        score: graphBoost,
        matchedBy: ['graph'],
      });
    }
  }

  private async embedChunks(chunks: string[]) {
    if (
      !chunks.length ||
      !process.env.OPENAI_API_KEY ||
      process.env.BRAIN_EMBEDDINGS_DISABLED === 'true'
    ) {
      return null;
    }
    try {
      const response = await this.openAI.embeddings.create({
        model:
          process.env.BRAIN_EMBEDDING_MODEL ||
          process.env.ARTIFACT_EMBEDDING_MODEL ||
          'text-embedding-3-small',
        input: chunks,
        dimensions: 1536,
        encoding_format: 'float',
      });
      return response.data.map((item) => item.embedding);
    } catch {
      return null;
    }
  }

  private async embedQuery(query: string) {
    const rows = await this.embedChunks([query]);
    return rows?.[0] ?? null;
  }

  private startMutation(
    space: typeof schema.knowledgeSpace.$inferSelect,
    principal: KnowledgePrincipal,
    actionName: string,
    input: unknown,
  ) {
    const traceId = randomUUID();
    this.provenance.startRun({
      traceId,
      scopeType: 'knowledge_space',
      scopeId: space.spaceId,
      initiator: principal.principalId,
      workspaceId: space.workspaceId ?? undefined,
      provider: space.provider,
      modelId: 'knowledge-space',
      input,
      metadata: { action: actionName, knowledgeSpaceName: space.name },
    });
    return { traceId, owned: true };
  }

  private captureMutation(
    space: typeof schema.knowledgeSpace.$inferSelect,
    principal: KnowledgePrincipal,
    eventType: string,
    payload: unknown,
  ) {
    const trace = this.startMutation(space, principal, eventType, payload);
    this.provenance.recordEvent(trace.traceId, {
      category: 'system',
      eventType,
      name: eventType
        .split('.')
        .map((part) => part.replace(/_/g, ' '))
        .join(' · '),
      payload,
      performedBy: actor(principal),
    });
    this.provenance.finishRun(trace.traceId, {
      status: 'completed',
      output: { spaceId: space.spaceId },
    });
  }

  private touchSpace(spaceId: string) {
    return this.db
      .update(schema.knowledgeSpace)
      .set({ updatedAt: new Date() })
      .where(eq(schema.knowledgeSpace.spaceId, spaceId));
  }

  private publicSpace(
    space: typeof schema.knowledgeSpace.$inferSelect,
    permission: KnowledgePermission | null,
    counts: { documents: number; links: number },
  ) {
    return {
      spaceId: space.spaceId,
      name: space.name,
      description: space.description,
      provider: space.provider,
      providerConfig: space.providerConfig ?? {},
      color: space.color,
      status: space.status,
      isDefault: space.isDefault,
      autoGrantNewAgents: space.autoGrantNewAgents,
      permission,
      counts,
      workspaceId: space.workspaceId,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
    };
  }

  private publicDocument(
    document: typeof schema.knowledgeDocument.$inferSelect,
    includeContent = false,
  ) {
    const okf = parseMarkdownDocument(document.content, document.path).okf;
    return {
      documentId: document.documentId,
      spaceId: document.spaceId,
      path: document.path,
      title: document.title,
      ...(includeContent ? { content: document.content } : {}),
      contentHash: document.contentHash,
      revision: document.revision,
      frontmatter: document.frontmatter ?? {},
      okf,
      tags: document.tags,
      providerDocumentId: document.providerDocumentId,
      providerRevision: document.providerRevision,
      createdByType: document.createdByType,
      createdById: document.createdById,
      updatedByType: document.updatedByType,
      updatedById: document.updatedById,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }
}

function sha256(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function actor(principal: KnowledgePrincipal) {
  return {
    type:
      principal.principalType === 'user'
        ? ('human' as const)
        : principal.principalType,
    id: principal.principalId,
    role: 'knowledge_editor',
  };
}

function normalizeColor(color?: string) {
  return ['teal', 'blue', 'violet', 'amber', 'rose', 'stone'].includes(
    color ?? '',
  )
    ? color!
    : 'teal';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number(value) || min));
}

function same(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
