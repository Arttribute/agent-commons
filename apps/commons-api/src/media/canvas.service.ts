import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { LibraryService } from '~/files';
import type { LibraryPrincipal } from '~/files/library.service';
import type { MediaPrincipal } from './media.types';

type CreateAnnotationInput = {
  revisionId: string;
  parentAnnotationId?: string;
  kind: 'comment' | 'point' | 'region' | 'time_range' | 'transcript' | 'freehand';
  body: string;
  geometry?: Record<string, unknown>;
  startMs?: number;
  endMs?: number;
  metadata?: Record<string, unknown>;
};

type TimelineClip = {
  clipId: string;
  itemId: string;
  name: string;
  startMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  durationMs: number;
};

type CanvasTimeline = {
  version: 1;
  tracks: Array<{
    trackId: string;
    kind: 'video' | 'audio';
    name: string;
    clips: TimelineClip[];
  }>;
};

type TimelineAction =
  | {
      action: 'add_clip';
      itemId: string;
      trackKind?: 'video' | 'audio';
      durationMs?: number;
    }
  | { action: 'split_clip'; clipId: string; atMs: number }
  | { action: 'delete_clip'; clipId: string };

@Injectable()
export class CanvasService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService,
  ) {}

  async openArtifact(artifactId: string, principal: MediaPrincipal) {
    const libraryPrincipal = asLibraryPrincipal(principal);
    const artifact = await this.library.get(artifactId, libraryPrincipal);
    const existingRevision = await this.db.query.canvasRevision.findFirst({
      where: (table) => eq(table.itemId, artifactId),
      orderBy: (table) => desc(table.createdAt),
    });
    if (existingRevision) {
      return this.getProject(existingRevision.projectId, principal);
    }
    const existingProject = await this.db.query.canvasProject.findFirst({
      where: (table) =>
        and(
          eq(table.rootItemId, artifactId),
          isNull(table.deletedAt),
          sql<boolean>`lower(${table.ownerUserId}) = lower(${principal.principalId})`,
        ),
    });
    if (existingProject) return this.getProject(existingProject.projectId, principal);

    const [project] = await this.db
      .insert(schema.canvasProject)
      .values({
        ownerUserId: principal.principalId,
        workspaceId: principal.workspaceId ?? null,
        name: artifact.name,
        description: artifact.description,
        rootItemId: artifactId,
        activeItemId: artifactId,
        settings: { schemaVersion: 1 },
      })
      .returning();
    await Promise.all([
      this.db.insert(schema.canvasRevision).values({
        projectId: project.projectId,
        itemId: artifactId,
        operation: 'import',
        inputs: [],
        createdByType: principal.principalType === 'agent' ? 'agent' : 'human',
        createdById: principal.principalId,
      }),
      this.db
        .insert(schema.libraryLink)
        .values({
          itemId: artifactId,
          scopeType: 'canvas_project',
          scopeId: project.projectId,
        })
        .onConflictDoNothing(),
    ]);
    return this.getProject(project.projectId, principal);
  }

  async getProject(projectId: string, principal: MediaPrincipal) {
    const project = await this.requireProject(projectId, principal, 'read');
    const [revisions, annotations, jobs, links] = await Promise.all([
      this.db.query.canvasRevision.findMany({
        where: (table) => eq(table.projectId, projectId),
        orderBy: (table) => desc(table.createdAt),
      }),
      this.db.query.canvasAnnotation.findMany({
        where: (table) =>
          and(eq(table.projectId, projectId), isNull(table.deletedAt)),
        orderBy: (table) => asc(table.createdAt),
      }),
      this.db.query.mediaGenerationJob.findMany({
        where: (table) => eq(table.projectId, projectId),
        orderBy: (table) => desc(table.createdAt),
        limit: 20,
      }),
      this.db.query.libraryLink.findMany({
        where: (table) =>
          and(
            eq(table.scopeType, 'canvas_project'),
            eq(table.scopeId, projectId),
          ),
      }),
    ]);
    const itemIds = [
      ...new Set([
        ...revisions.map((revision) => revision.itemId),
        ...links.map((link) => link.itemId),
      ]),
    ];
    const items = itemIds.length
      ? await this.db.query.libraryItem.findMany({
          where: (table) =>
            or(...itemIds.map((itemId) => eq(table.itemId, itemId))),
        })
      : [];
    const itemMap = new Map(items.map((item) => [item.itemId, item]));
    return {
      project,
      revisions: revisions.map((revision) => ({
        ...revision,
        artifact: publicArtifact(itemMap.get(revision.itemId)),
      })),
      annotations,
      jobs: jobs.map(publicJob),
      assets: links
        .map((link) => publicArtifact(itemMap.get(link.itemId)))
        .filter(Boolean),
    };
  }

  async addAsset(
    projectId: string,
    principal: MediaPrincipal,
    itemId: string,
  ) {
    await this.requireProject(projectId, principal, 'edit');
    const item = await this.library.get(itemId, asLibraryPrincipal(principal));
    await this.db
      .insert(schema.libraryLink)
      .values({ itemId, scopeType: 'canvas_project', scopeId: projectId })
      .onConflictDoNothing();
    return publicArtifact(item);
  }

  async editTimeline(
    projectId: string,
    principal: MediaPrincipal,
    input: TimelineAction,
  ) {
    const project = await this.requireProject(projectId, principal, 'edit');
    const timeline = normalizeTimeline(project.settings?.timeline);

    if (input.action === 'add_clip') {
      const item = await this.library.get(
        input.itemId,
        asLibraryPrincipal(principal),
      );
      const inferredKind = item.mimeType?.startsWith('audio/')
        ? 'audio'
        : 'video';
      const trackKind = input.trackKind ?? inferredKind;
      const track = timeline.tracks.find((entry) => entry.kind === trackKind)!;
      const startMs = track.clips.reduce(
        (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
        0,
      );
      const durationMs = Math.max(
        100,
        Math.min(86_400_000, Math.round(input.durationMs ?? 5_000)),
      );
      track.clips.push({
        clipId: randomUUID(),
        itemId: item.itemId,
        name: item.name,
        startMs,
        sourceInMs: 0,
        sourceOutMs: durationMs,
        durationMs,
      });
      await this.db
        .insert(schema.libraryLink)
        .values({
          itemId: item.itemId,
          scopeType: 'canvas_project',
          scopeId: projectId,
        })
        .onConflictDoNothing();
    } else {
      const track = timeline.tracks.find((entry) =>
        entry.clips.some((clip) => clip.clipId === input.clipId),
      );
      const clipIndex = track?.clips.findIndex(
        (clip) => clip.clipId === input.clipId,
      );
      if (!track || clipIndex === undefined || clipIndex < 0) {
        throw new NotFoundException('Timeline clip not found.');
      }
      const clip = track.clips[clipIndex];
      if (input.action === 'delete_clip') {
        track.clips.splice(clipIndex, 1);
      } else {
        const relativeMs = Math.round(input.atMs - clip.startMs);
        if (relativeMs < 100 || relativeMs > clip.durationMs - 100) {
          throw new BadRequestException(
            'Move the playhead inside the selected clip before splitting.',
          );
        }
        const secondDuration = clip.durationMs - relativeMs;
        track.clips.splice(
          clipIndex,
          1,
          {
            ...clip,
            sourceOutMs: clip.sourceInMs + relativeMs,
            durationMs: relativeMs,
          },
          {
            ...clip,
            clipId: randomUUID(),
            startMs: input.atMs,
            sourceInMs: clip.sourceInMs + relativeMs,
            durationMs: secondDuration,
          },
        );
      }
    }

    const settings = { ...(project.settings ?? {}), timeline };
    await this.db
      .update(schema.canvasProject)
      .set({ settings, updatedAt: new Date() })
      .where(eq(schema.canvasProject.projectId, projectId));
    return timeline;
  }

  async updateProject(
    projectId: string,
    principal: MediaPrincipal,
    input: { name?: string; description?: string; activeRevisionId?: string; settings?: Record<string, unknown> },
  ) {
    const project = await this.requireProject(projectId, principal, 'edit');
    let activeItemId = project.activeItemId;
    if (input.activeRevisionId) {
      const revision = await this.db.query.canvasRevision.findFirst({
        where: (table) =>
          and(
            eq(table.revisionId, input.activeRevisionId!),
            eq(table.projectId, projectId),
          ),
      });
      if (!revision) throw new BadRequestException('Revision does not belong to this project.');
      activeItemId = revision.itemId;
    }
    const [saved] = await this.db
      .update(schema.canvasProject)
      .set({
        ...(input.name !== undefined ? { name: cleanName(input.name) } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim().slice(0, 2_000) || null }
          : {}),
        ...(input.settings ? { settings: input.settings } : {}),
        activeItemId,
        updatedAt: new Date(),
      })
      .where(eq(schema.canvasProject.projectId, projectId))
      .returning();
    return saved;
  }

  async addRevision(input: {
    projectId: string;
    itemId: string;
    parentItemId?: string;
    operation: string;
    provider?: string;
    modelId?: string;
    prompt?: string;
    inputItemIds?: string[];
    settings?: Record<string, unknown>;
    traceId?: string;
    createdByType: 'human' | 'agent' | 'service';
    createdById?: string;
  }) {
    const parent = input.parentItemId
      ? await this.db.query.canvasRevision.findFirst({
          where: (table) =>
            and(
              eq(table.projectId, input.projectId),
              eq(table.itemId, input.parentItemId!),
            ),
        })
      : undefined;
    const [revision] = await this.db
      .insert(schema.canvasRevision)
      .values({
        projectId: input.projectId,
        itemId: input.itemId,
        parentRevisionId: parent?.revisionId,
        operation: input.operation,
        provider: input.provider,
        modelId: input.modelId,
        promptHash: input.prompt ? sha256(input.prompt) : undefined,
        inputs: (input.inputItemIds ?? []).map((itemId) => ({ itemId })),
        settings: input.settings ?? {},
        traceId: input.traceId,
        createdByType: input.createdByType,
        createdById: input.createdById,
      })
      .onConflictDoNothing()
      .returning();
    await Promise.all([
      this.db
        .update(schema.canvasProject)
        .set({ activeItemId: input.itemId, updatedAt: new Date() })
        .where(eq(schema.canvasProject.projectId, input.projectId)),
      this.db
        .insert(schema.libraryLink)
        .values({
          itemId: input.itemId,
          scopeType: 'canvas_project',
          scopeId: input.projectId,
        })
        .onConflictDoNothing(),
    ]);
    return revision;
  }

  async createAnnotation(
    projectId: string,
    principal: MediaPrincipal,
    input: CreateAnnotationInput,
  ) {
    await this.requireProject(projectId, principal, 'edit');
    const revision = await this.db.query.canvasRevision.findFirst({
      where: (table) =>
        and(
          eq(table.projectId, projectId),
          eq(table.revisionId, input.revisionId),
        ),
    });
    if (!revision) throw new BadRequestException('Revision does not belong to this project.');
    const body = input.body?.trim();
    if (!body) throw new BadRequestException('Annotation text is required.');
    if (body.length > 8_000) throw new BadRequestException('Annotation is too long.');
    validateAnnotation(input);
    if (input.parentAnnotationId) {
      const parent = await this.db.query.canvasAnnotation.findFirst({
        where: (table) =>
          and(
            eq(table.projectId, projectId),
            eq(table.annotationId, input.parentAnnotationId!),
          ),
      });
      if (!parent) throw new BadRequestException('Parent annotation not found.');
    }
    const [annotation] = await this.db
      .insert(schema.canvasAnnotation)
      .values({
        projectId,
        revisionId: input.revisionId,
        parentAnnotationId: input.parentAnnotationId,
        kind: input.kind,
        body,
        geometry: input.geometry,
        startMs: input.startMs,
        endMs: input.endMs,
        authorType:
          principal.actorId || principal.principalType === 'agent'
            ? 'agent'
            : 'human',
        authorId: principal.actorId ?? principal.principalId,
        metadata: input.metadata ?? {},
      })
      .returning();
    return annotation;
  }

  async updateAnnotation(
    projectId: string,
    annotationId: string,
    principal: MediaPrincipal,
    input: { body?: string; status?: 'open' | 'resolved'; deleted?: boolean },
  ) {
    await this.requireProject(projectId, principal, 'edit');
    const annotation = await this.db.query.canvasAnnotation.findFirst({
      where: (table) =>
        and(
          eq(table.projectId, projectId),
          eq(table.annotationId, annotationId),
          isNull(table.deletedAt),
        ),
    });
    if (!annotation) throw new NotFoundException('Annotation not found.');
    const [saved] = await this.db
      .update(schema.canvasAnnotation)
      .set({
        ...(input.body !== undefined
          ? { body: input.body.trim().slice(0, 8_000) }
          : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.deleted ? { deletedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.canvasAnnotation.annotationId, annotationId))
      .returning();
    return saved;
  }

  async requireProject(
    projectId: string,
    principal: MediaPrincipal,
    permission: 'read' | 'edit',
  ) {
    const project = await this.db.query.canvasProject.findFirst({
      where: (table) =>
        and(eq(table.projectId, projectId), isNull(table.deletedAt)),
    });
    if (!project) throw new NotFoundException('Canvas project not found.');
    if (same(project.ownerUserId, principal.principalId)) return project;
    if (
      project.workspaceId &&
      principal.workspaceId &&
      same(project.workspaceId, principal.workspaceId)
    ) {
      return project;
    }
    const grants = await this.db.query.libraryGrant.findMany({
      where: (table) =>
        and(
          eq(table.itemId, project.rootItemId),
          or(
            and(eq(table.subjectType, 'user'), eq(table.subjectId, principal.principalId)),
            principal.workspaceId
              ? and(
                  eq(table.subjectType, 'workspace'),
                  eq(table.subjectId, principal.workspaceId),
                )
              : undefined,
          ),
          or(isNull(table.expiresAt), sql`${table.expiresAt} > now()`),
        ),
    });
    const allowed = grants.some((grant) =>
      permission === 'read'
        ? ['read', 'edit', 'manage'].includes(grant.permission)
        : ['edit', 'manage'].includes(grant.permission),
    );
    if (!allowed) throw new ForbiddenException('You do not have access to this Canvas project.');
    return project;
  }
}

function validateAnnotation(input: CreateAnnotationInput) {
  if (input.startMs !== undefined && (!Number.isInteger(input.startMs) || input.startMs < 0)) {
    throw new BadRequestException('startMs must be a positive integer.');
  }
  if (
    input.endMs !== undefined &&
    (!Number.isInteger(input.endMs) || input.endMs < (input.startMs ?? 0))
  ) {
    throw new BadRequestException('endMs must be after startMs.');
  }
  if (input.kind === 'region' || input.kind === 'point' || input.kind === 'freehand') {
    if (!input.geometry) throw new BadRequestException('Spatial annotations require geometry.');
    walkNumbers(input.geometry, (value) => {
      if (value < 0 || value > 1) {
        throw new BadRequestException('Annotation coordinates must be normalized from 0 to 1.');
      }
    });
  }
}

function normalizeTimeline(value: unknown): CanvasTimeline {
  const input = value as Partial<CanvasTimeline> | null;
  const tracks = Array.isArray(input?.tracks) ? input.tracks : [];
  return {
    version: 1,
    tracks: (['video', 'audio'] as const).map((kind) => {
      const existing = tracks.find((track) => track?.kind === kind);
      return {
        trackId: existing?.trackId || kind,
        kind,
        name: existing?.name || (kind === 'video' ? 'Video' : 'Audio'),
        clips: Array.isArray(existing?.clips) ? existing.clips : [],
      };
    }),
  };
}

function walkNumbers(value: unknown, visit: (number: number) => void) {
  if (typeof value === 'number') return visit(value);
  if (Array.isArray(value)) return value.forEach((child) => walkNumbers(child, visit));
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((child) =>
      walkNumbers(child, visit),
    );
  }
}

function publicArtifact(
  item?: Pick<
    typeof schema.libraryItem.$inferSelect,
    | 'itemId'
    | 'name'
    | 'description'
    | 'kind'
    | 'mimeType'
    | 'sizeBytes'
    | 'source'
    | 'status'
    | 'metadata'
    | 'createdAt'
  >,
) {
  if (!item) return undefined;
  return {
    itemId: item.itemId,
    name: item.name,
    description: item.description,
    kind: item.kind,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    source: item.source,
    status: item.status,
    metadata: item.metadata,
    createdAt: item.createdAt,
  };
}

function publicJob(job: typeof schema.mediaGenerationJob.$inferSelect) {
  const { prompt: _prompt, request: _request, ...safe } = job;
  return safe;
}

function asLibraryPrincipal(principal: MediaPrincipal): LibraryPrincipal {
  return {
    principalId: principal.principalId,
    principalType: principal.principalType,
    workspaceId: principal.workspaceId,
  };
}

function sha256(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function cleanName(value: string) {
  const name = value.trim().slice(0, 160);
  if (!name) throw new BadRequestException('Project name is required.');
  return name;
}

function same(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}
