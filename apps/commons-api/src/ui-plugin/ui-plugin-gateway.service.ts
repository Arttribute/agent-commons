import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { filter, lastValueFrom, map, timeout } from 'rxjs';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit/credit.service';
import { MemoryService } from '~/memory/memory.service';
import { RuntimeDispatcherService } from '~/agent/runtime/runtime-dispatcher.service';
import {
  UI_PLUGIN_CAPABILITIES,
  UI_PLUGIN_GATEWAY_METHODS,
  UI_PLUGIN_METHOD_CAPABILITIES,
  type UiPluginGrant,
} from './ui-plugin.capabilities';
import { UiPluginService } from './ui-plugin.service';
import { AppDataService } from './app-data/app-data.service';
import { AppNetworkService } from './app-network/app-network.service';

export type GatewayRequest = {
  method: string;
  params?: Record<string, unknown>;
};

export class GatewayError extends ForbiddenException {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super({ code, message });
  }
}

const AGENT_RUN_TIMEOUT_MS = 170_000;

/**
 * The server half of the Commons app bridge. Methods that need Commons data
 * beyond what the web host already proxies run here, where ownership is
 * enforced against the database and the owner's grants are re-read on every
 * call. The browser host can ask for approval, but it can never widen access.
 */
@Injectable()
export class UiPluginGatewayService {
  constructor(
    private readonly db: DatabaseService,
    private readonly plugins: UiPluginService,
    private readonly data: AppDataService,
    private readonly network: AppNetworkService,
    private readonly credits: CreditService,
    private readonly memory: MemoryService,
    private readonly runtime: RuntimeDispatcherService,
  ) {}

  async dispatch(
    ownerId: string,
    pluginId: string,
    request: GatewayRequest,
    options: { confirmed?: boolean; workspaceId?: string | null } = {},
  ) {
    const method = String(request?.method ?? '');
    if (!UI_PLUGIN_GATEWAY_METHODS.has(method)) {
      throw new GatewayError(-32601, 'This Commons method is not available.');
    }
    const params = isRecord(request.params) ? request.params : {};
    const plugin = await this.plugins
      .getActiveForOwner(ownerId, pluginId)
      .catch(() => {
        throw new GatewayError(-32001, 'This custom app is no longer enabled.');
      });
    const capability = UI_PLUGIN_METHOD_CAPABILITIES[method];
    const grant = plugin.effectiveCapabilities.find(
      (candidate) => candidate.name === capability,
    );
    if (!grant) {
      throw new GatewayError(
        -32001,
        `This app was not granted the ${capability} capability.`,
      );
    }
    if (requiresApproval(grant, method, params) && options.confirmed !== true) {
      throw new GatewayError(
        -32004,
        'This action needs your approval in Commons first.',
      );
    }

    switch (method) {
      case 'data.collections':
        return this.data.execute(
          ownerId,
          plugin,
          { op: 'collections' },
          scope(grant),
        );
      case 'data.get':
      case 'data.query':
      case 'data.insert':
      case 'data.update':
      case 'data.delete':
        return this.data.execute(
          ownerId,
          plugin,
          { ...params, op: method.slice('data.'.length) } as any,
          scope(grant),
        );
      case 'http.request': {
        const connection = String(params.connection ?? '');
        assertInScope(grant, connection, 'connection');
        return this.network.request(ownerId, plugin, params as any);
      }
      case 'agents.run':
        return this.runAgent(ownerId, grant, params, options.workspaceId);
      case 'sessions.list':
        return this.listSessions(ownerId, grant, params);
      case 'sessions.get':
        return this.getSession(ownerId, grant, params);
      case 'memory.list':
        return this.listMemory(ownerId, grant, params);
      case 'memory.create':
        return this.createMemory(ownerId, grant, params);
      case 'skills.list':
        return this.listSkills(ownerId, grant, params);
      case 'spaces.list':
        return this.listSpaces(ownerId, grant, params);
      case 'credits.get': {
        const balance = await this.credits.getBalance({
          principalId: ownerId,
        });
        return {
          available: balance.available,
          balance: balance.balance,
          reserved: balance.reserved,
          currency: balance.currency,
        };
      }
    }
    throw new GatewayError(-32601, 'This Commons method is not available.');
  }

  private async ownedAgents(ownerId: string) {
    return this.db
      .select({
        agentId: schema.agent.agentId,
        name: schema.agent.name,
      })
      .from(schema.agent)
      .where(
        or(
          sql<boolean>`lower(${schema.agent.ownerUserId}) = lower(${ownerId})`,
          sql<boolean>`lower(${schema.agent.owner}) = lower(${ownerId})`,
        ),
      );
  }

