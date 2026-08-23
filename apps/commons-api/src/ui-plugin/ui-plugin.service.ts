import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { verificationCoversManifest } from './ui-plugin.policy';

export type UiPluginPermission = 'theme.read' | 'navigation' | 'storage';
export type UiPluginCapabilityName =
  | 'agents.read'
  | 'tasks.read'
  | 'tasks.write'
  | 'workflows.read'
  | 'workflows.execute'
  | 'library.read'
  | 'tools.read'
  | 'copilot.prompt';
export type UiPluginCapabilityGrant = {
  name: UiPluginCapabilityName;
  resourceIds?: string[];
};
export type UiPluginSurface = {
  type: 'page' | 'widget';
  title?: string;
  width?: number;
  height?: number;
};

export type UiPluginManifestInput = {
  schemaVersion?: '1' | '2';
  surfaces: UiPluginSurface[];
  permissions?: UiPluginPermission[];
  capabilities?: UiPluginCapabilityGrant[];
  networkAccess?: { allowedDomains?: string[] };
};

export type CreateUiPluginInput = {
  name: string;
  slug?: string;
  description?: string;
  version?: string;
  codeProjectId: string;
  manifest: UiPluginManifestInput;
};

const PERMISSIONS = new Set<UiPluginPermission>([
  'theme.read',
  'navigation',
  'storage',
]);
const CAPABILITIES = new Set<UiPluginCapabilityName>([
  'agents.read',
  'tasks.read',
  'tasks.write',
  'workflows.read',
  'workflows.execute',
  'library.read',
  'tools.read',
  'copilot.prompt',
]);

@Injectable()
export class UiPluginService {
  constructor(private readonly db: DatabaseService) {}

