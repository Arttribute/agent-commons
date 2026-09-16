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
import {
  effectiveGrants,
  isUiPluginCapabilityName,
  type UiPluginApproval,
  type UiPluginCapabilityName,
  type UiPluginGrants,
} from './ui-plugin.capabilities';

export type UiPluginPermission = 'theme.read' | 'navigation' | 'storage';
export type { UiPluginCapabilityName };
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

export type UiPluginConnectionInput = {
  key: string;
  name: string;
  description?: string;
  baseUrl: string;
  auth?: {
    type?: 'none' | 'bearer' | 'header' | 'query' | 'basic';
    name?: string;
  };
  methods?: string[];
  pathPrefixes?: string[];
};

export type UiPluginCollectionInput = {
  name: string;
  description?: string;
  fields?: Record<string, { type: string; required?: boolean }>;
};

export type UiPluginManifestInput = {
  schemaVersion?: '1' | '2';
  surfaces: UiPluginSurface[];
  permissions?: UiPluginPermission[];
  capabilities?: UiPluginCapabilityGrant[];
  networkAccess?: { allowedDomains?: string[] };
  /** Project file path of an SVG icon, e.g. `icon.svg`. */
  icon?: string;
  category?: string;
  chat?: { when?: string; inputDescription?: string };
  connections?: UiPluginConnectionInput[];
  data?: { collections?: UiPluginCollectionInput[] };
};

export type CreateUiPluginInput = {
  name: string;
  slug?: string;
  description?: string;
  version?: string;
  codeProjectId: string;
  manifest: UiPluginManifestInput;
};

export type UpdateUiPluginGrantsInput = {
  capabilities?: Array<{
    name: string;
    enabled?: boolean;
    resourceIds?: string[];
    approval?: UiPluginApproval;
  }>;
  agentDataAccess?: UiPluginGrants['agentDataAccess'];
  chatEnabled?: boolean;
};

export const MAX_PINNED_APPS = 6;

