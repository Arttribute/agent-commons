import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';

export type UiPluginPermission = 'theme.read' | 'navigation';
export type UiPluginSurface = {
  type: 'page' | 'widget';
  title?: string;
  width?: number;
  height?: number;
};

export type UiPluginManifestInput = {
  schemaVersion?: '1';
  surfaces: UiPluginSurface[];
  permissions?: UiPluginPermission[];
};

export type CreateUiPluginInput = {
  name: string;
  slug?: string;
  description?: string;
  version?: string;
  codeProjectId: string;
  manifest: UiPluginManifestInput;
};

const PERMISSIONS = new Set<UiPluginPermission>(['theme.read', 'navigation']);

@Injectable()
export class UiPluginService {
  constructor(private readonly db: DatabaseService) {}

  async list(ownerId: string, options: { activeOnly?: boolean } = {}) {
    const ownerCondition = sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`;
    return this.db
      .select()
      .from(schema.uiPlugin)
      .where(
        options.activeOnly
          ? and(ownerCondition, eq(schema.uiPlugin.status, 'active'))
          : ownerCondition,
      )
      .orderBy(desc(schema.uiPlugin.updatedAt));
  }

  async getBySlug(ownerId: string, slug: string) {
    const plugin = await this.db.query.uiPlugin.findFirst({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerId})`,
          eq(table.slug, slug),
        ),
    });
    if (!plugin) throw new NotFoundException('UI plugin not found');
    return plugin;
  }

  async create(
    ownerId: string,
    workspaceId: string | null | undefined,
    input: CreateUiPluginInput,
    options: { createdByAgentId?: string; status?: 'draft' | 'active' } = {},
  ) {
    const project = await this.assertPublishedProject(
      ownerId,
      input.codeProjectId,
    );
    const manifest = normalizeManifest(input.manifest);
    const name = input.name?.trim().slice(0, 100);
    if (!name) throw new BadRequestException('Plugin name is required');
    const slug = slugify(input.slug || name);
    if (!slug) throw new BadRequestException('Plugin slug is required');
    const values = {
      ownerUserId: ownerId,
      workspaceId: workspaceId ?? project.workspaceId,
      createdByAgentId: options.createdByAgentId ?? null,
      codeProjectId: project.projectId,
      name,
      slug,
      description: input.description?.trim().slice(0, 1_000) || null,
      version: normalizeVersion(input.version),
      entryUrl: project.publicUrl,
      manifest,
      status: options.status ?? ('draft' as const),
      updatedAt: new Date(),
    };
    const [plugin] = await this.db
      .insert(schema.uiPlugin)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.uiPlugin.ownerUserId, schema.uiPlugin.slug],
        set: values,
      })
      .returning();
    return plugin;
  }

  async createForAgent(agentId: string, input: CreateUiPluginInput) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
      columns: {
        ownerUserId: true,
        owner: true,
        workspaceId: true,
      },
    });
    const ownerId = agent?.ownerUserId ?? agent?.owner;
    if (!agent || !ownerId)
      throw new ForbiddenException('Agent owner is required');
    return this.create(ownerId, agent.workspaceId, input, {
      createdByAgentId: agentId,
      status: 'draft',
    });
  }

  async setStatus(
    ownerId: string,
    pluginId: string,
    status: 'draft' | 'active' | 'disabled',
  ) {
    if (!['draft', 'active', 'disabled'].includes(status)) {
      throw new BadRequestException('Invalid UI plugin status');
    }
    const [plugin] = await this.db
      .update(schema.uiPlugin)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.uiPlugin.pluginId, pluginId),
          sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`,
        ),
      )
      .returning();
    if (!plugin) throw new NotFoundException('UI plugin not found');
    return plugin;
  }

  async remove(ownerId: string, pluginId: string) {
    const removed = await this.db
      .delete(schema.uiPlugin)
      .where(
        and(
          eq(schema.uiPlugin.pluginId, pluginId),
          sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`,
        ),
      )
      .returning({ pluginId: schema.uiPlugin.pluginId });
    if (!removed.length) throw new NotFoundException('UI plugin not found');
    return { deleted: true };
  }

  private async assertPublishedProject(ownerId: string, projectId: string) {
    const [row] = await this.db
      .select({
        projectId: schema.codeProject.projectId,
        workspaceId: schema.codeProject.workspaceId,
        publicUrl: schema.codeProjectDeployment.publicUrl,
        deploymentStatus: schema.codeProjectDeployment.status,
      })
      .from(schema.codeProject)
      .leftJoin(
        schema.codeProjectDeployment,
        eq(
          schema.codeProjectDeployment.deploymentId,
          schema.codeProject.latestDeploymentId,
        ),
      )
      .where(
        and(
          eq(schema.codeProject.projectId, projectId),
          sql<boolean>`lower(${schema.codeProject.ownerUserId}) = lower(${ownerId})`,
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('Code project not found');
    if (row.deploymentStatus !== 'ready' || !row.publicUrl) {
      throw new BadRequestException(
        'Publish and verify the code project before registering it as UI',
      );
    }
    return { ...row, publicUrl: row.publicUrl };
  }
}

function normalizeManifest(input: UiPluginManifestInput) {
  if (!input || !Array.isArray(input.surfaces) || !input.surfaces.length) {
    throw new BadRequestException('At least one UI surface is required');
  }
  if (input.surfaces.length > 2) {
    throw new BadRequestException('A plugin supports at most two surfaces');
  }
  const seen = new Set<string>();
  const surfaces = input.surfaces.map((surface) => {
    if (!['page', 'widget'].includes(surface.type) || seen.has(surface.type)) {
      throw new BadRequestException(
        'Surfaces must be unique page or widget entries',
      );
    }
    seen.add(surface.type);
    return {
      type: surface.type,
      title: surface.title?.trim().slice(0, 80) || undefined,
      ...(surface.type === 'widget'
        ? {
            width: clamp(surface.width, 280, 520, 380),
            height: clamp(surface.height, 240, 720, 480),
          }
        : {}),
    };
  });
  const permissions = [...new Set(input.permissions ?? [])];
  for (const permission of permissions) {
    if (!PERMISSIONS.has(permission)) {
      throw new BadRequestException(`Unsupported UI permission ${permission}`);
    }
  }
  return { schemaVersion: '1' as const, surfaces, permissions };
}

function clamp(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value as number)));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeVersion(value?: string) {
  const version = (value || '1.0.0').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new BadRequestException(
      'Plugin version must use semantic versioning',
    );
  }
  return version;
}
