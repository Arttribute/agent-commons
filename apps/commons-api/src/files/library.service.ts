import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import {
  and,
  asc,
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
import { CodeProjectBuilder } from '~/code-project/code-project.builder';
import { FilesService } from './files.service';

export type LibraryPrincipal = {
  principalId: string;
  principalType: 'user' | 'agent' | 'service';
  workspaceId?: string | null;
};

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);
  private readonly compiledPreviewCache = new Map<
    string,
    { version: string; html: string; warnings: unknown[] }
  >();

  constructor(
    private readonly db: DatabaseService,
    private readonly files: FilesService,
    private readonly openAI: OpenAIService,
    private readonly codeBuilder: CodeProjectBuilder,
  ) {}

  async list(
    principal: LibraryPrincipal,
    filters: {
      query?: string;
      view?: string;
      source?: string;
      favorite?: boolean;
      sessionId?: string;
      agentId?: string;
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
      filters.source
        ? eq(schema.libraryItem.source, filters.source)
        : undefined,
      filters.favorite ? eq(schema.libraryItem.isFavorite, true) : undefined,
      filters.sessionId
        ? or(
            eq(schema.libraryItem.sourceSessionId, filters.sessionId),
            this.linkedToScope('session', filters.sessionId),
          )
        : undefined,
      filters.agentId
        ? or(
            eq(schema.libraryItem.sourceAgentId, filters.agentId),
            this.linkedToScope('agent', filters.agentId),
            sql<boolean>`EXISTS (
              SELECT 1
              FROM library_link agent_session_link
              INNER JOIN session linked_session
                ON linked_session.session_id::text = agent_session_link.scope_id
              WHERE agent_session_link.item_id = ${schema.libraryItem.itemId}
                AND agent_session_link.scope_type = 'session'
                AND linked_session.agent_id = ${filters.agentId}
            )`,
          )
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
        sessionTitle:
          item.sourceSessionId &&
          (!filters.agentId || item.sourceAgentId === filters.agentId)
            ? (titleBySession.get(item.sourceSessionId) ?? 'Untitled chat')
            : null,
        previewUrl:
          (await this.files.createPreviewUrl(item.itemId, {
            ownerId: principal.principalId,
            workspaceId: principal.workspaceId ?? undefined,
          })) ??
          (item.kind === 'image'
            ? (
                await this.files.createDownloadUrl(item.itemId, {
                  ownerId: principal.principalId,
                  workspaceId: principal.workspaceId ?? undefined,
                })
              ).url
            : null),
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

  async preview(itemId: string, principal: LibraryPrincipal) {
    const item = await this.getAccessible(itemId, principal);
    const context = {
      agentId:
        principal.principalType === 'agent' ? principal.principalId : undefined,
      ownerId:
        principal.principalType === 'agent' ? undefined : principal.principalId,
      workspaceId: principal.workspaceId ?? undefined,
    };
    const content = await this.files.readFileForAgent({
      fileId: itemId,
      ...context,
      maxChars: 50_000,
      includeImageUrls: true,
    });
    const [downloadResult, inlineResult, codePreviewResult] =
      await Promise.allSettled([
        this.files.createDownloadUrl(itemId, context),
        this.files.createInlineUrl(itemId, context),
        this.codePreview(item, content.content, content.truncated),
      ]);
    const download = settledValue(downloadResult);
    const inline = settledValue(inlineResult);
    const codePreview = settledValue(codePreviewResult);
    for (const result of [downloadResult, inlineResult]) {
      if (result.status === 'rejected') {
        this.logger.debug(
          `Artifact ${itemId} has no downloadable original: ${safeErrorMessage(result.reason)}`,
        );
      }
    }
    if (codePreviewResult.status === 'rejected') {
      this.logger.warn(
        `Could not prepare code preview for ${itemId}: ${safeErrorMessage(codePreviewResult.reason)}`,
      );
    }
    await this.audit(itemId, principal, 'previewed');
    return {
      ...this.publicItem(item),
      content: content.content,
      totalChars: content.totalChars,
      truncated: content.truncated,
      artifacts: content.artifacts,
      download,
      inline,
      ...codePreview,
    };
  }

  async provenance(itemId: string, principal: LibraryPrincipal) {
    const item = await this.getAccessible(itemId, principal);
    const result = await this.buildArtifactProvenance(item, true);
    await this.audit(itemId, principal, 'provenance_viewed');
    return result;
  }

  /** A safe EAA-oriented projection for compact UI, export, and sharing. */
  private async buildArtifactProvenance(
    item: typeof schema.libraryItem.$inferSelect,
    includeEvents: boolean,
  ) {
    const links = await this.db.query.libraryLink.findMany({
      where: (table) => eq(table.itemId, item.itemId),
    });
    const exactTraceIds = links
      .filter((link) => link.scopeType === 'provenance_trace')
      .map((link) => link.scopeId);
    const runs = exactTraceIds.length
      ? await this.db.query.provenanceRun.findMany({
          where: (table) => inArray(table.traceId, exactTraceIds),
          orderBy: (table) => asc(table.startedAt),
        })
      : item.sourceSessionId
        ? await this.db.query.provenanceRun.findMany({
            where: (table) => eq(table.sessionId, item.sourceSessionId!),
            orderBy: (table) => asc(table.startedAt),
          })
        : [];
    const traceIds = runs.map((run) => run.traceId);
    const [events, audits, grants, shares] = await Promise.all([
      includeEvents && traceIds.length
        ? this.db.query.provenanceEvent.findMany({
            where: (table) => inArray(table.traceId, traceIds),
            orderBy: (table) => [asc(table.startedAt), asc(table.sequence)],
          })
        : Promise.resolve([]),
      this.db.query.libraryAuditEvent.findMany({
        where: (table) => eq(table.itemId, item.itemId),
        orderBy: (table) => asc(table.createdAt),
      }),
      this.db.query.libraryGrant.findMany({
        where: (table) => eq(table.itemId, item.itemId),
      }),
      this.db.query.libraryShareLink.findMany({
        where: (table) => eq(table.itemId, item.itemId),
      }),
    ]);
    const sourceFileId = stringValue(
      item.metadata?.sourceFileId ?? item.metadata?.revisionOf,
    );
    const source = sourceFileId
      ? await this.db.query.libraryItem.findFirst({
          where: (table) => eq(table.itemId, sourceFileId),
        })
      : undefined;
    const revisions = await this.db.query.libraryItem.findMany({
      where: (table) =>
        sql`${table.metadata}->>'sourceFileId' = ${item.itemId}`,
      orderBy: (table) => asc(table.createdAt),
      limit: 25,
    });
    const metadataProvenance = recordValue(item.metadata?.provenance);
    const contentHash = `sha256:${item.sha256}`;

    return {
      schemaVersion: 1,
      context: 'https://provenancekit.com/context/v2',
      resource: {
        id: `urn:agentcommons:artifact:${item.itemId}`,
        itemId: item.itemId,
        name: item.name,
        kind: item.kind,
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
        createdAt: item.createdAt,
        createdBy: item.sourceAgentId
          ? `agent:${item.sourceAgentId}`
          : `user:${item.ownerUserId}`,
        address: { scheme: 'hash', ref: contentHash },
      },
      capture: {
        mode: runs[0]?.captureMode ?? 'metadata',
        linkage: exactTraceIds.length ? 'exact_trace' : 'session_fallback',
        traceCount: runs.length,
        eventCount: runs.reduce(
          (total, run) => total + Number(run.eventCount ?? 0),
          0,
        ),
        droppedEvents: runs.reduce(
          (total, run) => total + Number(run.droppedEventCount ?? 0),
          0,
        ),
      },
      entities: uniqueEntities(runs, item),
      runs: runs.map((run) => ({
        traceId: run.traceId,
        status: run.status,
        provider: run.provider,
        modelId: run.modelId,
        agentId: run.agentId,
        initiator: run.initiator,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        durationMs: run.durationMs,
        captureMode: run.captureMode,
        bundleHash: run.bundleHash,
        anchorStatus: run.anchorStatus,
        anchorProvider: run.anchorProvider,
        anchorRef: run.anchorRef,
      })),
      actions: includeEvents
        ? events.map((event) => ({
            id:
              stringValue((event.eaaAction as any)?.id) ??
              `urn:agentcommons:event:${event.traceId}:${event.sequence}`,
            traceId: event.traceId,
            sequence: event.sequence,
            category: event.category,
            eventType: event.eventType,
            name: event.name,
            summary: event.summary,
            status: event.status,
            performedBy: stringValue((event.eaaAction as any)?.performedBy),
            contentHash: event.contentHash,
            startedAt: event.startedAt,
            endedAt: event.endedAt,
            durationMs: event.durationMs,
            lineage: recordValue(event.metadata)?.lineage,
          }))
        : [],
      derivation: {
        source: source
          ? {
              itemId: source.itemId,
              name: source.name,
              contentHash: `sha256:${source.sha256}`,
            }
          : null,
        revisions: revisions.map((revision) => ({
          itemId: revision.itemId,
          name: revision.name,
          contentHash: `sha256:${revision.sha256}`,
          createdAt: revision.createdAt,
        })),
      },
      governance: {
        license:
          metadataProvenance?.license ??
          item.metadata?.license ??
          'not_specified',
        aiTraining:
          metadataProvenance?.aiTraining ??
          item.metadata?.aiTraining ??
          'not_specified',
        authorization: {
          visibility: item.visibility,
          owner: item.ownerUserId,
          grantCount: grants.length,
          grants: grants.map((grant) => ({
            grantor: grant.createdBy,
            subjectType: grant.subjectType,
            subjectId: grant.subjectId,
            permission: grant.permission,
            expiresAt: grant.expiresAt,
            createdAt: grant.createdAt,
          })),
          shareCount: shares.filter((share) => !share.revokedAt).length,
          shares: shares.map((share) => ({
            shareId: share.shareId,
            createdBy: share.createdBy,
            expiresAt: share.expiresAt,
            revokedAt: share.revokedAt,
            disclosure: normalizeDisclosure(share.disclosure),
          })),
          sharing: 'revocable_capability',
        },
      },
      integrity: {
        algorithm: 'sha256',
        contentHash,
        verified: Boolean(item.sha256),
        bundleHashes: runs.map((run) => run.bundleHash).filter(Boolean),
        anchors: runs
          .filter((run) => run.anchorStatus !== 'not_requested')
          .map((run) => ({
            traceId: run.traceId,
            status: run.anchorStatus,
            provider: run.anchorProvider,
            reference: run.anchorRef,
          })),
      },
      history: audits.map((event) => ({
        eventId: event.eventId,
        action: event.action,
        actorType: event.actorType,
        actorId: event.actorId,
        createdAt: event.createdAt,
        contentHash: stringValue(event.metadata?.contentHash),
        traceId: stringValue(event.metadata?.traceId),
      })),
      disclosure: {
        eventsIncluded: includeEvents,
        privateReasoningIncluded: false,
        credentialsIncluded: false,
      },
    };
  }

  private async codePreview(
    item: typeof schema.libraryItem.$inferSelect,
    content: string,
    truncated: boolean,
  ) {
    if (item.kind === 'app' || item.source === 'code_project') {
      const project = await this.db.query.codeProject.findFirst({
        where: (table) => eq(table.libraryItemId, item.itemId),
      });
      if (!project) {
        return {
          interactivePreview: {
            type: 'unavailable' as const,
            error: 'The source project record is unavailable.',
          },
        };
      }
      const [files, deployment] = await Promise.all([
        this.db.query.codeProjectFile.findMany({
          where: (table) => eq(table.projectId, project.projectId),
          orderBy: (table) => table.path,
        }),
        this.db.query.codeProjectDeployment.findFirst({
          where: (table) =>
            and(
              eq(table.projectId, project.projectId),
              eq(table.status, 'ready'),
            ),
          orderBy: (table) => desc(table.createdAt),
        }),
      ]);
      let interactivePreview:
        | {
            type: 'url';
            url: string;
            compiled: true;
            warnings: unknown[];
          }
        | {
            type: 'html';
            html: string;
            compiled: true;
            warnings: unknown[];
          }
        | { type: 'unavailable'; error: string };
      if (deployment?.publicUrl) {
        interactivePreview = {
          type: 'url',
          url: deployment.publicUrl,
          compiled: true,
          warnings: deployment.buildErrors ?? [],
        };
      } else {
        try {
          const version = `${project.updatedAt.toISOString()}:${files
            .map((file) => `${file.path}:${file.version}`)
            .join('|')}`;
          let built = this.compiledPreviewCache.get(project.projectId);
          if (!built || built.version !== version) {
            const compiled = await this.codeBuilder.buildInlinePreview({
              name: project.name,
              entryFile: project.entryFile,
              files: files.map((file) => ({
                path: file.path,
                content: file.content,
              })),
            });
            built = { version, ...compiled };
            this.compiledPreviewCache.set(project.projectId, built);
            while (this.compiledPreviewCache.size > 50) {
              this.compiledPreviewCache.delete(
                this.compiledPreviewCache.keys().next().value!,
              );
            }
          }
          interactivePreview = {
            type: 'html',
            html: built.html,
            compiled: true,
            warnings: built.warnings,
          };
        } catch (error) {
          interactivePreview = {
            type: 'unavailable',
            error: buildErrorMessage(error),
          };
        }
      }
      return {
        codeProject: {
          projectId: project.projectId,
          agentId: project.agentId,
          name: project.name,
          framework: project.framework,
          entryFile: project.entryFile,
          status: project.status,
          repositoryUrl: project.repositoryUrl,
          files: files.map((file) => ({
            path: file.path,
            content: file.content,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            version: file.version,
          })),
        },
        interactivePreview,
      };
    }

    if (item.kind !== 'code' || !content) return {};
    if (truncated) {
      return {
        interactivePreview: {
          type: 'unavailable' as const,
          error:
            'This source file is too large to compile in the artifact preview. The complete original remains downloadable.',
        },
      };
    }
    try {
      const built = await this.codeBuilder.buildSingleFilePreview({
        name: item.name,
        content,
      });
      return built
        ? {
            interactivePreview: {
              type: 'html' as const,
              html: built.html,
              compiled: true,
              warnings: built.warnings,
            },
          }
        : {};
    } catch (error) {
      return {
        interactivePreview: {
          type: 'unavailable' as const,
          error: buildErrorMessage(error),
        },
      };
    }
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
    input: {
      expiresAt?: string | null;
      disclosure?: {
        artifact?: boolean;
        provenance?: boolean;
        events?: boolean;
      };
    },
  ) {
    await this.getOwned(itemId, principal);
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.valueOf())) {
      throw new BadRequestException('expiresAt must be an ISO date');
    }
    const disclosure = {
      artifact: input.disclosure?.artifact !== false,
      provenance: input.disclosure?.provenance !== false,
      events: Boolean(input.disclosure?.events),
    };
    if (!disclosure.artifact && !disclosure.provenance) {
      throw new BadRequestException(
        'A share link must disclose the artifact, its provenance, or both',
      );
    }
    if (!disclosure.provenance) disclosure.events = false;
    const [share] = await this.db
      .insert(schema.libraryShareLink)
      .values({
        itemId,
        tokenHash,
        createdBy: principal.principalId,
        expiresAt,
        disclosure,
      })
      .returning();
    await this.markShared(itemId);
    await this.audit(itemId, principal, 'share_link_created', {
      shareId: share.shareId,
      disclosure,
    });
    const base = (
      process.env.ARTIFACT_SHARE_BASE_URL ||
      'http://localhost:3000/shared/artifacts'
    ).replace(/\/$/, '');
    return { ...share, token: undefined, disclosure, url: `${base}/${token}` };
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
    const disclosure = normalizeDisclosure(share.disclosure);
    const [downloadResult, provenanceResult] = await Promise.allSettled([
      disclosure.artifact
        ? this.files.createShareDownloadUrl(item.itemId)
        : Promise.resolve(undefined),
      disclosure.provenance
        ? this.buildArtifactProvenance(item, disclosure.events).then(
            redactSharedProvenance,
          )
        : Promise.resolve(undefined),
    ]);
    const download = settledValue(downloadResult);
    const provenance = settledValue(provenanceResult);
    return {
      item: sharedItem(item),
      disclosure,
      download,
      provenance,
      unavailable: {
        artifact:
          downloadResult.status === 'rejected'
            ? safeErrorMessage(downloadResult.reason)
            : undefined,
        provenance:
          provenanceResult.status === 'rejected'
            ? safeErrorMessage(provenanceResult.reason)
            : undefined,
      },
    };
  }

  async searchForAgent(input: {
    agentId: string;
    sessionId?: string;
    ownerId?: string;
    query?: string;
    limit?: number;
  }) {
    const query = input.query?.trim() ?? '';
    const limit = clamp(input.limit ?? 8, 1, 20);
    const context = await this.resolveAgentLibraryContext(input);
    const access = or(
      context.ownerId
        ? this.userAccess(schema.libraryItem, {
            principalId: context.ownerId,
            principalType: 'user',
            workspaceId: context.workspaceId,
          })
        : undefined,
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
    )!;
    const available = and(
      isNull(schema.libraryItem.deletedAt),
      or(
        eq(schema.libraryItem.status, 'ready'),
        eq(schema.libraryItem.status, 'partial'),
      ),
      access,
    );

    // Browsing the Library should be one cheap indexed query and must include
    // images/apps that have no extracted text chunks.
    if (isArtifactBrowseQuery(query)) {
      const recent = await this.db.query.libraryItem.findMany({
        where: available,
        orderBy: (table) => desc(table.updatedAt),
        limit,
      });
      return recent.map((item) => compactArtifactResult(item, 'recent'));
    }

    // Filename/type matches are both faster and more intuitive than embedding
    // a query such as "presentation" or "xlsx". They also find binary files
    // without chunks. Only fall through to content search when needed.
    const escaped = `%${escapeLike(query)}%`;
    const metadataMatches = await this.db.query.libraryItem.findMany({
      where: and(
        available,
        or(
          ilike(schema.libraryItem.name, escaped),
          ilike(schema.libraryItem.description, escaped),
          ilike(schema.libraryItem.kind, escaped),
          ilike(schema.libraryItem.mimeType, escaped),
          ilike(schema.libraryItem.source, escaped),
          ilike(schema.libraryItem.textPreview, escaped),
        ),
      ),
      orderBy: (table) => desc(table.updatedAt),
      limit: Math.min(limit * 2, 40),
    });
    const compactMetadata = metadataMatches
      .map((item) =>
        compactArtifactResult(
          item,
          'metadata',
          metadataArtifactScore(item, query),
        ),
      )
      .sort(compareArtifactResults);
    if (compactMetadata.length >= limit) {
      return compactMetadata.slice(0, limit);
    }

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
        description: schema.libraryItem.description,
        sizeBytes: schema.libraryItem.sizeBytes,
        sourceSessionId: schema.libraryItem.sourceSessionId,
        sourceAgentId: schema.libraryItem.sourceAgentId,
        sourceType: schema.libraryItem.source,
        contentHash: schema.libraryItem.sha256,
        status: schema.libraryItem.status,
        isFavorite: schema.libraryItem.isFavorite,
        createdAt: schema.libraryItem.createdAt,
        updatedAt: schema.libraryItem.updatedAt,
        itemMetadata: schema.libraryItem.metadata,
        chunkIndex: schema.libraryChunk.chunkIndex,
        embeddingModel: schema.libraryChunk.embeddingModel,
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
          available,
          embedding
            ? or(
                sql`${schema.libraryChunk.embedding} IS NOT NULL`,
                sql`to_tsvector('english', ${schema.libraryChunk.content}) @@ websearch_to_tsquery('english', ${query})`,
              )
            : sql`to_tsvector('english', ${schema.libraryChunk.content}) @@ websearch_to_tsquery('english', ${query})`,
        ),
      )
      .orderBy(desc(score))
      .limit(Math.min(limit * 3, 60));
    const combined = new Map<string, ReturnType<typeof compactArtifactResult>>(
      compactMetadata.map((result) => [result.itemId, result]),
    );
    for (const { itemMetadata, sourceType, ...row } of rows) {
      const candidate = compactArtifactResult(
        {
          ...row,
          source: sourceType,
          sha256: row.contentHash,
          metadata: itemMetadata,
          textPreview: row.excerpt,
        },
        'content',
        Number(row.score ?? 0),
        row.excerpt,
        {
          chunkIndex: row.chunkIndex,
          embeddingModel: row.embeddingModel,
        },
      );
      const current = combined.get(candidate.itemId);
      if (!current || candidate.score > current.score) {
        combined.set(candidate.itemId, candidate);
      }
    }
    return [...combined.values()].sort(compareArtifactResults).slice(0, limit);
  }

  private async resolveAgentLibraryContext(input: {
    agentId: string;
    sessionId?: string;
    ownerId?: string;
  }) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, input.agentId),
    });
    let ownerId = stringValue(agent?.ownerUserId);
    const suppliedOwner = stringValue(input.ownerId);
    if (!ownerId && suppliedOwner) {
      // Child-agent runs can carry the parent agent as initiator. Resolve it
      // back to the human owner before falling back to the supplied identity.
      const parent = await this.db.query.agent.findFirst({
        where: (table) => eq(table.agentId, suppliedOwner),
      });
      ownerId = stringValue(parent?.ownerUserId) ?? suppliedOwner;
    }
    if (!ownerId && input.sessionId) {
      const session = await this.db.query.session.findFirst({
        where: (table) =>
          and(
            eq(table.sessionId, input.sessionId!),
            eq(table.agentId, input.agentId),
          ),
      });
      ownerId = stringValue(session?.initiator);
    }
    ownerId ??= stringValue(agent?.owner);
    return {
      ownerId,
      workspaceId: stringValue(agent?.workspaceId),
    };
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
    if (
      !process.env.OPENAI_API_KEY ||
      process.env.ARTIFACT_EMBEDDINGS_DISABLED === 'true'
    ) {
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
    if (view === 'documents') {
      return inArray(schema.libraryItem.kind, [
        'document',
        'pdf',
        'presentation',
        'spreadsheet',
        'text',
        'code',
        'csv',
      ]);
    }
    if (view === 'media') {
      return inArray(schema.libraryItem.kind, ['audio', 'video']);
    }
    if (view === 'apps') return eq(schema.libraryItem.kind, 'app');
    if (view === 'files') {
      return sql<boolean>`${schema.libraryItem.kind} NOT IN ('image', 'app')`;
    }
    return undefined;
  }

  private linkedToScope(scopeType: 'agent' | 'session', scopeId: string) {
    return sql<boolean>`EXISTS (
      SELECT 1 FROM library_link scoped_link
      WHERE scoped_link.item_id = ${schema.libraryItem.itemId}
        AND scoped_link.scope_type = ${scopeType}
        AND scoped_link.scope_id = ${scopeId}
    )`;
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
      where: (table) => and(eq(table.itemId, itemId), isNull(table.deletedAt)),
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

type ArtifactSearchItem = {
  itemId: string;
  name: string;
  description?: string | null;
  kind: string;
  mimeType: string;
  sizeBytes?: number | null;
  source?: string | null;
  status?: string | null;
  sourceAgentId?: string | null;
  sourceSessionId?: string | null;
  sha256?: string | null;
  metadata?: Record<string, any> | null;
  textPreview?: string | null;
  isFavorite?: boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function isArtifactBrowseQuery(query: string) {
  return (
    !query ||
    /^(?:\*|all|recent|most recent|latest|files?|artifacts?|library)$/i.test(
      query,
    )
  );
}

function compactArtifactResult(
  item: ArtifactSearchItem,
  match: 'recent' | 'metadata' | 'content',
  score = 0,
  excerpt = item.textPreview ?? item.description ?? '',
  details: { chunkIndex?: number | null; embeddingModel?: string | null } = {},
) {
  const metadata = item.metadata ?? {};
  const sourceUri =
    typeof metadata.sourceUrl === 'string'
      ? metadata.sourceUrl
      : typeof metadata.url === 'string'
        ? metadata.url
        : undefined;
  return {
    itemId: item.itemId,
    fileId: item.itemId,
    name: item.name,
    kind: item.kind,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes ?? 0,
    source: item.source,
    status: item.status,
    isFavorite: Boolean(item.isFavorite),
    sourceAgentId: item.sourceAgentId,
    sourceSessionId: item.sourceSessionId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    contentHash: item.sha256 ? `sha256:${item.sha256}` : undefined,
    sourceUri,
    match,
    score: Number(score.toFixed(4)),
    excerpt: excerpt.replace(/\s+/g, ' ').trim().slice(0, 480),
    ...(match === 'content'
      ? {
          chunkIndex: details.chunkIndex,
          embeddingModel: details.embeddingModel,
        }
      : {}),
  };
}

function metadataArtifactScore(item: ArtifactSearchItem, query: string) {
  const needle = query.toLowerCase();
  const name = item.name.toLowerCase();
  if (name === needle) return 2;
  if (name.startsWith(needle)) return 1.8;
  if (name.includes(needle)) return 1.6;
  if (item.kind.toLowerCase().includes(needle)) return 1.4;
  if (item.mimeType.toLowerCase().includes(needle)) return 1.3;
  if (item.description?.toLowerCase().includes(needle)) return 1.1;
  return 0.8;
}

function compareArtifactResults(
  left: ReturnType<typeof compactArtifactResult>,
  right: ReturnType<typeof compactArtifactResult>,
) {
  if (right.score !== left.score) return right.score - left.score;
  const rightTime = right.updatedAt ? new Date(right.updatedAt).valueOf() : 0;
  const leftTime = left.updatedAt ? new Date(left.updatedAt).valueOf() : 0;
  return rightTime - leftTime;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function recordValue(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function uniqueEntities(
  runs: Array<typeof schema.provenanceRun.$inferSelect>,
  item: typeof schema.libraryItem.$inferSelect,
) {
  const entities = new Map<string, Record<string, unknown>>();
  for (const run of runs) {
    if (run.initiator) {
      entities.set(`human:${run.initiator}`, {
        id: `human:${run.initiator}`,
        role: 'human',
        name: run.initiator,
      });
    }
    if (run.agentId) {
      entities.set(`agent:${run.agentId}`, {
        id: `agent:${run.agentId}`,
        role: 'ai',
        name: run.agentId,
        provider: run.provider,
        modelId: run.modelId,
      });
    }
  }
  if (!entities.size) {
    const id = item.sourceAgentId
      ? `agent:${item.sourceAgentId}`
      : `human:${item.ownerUserId}`;
    entities.set(id, {
      id,
      role: item.sourceAgentId ? 'ai' : 'human',
      name: item.sourceAgentId ?? item.ownerUserId,
    });
  }
  return [...entities.values()];
}

function normalizeDisclosure(value: unknown) {
  const record = recordValue(value);
  return {
    artifact: record?.artifact !== false,
    provenance: record?.provenance !== false,
    events: Boolean(record?.events && record?.provenance !== false),
  };
}

function sharedItem(item: typeof schema.libraryItem.$inferSelect) {
  return {
    itemId: item.itemId,
    name: item.name,
    description: item.description,
    kind: item.kind,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function redactSharedProvenance(provenance: Record<string, any>) {
  return {
    ...provenance,
    entities: (provenance.entities ?? []).map((entity: Record<string, any>) =>
      entity.role === 'human'
        ? { id: 'human:withheld', role: 'human', name: 'Human requester' }
        : entity,
    ),
    runs: (provenance.runs ?? []).map((run: Record<string, any>) => ({
      ...run,
      initiator: undefined,
    })),
    governance: {
      ...provenance.governance,
      authorization: {
        ...provenance.governance?.authorization,
        owner: 'withheld',
        grants: undefined,
        shares: undefined,
      },
    },
    history: (provenance.history ?? []).map((event: Record<string, any>) => ({
      ...event,
      actorId:
        event.actorType === 'agent' ? event.actorId : 'identity-withheld',
    })),
    disclosure: {
      ...provenance.disclosure,
      humanIdentityIncluded: false,
    },
  };
}

function settledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildErrorMessage(error: unknown): string {
  const message = safeErrorMessage(error).replace(/\s+/g, ' ').trim();
  return message
    ? `The interactive preview could not be compiled: ${message.slice(0, 360)}`
    : 'The interactive preview could not be compiled.';
}