const PERMISSIONS = new Set<UiPluginPermission>([
  'theme.read',
  'navigation',
  'storage',
]);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const FIELD_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array']);
const RESERVED_HEADER_NAMES = new Set([
  'host',
  'cookie',
  'content-length',
  'connection',
  'transfer-encoding',
  'x-forwarded-for',
]);
const MAX_ICON_BYTES = 96_000;

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
    const iconUrl = manifest.icon
      ? await this.resolveProjectIcon(project.projectId, manifest.icon)
      : undefined;
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
      // A republish without an icon keeps an icon the owner uploaded.
      ...(iconUrl ? { iconUrl } : {}),
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
    grantsInput?: UpdateUiPluginGrantsInput,
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
          // Enabling an app is the moment its owner reviews what it may do.
          ...(status === 'active' && grantsInput
            ? { grants: normalizeGrants(snapshot, grantsInput) }
            : {}),
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

  async updateGrants(
    ownerId: string,
    pluginId: string,
    input: UpdateUiPluginGrantsInput,
  ) {
    const plugin = await this.findOwned(ownerId, pluginId);
    const grants = normalizeGrants(plugin, input);
    const [updated] = await this.db
      .update(schema.uiPlugin)
      .set({ grants, updatedAt: new Date() })
      .where(ownedPluginCondition(ownerId, pluginId))
      .returning();
    return toPublicPlugin(updated);
  }

  async updateAppearance(
    ownerId: string,
    pluginId: string,
    input: { iconUrl?: string | null },
  ) {
    const plugin = await this.findOwned(ownerId, pluginId);
    let iconUrl: string | null;
    if (input.iconUrl === null || input.iconUrl === '') {
      // Reset to the icon the app ships with, if any.
      iconUrl = plugin.manifest.icon
        ? await this.resolveProjectIcon(
            plugin.codeProjectId,
            plugin.manifest.icon,
          ).catch(() => null)
        : null;
    } else {
      iconUrl = normalizeUploadedIcon(input.iconUrl);
    }
    const [updated] = await this.db
      .update(schema.uiPlugin)
      .set({ iconUrl, updatedAt: new Date() })
      .where(ownedPluginCondition(ownerId, pluginId))
      .returning();
    return toPublicPlugin(updated);
  }

  /** Active apps with the effective grant set, for gateways and agents. */
  async getActiveForOwner(ownerId: string, pluginId: string) {
    const plugin = await this.db.query.uiPlugin.findFirst({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerId})`,
          eq(table.pluginId, pluginId),
          eq(table.status, 'active'),
        ),
    });
    if (!plugin) throw new ForbiddenException('This app is not enabled');
    return toPublicPlugin(plugin);
  }

  async ownerForAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
      columns: { ownerUserId: true, owner: true },
    });
    const ownerId = agent?.ownerUserId ?? agent?.owner;
    if (!ownerId) throw new ForbiddenException('Agent owner is required');
    return ownerId;
  }

  /** Enabled apps an agent may know about, with chat guidance. */
  async listActiveForAgent(agentId: string) {
    const ownerId = await this.ownerForAgent(agentId);
    return (await this.list(ownerId, { activeOnly: true })).map((plugin) =>
      agentView(plugin),
    );
  }

  async resolveActiveForAgent(agentId: string, app: string) {
    const ownerId = await this.ownerForAgent(agentId);
    const reference = String(app ?? '').trim();
    if (!reference) throw new BadRequestException('app is required');
    const plugins = await this.list(ownerId, { activeOnly: true });
    const plugin = plugins.find(
      (candidate) =>
        candidate.pluginId === reference ||
        candidate.slug === reference.toLowerCase(),
    );
    if (!plugin) {
      throw new NotFoundException(
        `No enabled Commons app matches "${reference}". Call listCommonsApps first.`,
      );
    }
    return { ownerId, plugin };
  }

  /**
   * Compact system-prompt block that tells an agent which apps exist and
   * when to bring one into the conversation.
   */
  async buildAgentPromptBlock(agentId: string) {
    const apps = await this.listActiveForAgent(agentId).catch(() => []);
    if (!apps.length) return '';
    const lines = apps.slice(0, 20).map((app) => {
      const parts = [`- **${app.name}** (app: \`${app.slug}\`)`];
      if (app.description) parts.push(`— ${app.description.slice(0, 160)}`);
      if (app.chat.available) {
        parts.push(`\n  Show in chat when: ${app.chat.when}`);
        if (app.chat.inputDescription) {
          parts.push(`\n  Input: ${app.chat.inputDescription}`);
        }
      }
      if (app.agentDataAccess !== 'none') {
        parts.push(
          `\n  Data: ${app.agentDataAccess === 'read' ? 'read' : 'read and write'} via queryCommonsAppData${app.agentDataAccess === 'readwrite' ? '/writeCommonsAppData' : ''}`,
        );
      }
      return parts.join(' ');
    });
    return `\n\n### Commons apps\nThe user has enabled these custom apps. Use **showCommonsApp** to place an app in this chat only when its guidance matches the moment, such as when the user needs to make a decision or enter structured input the app handles well. Pass a short reason and the input it expects. Do not show the same app repeatedly; wait for the user's response from the app before continuing.\n${lines.join('\n')}`;
  }

  async getLayout(ownerId: string) {
    const rows = await this.db
      .select()
      .from(schema.uiPluginLayout)
      .where(
        sql<boolean>`lower(${schema.uiPluginLayout.ownerUserId}) = lower(${ownerId})`,
      );
    return Object.fromEntries(
      rows.map((row) => [row.scope, row.pluginIds ?? []]),
    ) as Record<string, string[]>;
  }

  async setLayout(ownerId: string, scope: string, pluginIds: unknown) {
    const normalizedScope = normalizeLayoutScope(scope);
    if (!Array.isArray(pluginIds)) {
      throw new BadRequestException('pluginIds must be an array');
    }
    const ids = [
      ...new Set(
        pluginIds.filter(
          (id): id is string => typeof id === 'string' && id.length <= 64,
        ),
      ),
    ];
    if (ids.length > MAX_PINNED_APPS) {
      throw new BadRequestException(
        `You can pin up to ${MAX_PINNED_APPS} apps`,
      );
    }
    const owned = new Set(
      (await this.list(ownerId)).map((plugin) => plugin.pluginId),
    );
    const valid = ids.filter((id) => owned.has(id));
    await this.db
      .insert(schema.uiPluginLayout)
      .values({
        ownerUserId: ownerId,
        scope: normalizedScope,
        pluginIds: valid,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          schema.uiPluginLayout.ownerUserId,
          schema.uiPluginLayout.scope,
        ],
        set: { pluginIds: valid, updatedAt: new Date() },
      });
    return this.getLayout(ownerId);
  }

  async resetLayout(ownerId: string, scope: string) {
    const normalizedScope = normalizeLayoutScope(scope);
    if (normalizedScope === 'global') {
      throw new BadRequestException('The global layout cannot be removed');
    }
    await this.db
      .delete(schema.uiPluginLayout)
      .where(
        and(
          sql<boolean>`lower(${schema.uiPluginLayout.ownerUserId}) = lower(${ownerId})`,
          eq(schema.uiPluginLayout.scope, normalizedScope),
        ),
      );
    return this.getLayout(ownerId);
  }

  async findOwned(ownerId: string, pluginId: string) {
    const plugin = await this.db.query.uiPlugin.findFirst({
      where: (table) =>
        and(
          sql<boolean>`lower(${table.ownerUserId}) = lower(${ownerId})`,
          eq(table.pluginId, pluginId),
        ),
    });
    if (!plugin) throw new NotFoundException('UI plugin not found');
    return plugin;
  }

  /**
   * App icons ship as an SVG file in the code project. They are validated and
   * stored as a data URL so the Commons UI never loads remote icon content.
   */
  private async resolveProjectIcon(projectId: string, iconPath: string) {
    const file = await this.db.query.codeProjectFile.findFirst({
      where: (table) =>
        and(eq(table.projectId, projectId), eq(table.path, iconPath)),
    });
    if (!file) {
      throw new BadRequestException(
        `Icon file ${iconPath} was not found in the code project`,
      );
    }
    return svgDataUrl(file.content);
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
    if (!isUiPluginCapabilityName(grant.name)) {
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
  const requested = new Set(capabilities.map((grant) => grant.name));
  const connections = normalizeConnections(input.connections);
  if (connections.length && !requested.has('network.request')) {
    throw new BadRequestException(
      'Apps that declare connections must request the network.request capability',
    );
  }
  if (requested.has('network.request') && !connections.length) {
    throw new BadRequestException(
      'network.request requires at least one declared connection',
    );
  }
  const collections = normalizeCollections(input.data?.collections);
  const chat = normalizeChat(input.chat, surfaces);
  const icon = normalizeIconPath(input.icon);
  const category = input.category?.trim().slice(0, 40) || undefined;
  return {
    schemaVersion,
    surfaces,
    permissions,
    capabilities,
    networkAccess: { allowedDomains: [] },
    ...(icon ? { icon } : {}),
    ...(category ? { category } : {}),
    ...(chat ? { chat } : {}),
    ...(connections.length ? { connections } : {}),
    ...(collections.length ? { data: { collections } } : {}),
  };
}

function normalizeConnections(input: UiPluginConnectionInput[] | undefined) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 10) {
    throw new BadRequestException('connections must be an array of up to 10');
  }
  const keys = new Set<string>();
  return input.map((connection) => {
    const key = String(connection?.key ?? '').trim();
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(key) || keys.has(key)) {
      throw new BadRequestException(
        'Connection keys must be unique lowercase identifiers',
      );
    }
    keys.add(key);
    const name = String(connection.name ?? '')
      .trim()
      .slice(0, 80);
    if (!name) throw new BadRequestException(`Connection ${key} needs a name`);
    const baseUrl = normalizeConnectionBaseUrl(connection.baseUrl, key);
    const authType = connection.auth?.type ?? 'none';
    if (!['none', 'bearer', 'header', 'query', 'basic'].includes(authType)) {
      throw new BadRequestException(
        `Connection ${key} has an invalid auth type`,
      );
    }
    let authName: string | undefined;
    if (authType === 'header' || authType === 'query') {
      authName = String(connection.auth?.name ?? '').trim();
      if (
        !/^[A-Za-z0-9_-]{1,64}$/.test(authName) ||
        RESERVED_HEADER_NAMES.has(authName.toLowerCase())
      ) {
        throw new BadRequestException(
          `Connection ${key} needs a valid ${authType} name for its key`,
        );
      }
    }
    const methods = [
      ...new Set(
        (connection.methods?.length ? connection.methods : ['GET']).map(
          (method) => String(method).toUpperCase(),
        ),
      ),
    ];
    if (methods.some((method) => !HTTP_METHODS.has(method))) {
      throw new BadRequestException(`Connection ${key} has an invalid method`);
    }
    const pathPrefixes = [
      ...new Set(
        (connection.pathPrefixes?.length ? connection.pathPrefixes : ['/']).map(
          (prefix) => String(prefix).trim(),
        ),
      ),
    ].slice(0, 20);
    if (
      pathPrefixes.some(
        (prefix) =>
          !prefix.startsWith('/') ||
          prefix.includes('..') ||
          prefix.includes('\\') ||
          prefix.length > 200,
      )
    ) {
      throw new BadRequestException(
        `Connection ${key} path prefixes must start with / and stay within the base URL`,
      );
    }
    return {
      key,
      name,
      ...(connection.description?.trim()
        ? { description: connection.description.trim().slice(0, 300) }
        : {}),
      baseUrl,
      auth: {
        type: authType as 'none' | 'bearer' | 'header' | 'query' | 'basic',
        ...(authName ? { name: authName } : {}),
      },
      methods,
      pathPrefixes,
    };
  });
}