  private async assertOwnedAgent(ownerId: string, agentId: unknown) {
    const id = requiredString(agentId, 'agentId', 200);
    const agents = await this.ownedAgents(ownerId);
    const agent = agents.find((candidate) => candidate.agentId === id);
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  private async runAgent(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
    workspaceId?: string | null,
  ) {
    const agent = await this.assertOwnedAgent(ownerId, params.agentId);
    assertInScope(grant, agent.agentId, 'agent');
    const prompt = requiredString(params.prompt, 'prompt', 8_000);
    let sessionId: string | undefined;
    if (params.sessionId !== undefined) {
      const session = await this.ownedSession(ownerId, params.sessionId);
      if (session.agentId !== agent.agentId) {
        throw new BadRequestException('That session belongs to another agent');
      }
      sessionId = session.sessionId;
    }
    const payload: any = await lastValueFrom(
      this.runtime
        .runAgent({
          agentId: agent.agentId,
          messages: [{ role: 'user', content: prompt }],
          ...(sessionId ? { sessionId } : {}),
          initiator: ownerId,
          stream: true,
          ...(workspaceId ? { workspaceId } : {}),
        })
        .pipe(
          filter(
            (event: any) => event?.type === 'final' || event?.type === 'error',
          ),
          map((event: any) => {
            if (event.type === 'error') {
              throw new BadRequestException(
                String(
                  event.payload?.message ??
                    event.message ??
                    'The agent run failed',
                ).slice(0, 300),
              );
            }
            return event.payload;
          }),
          timeout(AGENT_RUN_TIMEOUT_MS),
        ),
    );
    return {
      agentId: agent.agentId,
      sessionId: payload?.sessionId,
      reply: messageText(payload).slice(0, 20_000),
    };
  }

  private async ownedSession(ownerId: string, sessionId: unknown) {
    const id = requiredString(sessionId, 'sessionId', 64);
    if (!isUuid(id)) throw new NotFoundException('Session not found');
    const agents = await this.ownedAgents(ownerId);
    const [session] = await this.db
      .select()
      .from(schema.session)
      .where(eq(schema.session.sessionId, id))
      .limit(1);
    if (
      !session ||
      !agents.some((agent) => agent.agentId === session.agentId) ||
      (session.initiator &&
        session.initiator.toLowerCase() !== ownerId.toLowerCase())
    ) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  private async listSessions(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
  ) {
    const agents = await this.ownedAgents(ownerId);
    let agentIds = agents.map((agent) => agent.agentId);
    if (params.agentId !== undefined) {
      const agentId = requiredString(params.agentId, 'agentId', 200);
      agentIds = agentIds.filter((id) => id === agentId);
    }
    if (!agentIds.length) return { items: [], total: 0 };
    const limit = boundedLimit(params.limit);
    const rows = await this.db
      .select({
        sessionId: schema.session.sessionId,
        agentId: schema.session.agentId,
        title: schema.session.title,
        createdAt: schema.session.createdAt,
        updatedAt: schema.session.updatedAt,
      })
      .from(schema.session)
      .where(
        and(
          inArray(schema.session.agentId, agentIds),
          sql<boolean>`lower(${schema.session.initiator}) = lower(${ownerId})`,
          ...(grant.resourceIds?.length
            ? [inArray(schema.session.sessionId, grant.resourceIds)]
            : []),
          ...(typeof params.query === 'string' && params.query.trim()
            ? [
                sql<boolean>`${schema.session.title} ILIKE ${`%${params.query
                  .trim()
                  .slice(0, 100)
                  .replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`,
              ]
            : []),
        ),
      )
      .orderBy(desc(schema.session.updatedAt))
      .limit(limit);
    return {
      items: rows.map((row) => ({
        ...row,
        agentName: agents.find((agent) => agent.agentId === row.agentId)?.name,
        sessionPath: `/sessions/${row.sessionId}`,
      })),
      total: rows.length,
    };
  }

  private async getSession(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
  ) {
    const session = await this.ownedSession(ownerId, params.sessionId);
    assertInScope(grant, session.sessionId, 'session');
    const history = Array.isArray(session.history) ? session.history : [];
    const limit = boundedLimit(params.limit, 30);
    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      title: session.title,
      messages: history
        .filter((message) =>
          ['user', 'human', 'assistant', 'ai'].includes(message.role),
        )
        .slice(-limit)
        .map((message) => ({
          role: ['user', 'human'].includes(message.role) ? 'user' : 'assistant',
          content: String(message.content ?? '').slice(0, 4_000),
          timestamp: message.timestamp,
        })),
    };
  }

  private async listMemory(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
  ) {
    const agent = await this.assertOwnedAgent(ownerId, params.agentId);
    assertInScope(grant, agent.agentId, 'agent');
    const memories = await this.memory.getMemories(agent.agentId, {
      limit: boundedLimit(params.limit),
    });
    const query =
      typeof params.query === 'string' ? params.query.trim().toLowerCase() : '';
    const items = memories
      .filter(
        (memory) =>
          !query ||
          memory.summary.toLowerCase().includes(query) ||
          memory.content.toLowerCase().includes(query),
      )
      .map((memory) => ({
        memoryId: memory.memoryId,
        agentId: memory.agentId,
        memoryType: memory.memoryType,
        summary: memory.summary,
        content: memory.content.slice(0, 2_000),
        tags: memory.tags,
        importanceScore: memory.importanceScore,
        createdAt: memory.createdAt,
      }));
    return { items, total: items.length };
  }

  private async createMemory(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
  ) {
    const agent = await this.assertOwnedAgent(ownerId, params.agentId);
    assertInScope(grant, agent.agentId, 'agent');
    const content = requiredString(params.content, 'content', 4_000);
    const memoryType = ['episodic', 'semantic', 'procedural'].includes(
      String(params.memoryType),
    )
      ? String(params.memoryType)
      : 'semantic';
    const tags = Array.isArray(params.tags)
      ? params.tags
          .filter((tag): tag is string => typeof tag === 'string')
          .map((tag) => tag.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 10)
      : [];
    const memory = await this.memory.createMemory({
      agentId: agent.agentId,
      memoryType,
      content,
      summary:
        typeof params.summary === 'string' && params.summary.trim()
          ? params.summary.trim().slice(0, 300)
          : content.slice(0, 300),
      tags,
      sourceType: 'manual',
    } as any);
    return {
      memoryId: memory.memoryId,
      agentId: memory.agentId,
      memoryType: memory.memoryType,
      summary: memory.summary,
    };
  }

  private async listSkills(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
  ) {
    const rows = await this.db
      .select({
        skillId: schema.skill.skillId,
        slug: schema.skill.slug,
        name: schema.skill.name,
        description: schema.skill.description,
        tags: schema.skill.tags,
        icon: schema.skill.icon,
        ownerType: schema.skill.ownerType,
      })
      .from(schema.skill)
      .where(
        and(
          eq(schema.skill.isActive, true),
          or(
            eq(schema.skill.isPublic, true),
            sql<boolean>`lower(${schema.skill.ownerId}) = lower(${ownerId})`,
          ),
          ...(grant.resourceIds?.length
            ? [inArray(schema.skill.skillId, grant.resourceIds)]
            : []),
        ),
      )
      .limit(200);
    const query =
      typeof params.query === 'string' ? params.query.trim().toLowerCase() : '';
    const items = rows.filter(
      (skill) =>
        !query ||
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query),
    );
    return {
      items: items.slice(0, boundedLimit(params.limit)),
      total: items.length,
    };
  }

  private async listSpaces(
    ownerId: string,
    grant: UiPluginGrant,
    params: Record<string, unknown>,
  ) {
    const memberships = await this.db
      .select({ spaceId: schema.spaceMember.spaceId })
      .from(schema.spaceMember)
      .where(
        and(
          sql<boolean>`lower(${schema.spaceMember.memberId}) = lower(${ownerId})`,
          eq(schema.spaceMember.memberType, 'human'),
        ),
      );
    const memberIds = memberships.map((membership) => membership.spaceId);
    const rows = await this.db
      .select({
        spaceId: schema.space.spaceId,
        name: schema.space.name,
        description: schema.space.description,
        isPublic: schema.space.isPublic,
        createdAt: schema.space.createdAt,
        updatedAt: schema.space.updatedAt,
      })
      .from(schema.space)
      .where(
        and(
          or(
            sql<boolean>`lower(${schema.space.createdBy}) = lower(${ownerId})`,
            ...(memberIds.length
              ? [inArray(schema.space.spaceId, memberIds)]
              : []),
          ),
          ...(grant.resourceIds?.length
            ? [inArray(schema.space.spaceId, grant.resourceIds)]
            : []),
        ),
      )
      .orderBy(desc(schema.space.updatedAt))
      .limit(boundedLimit(params.limit));
    return {
      items: rows.map((row) => ({
        ...row,
        spacePath: `/spaces/${row.spaceId}`,
      })),
      total: rows.length,
    };
  }
}

export function requiresApproval(
  grant: UiPluginGrant,
  method: string,
  params: Record<string, unknown>,
) {
  const definition = UI_PLUGIN_CAPABILITIES[grant.name];
  if (definition.access === 'read') return false;
  if (grant.approval === 'auto') return false;
  if (method === 'http.request') {
    const httpMethod = String(params.method ?? 'GET').toUpperCase();
    return !['GET', 'HEAD'].includes(httpMethod);
  }
  if (method.startsWith('data.')) {
    // Writing an app's own records is routine; the owner opts into asking.
    return grant.approval === 'ask';
  }
  return true;
}

function scope(grant: UiPluginGrant) {
  return grant.resourceIds?.length ? grant.resourceIds : undefined;
}

function assertInScope(grant: UiPluginGrant, id: string, kind: string) {
  if (grant.resourceIds?.length && !grant.resourceIds.includes(id)) {
    throw new GatewayError(-32002, `This app cannot access that ${kind}.`);
  }
}

function messageText(payload: any): string {
  const content =
    payload?.content ?? payload?.kwargs?.content ?? payload?.lc_kwargs?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : (part?.text ?? '')))
      .join('');
  }
  return typeof payload?.info === 'string' ? payload.info : '';
}

function requiredString(value: unknown, field: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim().slice(0, maximum);
}

function boundedLimit(value: unknown, fallback = 50) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.round(value)));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