  async list(ownerId: string, options: { activeOnly?: boolean } = {}) {
    const ownerCondition = sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`;
    const plugins = await this.db
      .select()
      .from(schema.uiPlugin)
      .where(
        options.activeOnly
          ? and(ownerCondition, eq(schema.uiPlugin.status, 'active'))
          : ownerCondition,
      )
      .orderBy(desc(schema.uiPlugin.updatedAt));
    return plugins.map(toPublicPlugin);
  }

  async getById(
    ownerId: string,
    pluginId: string,
    options: { activeOnly?: boolean } = {},
  ) {
    const plugin = await this.db.query.uiPlugin.findFirst({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerId})`,
          eq(table.pluginId, pluginId),
          ...(options.activeOnly ? [eq(table.status, 'active')] : []),
        ),
    });
    if (!plugin) throw new NotFoundException('UI plugin not found');
    return toPublicPlugin(plugin);
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
    return toPublicPlugin(plugin);
  }

  async create(
    ownerId: string,
    workspaceId: string | null | undefined,
    input: CreateUiPluginInput,
    options: { createdByAgentId?: string; status?: 'draft' | 'active' } = {},
  ) {
    const manifest = normalizeManifest(input.manifest);
    const project = await this.assertPublishedProject(
      ownerId,
      input.codeProjectId,
      manifest,
    );
    const name = input.name?.trim().slice(0, 100);
    if (!name) throw new BadRequestException('Plugin name is required');
    const slug = slugify(input.slug || name);
    if (!slug) throw new BadRequestException('Plugin slug is required');
    const values = {
      ownerUserId: ownerId,
      workspaceId: workspaceId ?? project.workspaceId,
      createdByAgentId: options.createdByAgentId ?? null,
      codeProjectId: project.projectId,
      deploymentId: project.deploymentId,
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
    return toPublicPlugin(plugin);
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
    return this.db.transaction(async (tx) => {
      const ownerCondition = sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`;
      const [snapshot] = await tx
        .select()
        .from(schema.uiPlugin)
        .where(and(eq(schema.uiPlugin.pluginId, pluginId), ownerCondition))
        .limit(1);
      if (!snapshot) throw new NotFoundException('UI plugin not found');

      let canonicalEntryUrl: string | undefined;
      if (status === 'active') {
        if (!snapshot.deploymentId) {
          throw new BadRequestException(
            'Republish, test, and register this legacy app before enabling it',
          );
        }

        // Deployment verification and plugin activation share this row lock.
        // Verification commits its result and any required plugin revocations
        // while holding the same lock, so an activation cannot land after a
        // failed re-verification scan.
        const [deployment] = await tx
          .select()
          .from(schema.codeProjectDeployment)
          .where(
            and(
              eq(
                schema.codeProjectDeployment.deploymentId,
                snapshot.deploymentId,
              ),
              eq(
                schema.codeProjectDeployment.projectId,
                snapshot.codeProjectId,
              ),
            ),
          )
          .limit(1)
          .for('update');

        const [lockedPlugin] = await tx
          .select()
          .from(schema.uiPlugin)
          .where(pluginSnapshotCondition(snapshot, ownerId))
          .limit(1)
          .for('update');
        if (!lockedPlugin) {
          throw new ConflictException(
            'The UI plugin changed while it was being enabled; review it and retry',
          );
        }
        canonicalEntryUrl = assertCanActivate(lockedPlugin, deployment);
      } else {
        const [lockedPlugin] = await tx
          .select()
          .from(schema.uiPlugin)
          .where(pluginSnapshotCondition(snapshot, ownerId))
          .limit(1)
          .for('update');
        if (!lockedPlugin) {
          throw new ConflictException(
            'The UI plugin changed while its status was being updated; retry',
          );
        }
      }

      const [plugin] = await tx
        .update(schema.uiPlugin)
        .set({
          status,
          ...(canonicalEntryUrl ? { entryUrl: canonicalEntryUrl } : {}),
          updatedAt: new Date(),
        })
        .where(pluginSnapshotCondition(snapshot, ownerId))
        .returning();
      if (!plugin) {
        throw new ConflictException(
          'The UI plugin changed while its status was being updated; retry',
        );
      }
      return toPublicPlugin(plugin);
    });
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

  private async assertPublishedProject(
    ownerId: string,
    projectId: string,
    manifest: ReturnType<typeof normalizeManifest>,
  ) {
    const [row] = await this.db
      .select({
        projectId: schema.codeProject.projectId,
        workspaceId: schema.codeProject.workspaceId,
        deploymentId: schema.codeProjectDeployment.deploymentId,
        publicUrl: schema.codeProjectDeployment.publicUrl,
        deploymentStatus: schema.codeProjectDeployment.status,
        verification: schema.codeProjectDeployment.verification,
      })
      .from(schema.codeProject)
      .leftJoin(
        schema.codeProjectDeployment,
        and(
          eq(
            schema.codeProjectDeployment.deploymentId,
            schema.codeProject.latestDeploymentId,
          ),
          eq(
            schema.codeProjectDeployment.projectId,
            schema.codeProject.projectId,
          ),
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
    if (
      row.deploymentStatus !== 'ready' ||
      !row.deploymentId ||
      !row.publicUrl
    ) {
      throw new BadRequestException(
        'Publish and verify the code project before registering it as UI',
      );
    }
    if (row.verification?.passed !== true) {
      throw new BadRequestException(
        'The latest deployment must pass testCodeProject before it can be registered as UI',
      );
    }
    if (
      row.verification?.schemaVersion !== 2 ||
      !verificationCoversManifest(row.verification, manifest)
    ) {
      throw new BadRequestException(
        'Run testCodeProject for every requested page/widget surface and capability before registering this UI',
      );
    }
    return {
      ...row,
      deploymentId: row.deploymentId,
      publicUrl: immutableDeploymentUrl(row.publicUrl, row.deploymentId),
    } as typeof row & { deploymentId: string; publicUrl: string };
  }
}

function assertCanActivate(
  plugin: typeof schema.uiPlugin.$inferSelect,
  deployment: typeof schema.codeProjectDeployment.$inferSelect | undefined,
) {
  if (!plugin.deploymentId) {
    throw new BadRequestException(
      'Republish, test, and register this legacy app before enabling it',
    );
  }
  const deploymentId = plugin.deploymentId;
  if (
    !deployment ||
    deployment.status !== 'ready' ||
    deployment.projectId !== plugin.codeProjectId ||
    !deployment.publicUrl ||
    deployment.verification?.passed !== true
  ) {
    throw new BadRequestException(
      'This exact app deployment must pass testCodeProject before it can be enabled',
    );
  }
  if (
    deployment.verification?.schemaVersion !== 2 ||
    !verificationCoversManifest(deployment.verification, plugin.manifest)
  ) {
    throw new BadRequestException(
      'The verified deployment does not cover every requested UI surface and capability',
    );
  }
  const expected = immutableDeploymentUrl(deployment.publicUrl, deploymentId);
  const recorded = immutableDeploymentUrl(plugin.entryUrl, plugin.deploymentId);
  if (expected !== recorded) {
    throw new BadRequestException(
      'The app entry URL does not match its pinned deployment',
    );
  }
  return expected;
}

function pluginSnapshotCondition(
  plugin: typeof schema.uiPlugin.$inferSelect,
  ownerId: string,
) {
  return and(
    eq(schema.uiPlugin.pluginId, plugin.pluginId),
    sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`,
    eq(schema.uiPlugin.codeProjectId, plugin.codeProjectId),
    plugin.deploymentId
      ? eq(schema.uiPlugin.deploymentId, plugin.deploymentId)
      : sql<boolean>`${schema.uiPlugin.deploymentId} IS NULL`,
    eq(schema.uiPlugin.entryUrl, plugin.entryUrl),
    eq(schema.uiPlugin.manifest, plugin.manifest),
    eq(schema.uiPlugin.status, plugin.status),
    eq(schema.uiPlugin.updatedAt, plugin.updatedAt),
  );
}

function normalizeManifest(input: UiPluginManifestInput) {
  if (input?.schemaVersion && !['1', '2'].includes(input.schemaVersion)) {
    throw new BadRequestException('Unsupported UI manifest schema version');
  }
  if (!input || !Array.isArray(input.surfaces) || !input.surfaces.length) {
    throw new BadRequestException('At least one UI surface is required');
  }
  if (input.surfaces.length > 2) {
    throw new BadRequestException('A plugin supports at most two surfaces');
  }
  const seen = new Set<string>();
  const surfaces = input.surfaces.map((surface) => {
    if (!surface || typeof surface !== 'object') {
      throw new BadRequestException('Every UI surface must be an object');
    }
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
  if (input.permissions !== undefined && !Array.isArray(input.permissions)) {
    throw new BadRequestException('UI permissions must be an array');
  }
  const permissions = [...new Set(input.permissions ?? [])];
  for (const permission of permissions) {
    if (!PERMISSIONS.has(permission)) {
      throw new BadRequestException(`Unsupported UI permission ${permission}`);
    }
  }
  if (input.capabilities !== undefined && !Array.isArray(input.capabilities)) {
    throw new BadRequestException('UI capabilities must be an array');
  }
  const capabilities = (input.capabilities ?? []).map((grant) => {
    if (!grant || typeof grant !== 'object' || typeof grant.name !== 'string') {
      throw new BadRequestException('Every UI capability must be an object');
    }
    if (!CAPABILITIES.has(grant.name)) {
      throw new BadRequestException(`Unsupported UI capability ${grant.name}`);
    }
    const resourceIds = [
      ...new Set(
        (grant.resourceIds ?? [])
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    ];
    if (resourceIds.length > 100 || resourceIds.some((id) => id.length > 200)) {
      throw new BadRequestException(
        `Capability ${grant.name} contains too many or invalid resource IDs`,
      );
    }
    return {
      name: grant.name,
      ...(resourceIds.length ? { resourceIds } : {}),
    };
  });
  if (
    new Set(capabilities.map((grant) => grant.name)).size !==
    capabilities.length
  ) {
    throw new BadRequestException('UI capabilities must be unique');
  }
  const allowedDomains = [
    ...new Set(
      (input.networkAccess?.allowedDomains ?? [])
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (allowedDomains.length) {
    throw new BadRequestException(
      'Direct plugin network access is disabled; use declared Commons capabilities and connected tools',
    );
  }
  // Every new registration uses the isolated host/bridge contract. Schema v1
  // remains readable only so rollout-safe legacy rows can be quarantined or
  // republished without making the migration destructive.
  const schemaVersion = '2' as const;
  return {
    schemaVersion,
    surfaces,
    permissions,
    ...(schemaVersion === '2'
      ? {
          capabilities,
          networkAccess: { allowedDomains: [] },
        }
      : {}),
  };
}

function toPublicPlugin<T extends typeof schema.uiPlugin.$inferSelect>(
  plugin: T,
) {
  if (!plugin.deploymentId) return plugin;
  try {
    return {
      ...plugin,
      entryUrl: immutableDeploymentUrl(plugin.entryUrl, plugin.deploymentId),
    };
  } catch {
    return plugin;
  }
}

function immutableDeploymentUrl(publicUrl: string, deploymentId: string) {
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    throw new BadRequestException('The pinned deployment URL is invalid');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new BadRequestException('The pinned deployment URL is invalid');
  }
  const marker = '/deployments/';
  const markerIndex = url.pathname.indexOf(marker);
  const basePath =
    markerIndex >= 0
      ? url.pathname.slice(0, markerIndex + 1)
      : `${url.pathname.replace(/\/+$/, '')}/`;
  url.pathname = `${basePath}deployments/${encodeURIComponent(deploymentId)}/`;
  url.search = '';
  url.hash = '';
  return url.toString();
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
