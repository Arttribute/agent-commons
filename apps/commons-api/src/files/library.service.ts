import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
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
import { FilesService } from './files.service';

export type LibraryPrincipal = {
  principalId: string;
  principalType: 'user' | 'agent' | 'service';
  workspaceId?: string | null;
};

@Injectable()
export class LibraryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly files: FilesService,
    private readonly openAI: OpenAIService,
  ) {}

  async list(
    principal: LibraryPrincipal,
    filters: {
      query?: string;
      view?: string;
      source?: string;
      favorite?: boolean;
      sessionId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const limit = clamp(filters.limit ?? 60, 1, 100);
    const offset = Math.max(0, filters.offset ?? 0);
    const conditions: Array<SQL | undefined> = [
      isNull(schema.libraryItem.deletedAt),
      this.userAccess(schema.libraryItem, principal),
      filters.query
        ? or(
            ilike(schema.libraryItem.name, `%${escapeLike(filters.query)}%`),
            ilike(
              schema.libraryItem.textPreview,
              `%${escapeLike(filters.query)}%`,
            ),
          )
        : undefined,
      this.viewCondition(filters.view),
      filters.source ? eq(schema.libraryItem.source, filters.source) : undefined,
      filters.favorite ? eq(schema.libraryItem.isFavorite, true) : undefined,
      filters.sessionId
        ? eq(schema.libraryItem.sourceSessionId, filters.sessionId)
        : undefined,
    ];
    const items = await this.db.query.libraryItem.findMany({
      where: and(...conditions),
      orderBy: (table) => desc(table.updatedAt),
      limit,
      offset,
    });
    const sessionIds = [
      ...new Set(items.map((item) => item.sourceSessionId).filter(Boolean)),
    ] as string[];
    const sessions = sessionIds.length
      ? await this.db.query.session.findMany({
          where: (table) => inArray(table.sessionId, sessionIds),
        })
      : [];
    const titleBySession = new Map(
      sessions.map((session) => [session.sessionId, session.title]),
    );
    return Promise.all(
      items.map(async (item) => ({
        ...this.publicItem(item),
        sessionTitle: item.sourceSessionId
          ? titleBySession.get(item.sourceSessionId) ?? 'Untitled chat'
          : null,
        previewUrl:
          item.kind === 'image'
            ? (
                await this.files.createDownloadUrl(item.itemId, {
                  ownerId: principal.principalId,
                  workspaceId: principal.workspaceId ?? undefined,
                })
              ).url
            : null,
      })),
    );
  }

  async get(itemId: string, principal: LibraryPrincipal) {
    const item = await this.getAccessible(itemId, principal);
    const [blobs, grants, links] = await Promise.all([
      this.db.query.libraryBlob.findMany({
        where: (table) => eq(table.itemId, itemId),
      }),
      this.isOwner(item, principal)
        ? this.db.query.libraryGrant.findMany({
            where: (table) => eq(table.itemId, itemId),
          })
        : Promise.resolve([]),
      this.db.query.libraryLink.findMany({
        where: (table) => eq(table.itemId, itemId),
      }),
    ]);
    return {
      ...this.publicItem(item),
      blobs: blobs.map((blob) => ({
        blobId: blob.blobId,
        role: blob.role,
        storageProvider: blob.storageProvider,
        mimeType: blob.mimeType,
        sizeBytes: blob.sizeBytes,
        pageNumber: blob.pageNumber,
        width: blob.width,
        height: blob.height,
      })),
      grants,
      links,
    };
  }

  async download(itemId: string, principal: LibraryPrincipal) {
    await this.getAccessible(itemId, principal);
    await this.audit(itemId, principal, 'downloaded');
    return this.files.createDownloadUrl(itemId, {
      ownerId: principal.principalId,
      workspaceId: principal.workspaceId ?? undefined,
      agentId:
        principal.principalType === 'agent' ? principal.principalId : undefined,
    });
  }

  async update(
    itemId: string,
    principal: LibraryPrincipal,
    input: { name?: string; description?: string; isFavorite?: boolean },
  ) {
    const item = await this.getOwned(itemId, principal);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('name cannot be empty');
    }
    const [updated] = await this.db
      .update(schema.libraryItem)
      .set({
        name: name?.slice(0, 240),
        description: input.description?.trim().slice(0, 2_000),
        isFavorite: input.isFavorite,
        updatedAt: new Date(),
      })
      .where(eq(schema.libraryItem.itemId, item.itemId))
      .returning();
    await this.audit(itemId, principal, 'updated');
    return this.publicItem(updated);
  }

  async remove(itemId: string, principal: LibraryPrincipal) {
    await this.getOwned(itemId, principal);
    await this.db
      .update(schema.libraryItem)
      .set({ status: 'deleted', deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.libraryItem.itemId, itemId));
    await this.audit(itemId, principal, 'deleted');
    return { deleted: true };
  }

  async setGrant(
    itemId: string,
    principal: LibraryPrincipal,
    input: {
      subjectType: 'user' | 'agent' | 'workspace';
      subjectId: string;
      permission?: 'read' | 'edit' | 'manage';
      expiresAt?: string | null;
    },
  ) {
    await this.getOwned(itemId, principal);
    if (!input.subjectId?.trim()) {
      throw new BadRequestException('subjectId is required');
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.valueOf())) {
      throw new BadRequestException('expiresAt must be an ISO date');
    }
    const [grant] = await this.db
      .insert(schema.libraryGrant)
      .values({
        itemId,
        subjectType: input.subjectType,
        subjectId: input.subjectId.trim(),
        permission: input.permission ?? 'read',
        createdBy: principal.principalId,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          schema.libraryGrant.itemId,
          schema.libraryGrant.subjectType,
          schema.libraryGrant.subjectId,
        ],
        set: { permission: input.permission ?? 'read', expiresAt },
      })
      .returning();
    await this.markShared(itemId);
    await this.audit(itemId, principal, 'grant_updated', {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
    });
    return grant;
  }

  async revokeGrant(
    itemId: string,
    grantId: string,
    principal: LibraryPrincipal,
  ) {
    await this.getOwned(itemId, principal);
    await this.db
      .delete(schema.libraryGrant)
      .where(
        and(
          eq(schema.libraryGrant.itemId, itemId),
          eq(schema.libraryGrant.grantId, grantId),
        ),
      );
    await this.refreshVisibility(itemId);
    await this.audit(itemId, principal, 'grant_revoked', { grantId });
    return { revoked: true };
  }

  async createShareLink(
    itemId: string,
    principal: LibraryPrincipal,
    input: { expiresAt?: string | null },
  ) {
    await this.getOwned(itemId, principal);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.valueOf())) {
      throw new BadRequestException('expiresAt must be an ISO date');
    }
    const [share] = await this.db
      .insert(schema.libraryShareLink)
      .values({
        itemId,
        tokenHash,
        createdBy: principal.principalId,
        expiresAt,
      })
      .returning();
    await this.markShared(itemId);
    await this.audit(itemId, principal, 'share_link_created', {
      shareId: share.shareId,
    });
    const base = (
      process.env.ARTIFACT_SHARE_BASE_URL ||
      'http://localhost:3000/shared/artifacts'
    ).replace(/\/$/, '');
    return { ...share, token: undefined, url: `${base}/${token}` };
  }

  async revokeShareLink(
    itemId: string,
    shareId: string,
    principal: LibraryPrincipal,
  ) {
    await this.getOwned(itemId, principal);
    await this.db
      .update(schema.libraryShareLink)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.libraryShareLink.itemId, itemId),
          eq(schema.libraryShareLink.shareId, shareId),
        ),
      );
    await this.refreshVisibility(itemId);
    await this.audit(itemId, principal, 'share_link_revoked', { shareId });
    return { revoked: true };
  }

  async resolveShare(token: string) {
    const tokenHash = hashToken(token);
    const share = await this.db.query.libraryShareLink.findFirst({
      where: (table) =>
        and(
          eq(table.tokenHash, tokenHash),
          isNull(table.revokedAt),
          or(isNull(table.expiresAt), gt(table.expiresAt, new Date())),
        ),
    });
    if (!share) throw new NotFoundException('Share link not found');
    const item = await this.db.query.libraryItem.findFirst({
      where: (table) =>
        and(eq(table.itemId, share.itemId), isNull(table.deletedAt)),
    });
    if (!item || !['ready', 'partial'].includes(item.status)) {
      throw new NotFoundException('Shared artifact not found');
    }
    await this.db
      .update(schema.libraryShareLink)
      .set({
        lastUsedAt: new Date(),
        useCount: sql`${schema.libraryShareLink.useCount} + 1`,
      })
      .where(eq(schema.libraryShareLink.shareId, share.shareId));
    await this.db.insert(schema.libraryAuditEvent).values({
      itemId: item.itemId,
      actorType: 'share_link',
      actorId: share.shareId,
      action: 'downloaded',
    });
    return {
      item: this.publicItem(item),
      download: await this.files.createShareDownloadUrl(item.itemId),
    };
  }

  async searchForAgent(input: {
    agentId: string;
    sessionId?: string;
    query: string;
    limit?: number;
  }) {
    const query = input.query.trim();
    if (!query) throw new BadRequestException('query is required');
    const access = or(
      input.sessionId
        ? and(
            eq(schema.libraryItem.sourceAgentId, input.agentId),
            eq(schema.libraryItem.sourceSessionId, input.sessionId),
          )
        : undefined,
      sql<boolean>`EXISTS (
        SELECT 1 FROM library_grant g
        WHERE g.item_id = ${schema.libraryItem.itemId}
          AND g.subject_type = 'agent'
          AND g.subject_id = ${input.agentId}
          AND (g.expires_at IS NULL OR g.expires_at > now())
      )`,
    );
    const embedding = await this.embedQuery(query);
    const semantic = embedding
      ? sql<number>`coalesce(1 - (${cosineDistance(schema.libraryChunk.embedding, embedding)}), 0)`
      : sql<number>`0`;
    const lexical = sql<number>`ts_rank_cd(to_tsvector('english', ${schema.libraryChunk.content}), websearch_to_tsquery('english', ${query}))`;
    const score = embedding
      ? sql<number>`(${semantic} * 0.75) + (least(${lexical}, 1) * 0.25)`
      : lexical;
    const rows = await this.db
      .select({
        itemId: schema.libraryItem.itemId,
        name: schema.libraryItem.name,
        kind: schema.libraryItem.kind,
        mimeType: schema.libraryItem.mimeType,
        sourceSessionId: schema.libraryItem.sourceSessionId,
        chunkIndex: schema.libraryChunk.chunkIndex,
        excerpt: schema.libraryChunk.content,
        score,
      })
      .from(schema.libraryChunk)
      .innerJoin(
        schema.libraryItem,
        eq(schema.libraryChunk.itemId, schema.libraryItem.itemId),
      )
      .where(
        and(
          isNull(schema.libraryItem.deletedAt),
          or(
            eq(schema.libraryItem.status, 'ready'),
            eq(schema.libraryItem.status, 'partial'),
          ),
          access,
          embedding
            ? or(
                sql`${schema.libraryChunk.embedding} IS NOT NULL`,
                sql`to_tsvector('english', ${schema.libraryChunk.content}) @@ websearch_to_tsquery('english', ${query})`,
              )
            : sql`to_tsvector('english', ${schema.libraryChunk.content}) @@ websearch_to_tsquery('english', ${query})`,
        ),
      )
      .orderBy(desc(score))
      .limit(clamp(input.limit ?? 8, 1, 20));
    return rows.map((row) => ({
      ...row,
      excerpt: row.excerpt.slice(0, 1_200),
    }));
  }

  async getStoragePreference(principal: LibraryPrincipal) {
    const preference = await this.db.query.libraryPreference.findFirst({
      where: (table) => eq(table.ownerUserId, principal.principalId),
    });
    return {
      defaultStorageProvider:
        preference?.defaultStorageProvider === 'ipfs' ? 'ipfs' : 's3',
    };
  }

  async setStoragePreference(
    principal: LibraryPrincipal,
    provider: 's3' | 'ipfs',
  ) {
    if (!['s3', 'ipfs'].includes(provider)) {
      throw new BadRequestException('Storage provider must be s3 or ipfs');
    }
    const [preference] = await this.db
      .insert(schema.libraryPreference)
      .values({
        ownerUserId: principal.principalId,
        defaultStorageProvider: provider,
      })
      .onConflictDoUpdate({
        target: schema.libraryPreference.ownerUserId,
        set: { defaultStorageProvider: provider, updatedAt: new Date() },
      })
      .returning();
    return preference;
  }

  private async embedQuery(query: string) {
    if (!process.env.OPENAI_API_KEY || process.env.ARTIFACT_EMBEDDINGS_DISABLED === 'true') {
      return null;
    }
    try {
      const response = await this.openAI.embeddings.create({
        model: process.env.ARTIFACT_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: query,
        dimensions: 1536,
        encoding_format: 'float',
      });
      return response.data[0]?.embedding ?? null;
    } catch {
      return null;
    }
  }

  private userAccess(
    item: typeof schema.libraryItem,
    principal: LibraryPrincipal,
  ) {
    return or(
      sql<boolean>`lower(${item.ownerUserId}) = lower(${principal.principalId})`,
      principal.workspaceId
        ? sql<boolean>`lower(${item.workspaceId}) = lower(${principal.workspaceId})`
        : undefined,
      sql<boolean>`EXISTS (
        SELECT 1 FROM library_grant g
        WHERE g.item_id = ${item.itemId}
          AND (
            (g.subject_type = 'user' AND lower(g.subject_id) = lower(${principal.principalId}))
            OR (${principal.workspaceId ?? ''} <> '' AND g.subject_type = 'workspace' AND lower(g.subject_id) = lower(${principal.workspaceId ?? ''}))
          )
          AND (g.expires_at IS NULL OR g.expires_at > now())
      )`,
    )!;
  }

  private viewCondition(view?: string) {
    if (!view || view === 'all') return undefined;
    if (view === 'images') return eq(schema.libraryItem.kind, 'image');
    if (view === 'apps') return eq(schema.libraryItem.kind, 'app');
    if (view === 'files') {
      return sql<boolean>`${schema.libraryItem.kind} NOT IN ('image', 'app')`;
    }
    return undefined;
  }

  private async getAccessible(itemId: string, principal: LibraryPrincipal) {
    const item = await this.db.query.libraryItem.findFirst({
      where: (table) =>
        and(
          eq(table.itemId, itemId),
          isNull(table.deletedAt),
          this.userAccess(schema.libraryItem, principal),
        ),
    });
    if (!item) throw new NotFoundException('Artifact not found');
    return item;
  }

  private async getOwned(itemId: string, principal: LibraryPrincipal) {
    const item = await this.db.query.libraryItem.findFirst({
      where: (table) =>
        and(eq(table.itemId, itemId), isNull(table.deletedAt)),
    });
    if (!item) throw new NotFoundException('Artifact not found');
    if (!this.isOwner(item, principal)) {
      throw new ForbiddenException('Only the artifact owner can manage access');
    }
    return item;
  }

  private isOwner(
    item: typeof schema.libraryItem.$inferSelect,
    principal: LibraryPrincipal,
  ) {
    return same(item.ownerUserId, principal.principalId);
  }

  private publicItem(item: typeof schema.libraryItem.$inferSelect) {
    return {
      itemId: item.itemId,
      name: item.name,
      description: item.description,
      kind: item.kind,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      source: item.source,
      status: item.status,
      visibility: item.visibility,
      sourceAgentId: item.sourceAgentId,
      sourceSessionId: item.sourceSessionId,
      textPreview: item.textPreview,
      metadata: item.metadata,
      isFavorite: item.isFavorite,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private async markShared(itemId: string) {
    await this.db
      .update(schema.libraryItem)
      .set({ visibility: 'shared', updatedAt: new Date() })
      .where(eq(schema.libraryItem.itemId, itemId));
  }

  private async refreshVisibility(itemId: string) {
    const [grant, share] = await Promise.all([
      this.db.query.libraryGrant.findFirst({
        where: (table) => eq(table.itemId, itemId),
      }),
      this.db.query.libraryShareLink.findFirst({
        where: (table) =>
          and(eq(table.itemId, itemId), isNull(table.revokedAt)),
      }),
    ]);
    await this.db
      .update(schema.libraryItem)
      .set({
        visibility: grant || share ? 'shared' : 'private',
        updatedAt: new Date(),
      })
      .where(eq(schema.libraryItem.itemId, itemId));
  }

  private async audit(
    itemId: string,
    principal: LibraryPrincipal,
    action: string,
    metadata: Record<string, any> = {},
  ) {
    await this.db.insert(schema.libraryAuditEvent).values({
      itemId,
      actorType: principal.principalType,
      actorId: principal.principalId,
      action,
      metadata,
    });
  }
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
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