function normalizeConnectionBaseUrl(value: unknown, key: string) {
  let url: URL;
  try {
    url = new URL(String(value ?? ''));
  } catch {
    throw new BadRequestException(`Connection ${key} needs a valid baseUrl`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    isLiteralPrivateHost(url.hostname)
  ) {
    throw new BadRequestException(
      `Connection ${key} must use a public https baseUrl without credentials or query`,
    );
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** Cheap literal checks at registration. The proxy re-checks resolved DNS. */
export function isLiteralPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return true;
  return false;
}

function normalizeCollections(input: UiPluginCollectionInput[] | undefined) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 20) {
    throw new BadRequestException(
      'data.collections must be an array of up to 20',
    );
  }
  const names = new Set<string>();
  return input.map((collection) => {
    const name = String(collection?.name ?? '').trim();
    if (!isCollectionName(name) || names.has(name)) {
      throw new BadRequestException(
        'Collection names must be unique lowercase identifiers',
      );
    }
    names.add(name);
    const entries = Object.entries(collection.fields ?? {});
    if (entries.length > 50) {
      throw new BadRequestException(`Collection ${name} has too many fields`);
    }
    const fields = Object.fromEntries(
      entries.map(([field, definition]) => {
        if (!isFieldName(field) || !FIELD_TYPES.has(definition?.type)) {
          throw new BadRequestException(
            `Collection ${name} field ${field} is invalid`,
          );
        }
        return [
          field,
          {
            type: definition.type as
              | 'string'
              | 'number'
              | 'boolean'
              | 'object'
              | 'array',
            ...(definition.required ? { required: true } : {}),
          },
        ];
      }),
    );
    return {
      name,
      ...(collection.description?.trim()
        ? { description: collection.description.trim().slice(0, 300) }
        : {}),
      ...(entries.length ? { fields } : {}),
    };
  });
}

export function isCollectionName(value: string) {
  return /^[a-z][a-z0-9_]{0,39}$/.test(value);
}

export function isFieldName(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value);
}

function normalizeChat(
  input: UiPluginManifestInput['chat'],
  surfaces: Array<{ type: string }>,
) {
  if (!input) return undefined;
  const when = input.when?.trim().slice(0, 500);
  if (!when) return undefined;
  if (!surfaces.some((surface) => surface.type === 'widget')) {
    throw new BadRequestException(
      'Apps shown in chat must declare a widget surface',
    );
  }
  const inputDescription = input.inputDescription?.trim().slice(0, 1_000);
  return { when, ...(inputDescription ? { inputDescription } : {}) };
}

function normalizeIconPath(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const path = String(value).trim().replace(/^\.\//, '');
  if (
    !/^[A-Za-z0-9._/-]{1,200}\.svg$/.test(path) ||
    path.startsWith('/') ||
    path.includes('..')
  ) {
    throw new BadRequestException(
      'icon must be a relative path to an .svg file in the code project',
    );
  }
  return path;
}

/** Reject SVG features that could load remote content or run script. */
export function svgDataUrl(source: string) {
  const svg = String(source ?? '').trim();
  if (!svg || Buffer.byteLength(svg) > MAX_ICON_BYTES) {
    throw new BadRequestException('The app icon must be a small SVG file');
  }
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) {
    throw new BadRequestException('The app icon must be an SVG document');
  }
  if (
    /<script|<foreignObject|<iframe|<!ENTITY|javascript:|\son[a-z]+\s*=/i.test(
      svg,
    ) ||
    /(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i.test(svg)
  ) {
    throw new BadRequestException(
      'The app icon SVG must not contain scripts, event handlers, or external references',
    );
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function normalizeUploadedIcon(value: unknown) {
  const text = String(value ?? '');
  const match =
    /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/.exec(
      text,
    );
  if (!match) {
    throw new BadRequestException(
      'Icons must be PNG, JPEG, WebP or SVG images',
    );
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_ICON_BYTES) {
    throw new BadRequestException('Icons must be smaller than 96 KB');
  }
  if (match[1] === 'image/svg+xml') return svgDataUrl(bytes.toString('utf8'));
  return text;
}

function normalizeGrants(
  plugin: Pick<typeof schema.uiPlugin.$inferSelect, 'manifest' | 'grants'>,
  input: UpdateUiPluginGrantsInput,
): UiPluginGrants {
  const requested = (plugin.manifest.capabilities ?? []).filter((grant) =>
    isUiPluginCapabilityName(grant.name),
  );
  const current = effectiveGrants(requested, plugin.grants ?? null);
  if (input.capabilities !== undefined && !Array.isArray(input.capabilities)) {
    throw new BadRequestException('capabilities must be an array');
  }
  const updates = new Map(
    (input.capabilities ?? []).map((update) => [update.name, update]),
  );
  for (const name of updates.keys()) {
    if (!requested.some((grant) => grant.name === name)) {
      throw new BadRequestException(
        `${name} was not requested by this app and cannot be granted`,
      );
    }
  }
  const capabilities = requested.flatMap((request) => {
    const name = request.name as UiPluginCapabilityName;
    const update = updates.get(name);
    const existing = current.find((grant) => grant.name === name);
    if (update ? update.enabled === false : !existing) return [];
    const resourceIds =
      update?.resourceIds !== undefined
        ? [
            ...new Set(
              update.resourceIds
                .map((id) => String(id).trim())
                .filter((id) => id && id.length <= 200),
            ),
          ].slice(0, 100)
        : existing?.resourceIds;
    if (
      resourceIds?.length &&
      request.resourceIds?.length &&
      resourceIds.some((id) => !request.resourceIds!.includes(id))
    ) {
      throw new BadRequestException(
        `${name} can only be narrowed to resources the app requested`,
      );
    }
    const approval =
      update?.approval === 'ask' || update?.approval === 'auto'
        ? update.approval
        : (existing?.approval ?? undefined);
    return [
      {
        name,
        ...(resourceIds?.length ? { resourceIds } : {}),
        ...(approval ? { approval } : {}),
      },
    ];
  });
  const agentDataAccess =
    input.agentDataAccess ?? plugin.grants?.agentDataAccess ?? 'none';
  if (!['none', 'read', 'readwrite'].includes(agentDataAccess)) {
    throw new BadRequestException('Invalid agent data access');
  }
  return {
    capabilities,
    agentDataAccess,
    chatEnabled: Boolean(
      (input.chatEnabled ?? plugin.grants?.chatEnabled ?? true) &&
        plugin.manifest.chat,
    ),
    reviewedAt: new Date().toISOString(),
  };
}

function ownedPluginCondition(ownerId: string, pluginId: string) {
  return and(
    eq(schema.uiPlugin.pluginId, pluginId),
    sql<boolean>`lower(${schema.uiPlugin.ownerUserId}) = lower(${ownerId})`,
  );
}

function normalizeLayoutScope(scope: string) {
  const value = String(scope ?? '')
    .trim()
    .toLowerCase();
  if (
    !/^(global|[a-z0-9][a-z0-9_-]{0,39}(?:\/[a-z0-9][a-z0-9_-]{0,39})?)$/.test(
      value,
    )
  ) {
    throw new BadRequestException('Invalid layout scope');
  }
  return value;
}

function agentView(plugin: ReturnType<typeof toPublicPlugin>) {
  const grants = plugin.grants;
  const chat = plugin.manifest.chat;
  return {
    pluginId: plugin.pluginId,
    name: plugin.name,
    slug: plugin.slug,
    description: plugin.description,
    category: plugin.manifest.category,
    chat: {
      available: Boolean(
        chat &&
          plugin.manifest.surfaces.some(
            (surface) => surface.type === 'widget',
          ) &&
          (grants ? grants.chatEnabled : true),
      ),
      when: chat?.when,
      inputDescription: chat?.inputDescription,
    },
    agentDataAccess: grants?.agentDataAccess ?? ('none' as const),
    collections: (plugin.manifest.data?.collections ?? []).map(
      (collection) => ({
        name: collection.name,
        description: collection.description,
        fields: collection.fields,
      }),
    ),
  };
}

function toPublicPlugin<T extends typeof schema.uiPlugin.$inferSelect>(
  plugin: T,
) {
  const effectiveCapabilities = effectiveGrants(
    plugin.manifest?.capabilities,
    plugin.grants ?? null,
  );
  const withGrants = { ...plugin, effectiveCapabilities };
  if (!plugin.deploymentId) return withGrants;
  try {
    return {
      ...withGrants,
      entryUrl: immutableDeploymentUrl(plugin.entryUrl, plugin.deploymentId),
    };
  } catch {
    return withGrants;
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
