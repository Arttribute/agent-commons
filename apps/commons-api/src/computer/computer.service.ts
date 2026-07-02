import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';

type ComputerLifecycle = 'persistent' | 'ephemeral';
type ComputerStatus =
  | 'provisioning'
  | 'starting'
  | 'running'
  | 'idle'
  | 'stopping'
  | 'stopped'
  | 'terminated'
  | 'failed'
  | 'error'
  | 'unavailable';

const ACTIVE_STATUSES: ComputerStatus[] = [
  'provisioning',
  'starting',
  'running',
  'idle',
];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ComputerConfig = typeof schema.agentComputerConfig.$inferSelect;
type ComputerInstance = typeof schema.agentComputerInstance.$inferSelect;

type CommonOsAgent = {
  _id?: string;
  id?: string;
  status?: string;
  pod?: {
    provider?: 'aws' | 'gcp';
    region?: string | null;
    namespaceId?: string | null;
    lastError?: string | null;
  } | null;
  workspace?: {
    snapshot?: string | null;
    rootDir?: string | null;
    updatedAt?: string | null;
  } | null;
  browser?: ComputerInstance['browser'] | null;
  runtime?: Record<string, any> | null;
  startedAt?: string | null;
};

@Injectable()
export class ComputerService {
  private readonly logger = new Logger(ComputerService.name);

  constructor(private readonly db: DatabaseService) {}

  async getConfig(agentId: string): Promise<ComputerConfig> {
    const existing = await this.db.query.agentComputerConfig.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (existing) return existing;

    const [created] = await this.db
      .insert(schema.agentComputerConfig)
      .values({
        agentId,
        enabled: false,
        defaultMode: 'ephemeral',
        provider: 'commonos',
      })
      .returning();
    return created;
  }

  async updateConfig(
    agentId: string,
    patch: Partial<typeof schema.agentComputerConfig.$inferInsert>,
  ) {
    await this.assertAgent(agentId);
    const current = await this.getConfig(agentId);
    const next = this.normalizeConfigPatch(patch);

    const [updated] = await this.db
      .update(schema.agentComputerConfig)
      .set({
        ...next,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerConfig.configId, current.configId))
      .returning();
    return updated;
  }

  async listInstances(args: {
    agentId: string;
    sessionId?: string;
    includeTerminated?: boolean;
  }) {
    const rows = await this.db.query.agentComputerInstance.findMany({
      where: (t) => {
        const filters = [
          eq(t.agentId, args.agentId),
          args.sessionId
            ? or(eq(t.sessionId, args.sessionId), isNull(t.sessionId))
            : undefined,
          !args.includeTerminated
            ? sql`${t.status} not in ('terminated', 'stopped')`
            : undefined,
        ].filter(Boolean);
        return and(...(filters as any[]));
      },
      orderBy: (t) => desc(t.createdAt),
    });

    await Promise.all(
      rows
        .filter((row) => row.commonOsAgentId)
        .slice(0, 4)
        .map((row) =>
          this.refreshInstance(row.computerId, { silent: true }).catch(() => null),
        ),
    );

    return this.db.query.agentComputerInstance.findMany({
      where: (t) => {
        const filters = [
          eq(t.agentId, args.agentId),
          args.sessionId
            ? or(eq(t.sessionId, args.sessionId), isNull(t.sessionId))
            : undefined,
          !args.includeTerminated
            ? sql`${t.status} not in ('terminated', 'stopped')`
            : undefined,
        ].filter(Boolean);
        return and(...(filters as any[]));
      },
      orderBy: (t) => desc(t.createdAt),
    });
  }

  async getInstance(agentId: string, computerId: string) {
    const computer = await this.db.query.agentComputerInstance.findFirst({
      where: (t) => and(eq(t.agentId, agentId), eq(t.computerId, computerId)),
    });
    if (!computer) throw new NotFoundException('Computer not found');
    return computer;
  }

  async startComputer(args: {
    agentId: string;
    sessionId?: string;
    lifecycle?: ComputerLifecycle;
    name?: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    reason?: string;
  }) {
    const agent = await this.assertAgent(args.agentId);
    const config = await this.getConfig(args.agentId);
    const sessionId = args.sessionId?.trim() || undefined;
    if (!config.enabled) {
      throw new BadRequestException(
        'Computer use is disabled for this agent. Enable it in the agent Computer settings first.',
      );
    }
    if (args.actorType === 'agent' && !config.allowAgentStart) {
      throw new BadRequestException(
        'This agent is not allowed to start computers automatically.',
      );
    }
    if (sessionId) {
      await this.assertSessionForAgent(args.agentId, sessionId);
    }

    const lifecycle =
      args.lifecycle ?? (config.defaultMode as ComputerLifecycle) ?? 'ephemeral';
    await this.enforceLimits(args.agentId, lifecycle, config);

    if (lifecycle === 'persistent') {
      const reusable = await this.db.query.agentComputerInstance.findFirst({
        where: (t) =>
          and(
            eq(t.agentId, args.agentId),
            eq(t.lifecycle, 'persistent'),
            inArray(t.status, ACTIVE_STATUSES),
          ),
        orderBy: (t) => desc(t.createdAt),
      });
      if (reusable) {
        await this.recordEvent({
          computerId: reusable.computerId,
          agentId: args.agentId,
          sessionId,
          eventType: 'computer.reused',
          actorId: args.actorId,
          actorType: args.actorType,
          summary: 'Persistent computer reused',
          payload: { reason: args.reason },
        });
        return this.refreshInstance(reusable.computerId, { silent: true });
      }
    }

    const now = new Date();
    const expiresAt =
      lifecycle === 'ephemeral'
        ? new Date(now.getTime() + config.sessionTtlMinutes * 60_000)
        : null;
    const computerId = uuidv4();
    const name =
      args.name?.trim() ||
      (lifecycle === 'persistent'
        ? `${agent.name} computer`
        : `${agent.name} session computer`);

    const [created] = await this.db
      .insert(schema.agentComputerInstance)
      .values({
        computerId,
        agentId: args.agentId,
        sessionId: sessionId as any,
        ownerUserId: agent.ownerUserId,
        workspaceId: agent.workspaceId,
        name,
        lifecycle,
        status: 'provisioning',
        provider: config.provider,
        region: config.region,
        image: config.image,
        cpuLimit: config.cpuLimit,
        memoryLimit: config.memoryLimit,
        storageLimit: config.storageLimit,
        workspaceRoot: '/mnt/shared',
        expiresAt: expiresAt ?? undefined,
        lastActivityAt: now,
        metadata: {
          reason: args.reason,
          provisioner: 'commonos',
        },
      })
      .returning();

    await this.recordEvent({
      computerId,
      agentId: args.agentId,
      sessionId,
      eventType: 'computer.provisioning',
      actorId: args.actorId,
      actorType: args.actorType,
      summary: 'Computer provisioning started',
      payload: { lifecycle, name },
    });

    try {
      const provisioned = await this.deployWithCommonOs({
        agent,
        config,
        computer: created,
        lifecycle,
        name,
      });
      return provisioned;
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      const [failed] = await this.db
        .update(schema.agentComputerInstance)
        .set({
          status: this.commonOsConfigured() ? 'failed' : 'unavailable',
          errorMessage: message,
          updatedAt: new Date(),
        })
        .where(eq(schema.agentComputerInstance.computerId, computerId))
        .returning();
      await this.recordEvent({
        computerId,
        agentId: args.agentId,
        sessionId,
        eventType: 'computer.error',
        actorId: args.actorId,
        actorType: args.actorType,
        summary: 'Computer provisioning failed',
        payload: { error: message },
      });
      return failed;
    }
  }

  async stopComputer(args: {
    agentId: string;
    computerId: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
  }) {
    const computer = await this.getInstance(args.agentId, args.computerId);
    if (computer.commonOsAgentId) {
      await this.commonOsComputerRequest(
        'DELETE',
        `/computers/${computer.commonOsAgentId}`,
        this.commonOsFleetId()
          ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}`
          : undefined,
      ).catch((err) =>
        this.logger.warn(
          `CommonOS terminate failed for ${computer.commonOsAgentId}: ${err.message}`,
        ),
      );
    }

    const [updated] = await this.db
      .update(schema.agentComputerInstance)
      .set({
        status: 'stopped',
        stoppedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerInstance.computerId, args.computerId))
      .returning();
    await this.recordEvent({
      computerId: args.computerId,
      agentId: args.agentId,
      sessionId: computer.sessionId ?? undefined,
      eventType: 'computer.stopped',
      actorId: args.actorId,
      actorType: args.actorType,
      summary: 'Computer stopped',
    });
    return updated;
  }

  async refreshInstance(
    computerId: string,
    options: { silent?: boolean } = {},
  ) {
    const computer = await this.db.query.agentComputerInstance.findFirst({
      where: (t) => eq(t.computerId, computerId),
    });
    if (!computer) throw new NotFoundException('Computer not found');
    if (!computer.commonOsAgentId) return computer;

    const commonOs = await this.commonOsComputerRequest<CommonOsAgent>(
      'GET',
      `/computers/${computer.commonOsAgentId}`,
      this.commonOsFleetId()
        ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}`
        : undefined,
    );
    const status = this.mapStatus(commonOs.status);
    const [updated] = await this.db
      .update(schema.agentComputerInstance)
      .set({
        status,
        cloudProvider: commonOs.pod?.provider ?? computer.cloudProvider,
        region: commonOs.pod?.region ?? computer.region,
        namespaceId: commonOs.pod?.namespaceId ?? computer.namespaceId,
        podName: commonOs.pod?.namespaceId
          ? `agent-${String(commonOs._id ?? computer.commonOsAgentId).replace(/_/g, '-')}`
          : computer.podName,
        workspaceRoot: commonOs.workspace?.rootDir ?? computer.workspaceRoot,
        workspaceSnapshot:
          commonOs.workspace?.snapshot ?? computer.workspaceSnapshot,
        browser: commonOs.browser ?? computer.browser,
        startedAt:
          commonOs.startedAt && !Number.isNaN(new Date(commonOs.startedAt).getTime())
            ? new Date(commonOs.startedAt)
            : computer.startedAt,
        errorMessage: commonOs.pod?.lastError ?? computer.errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerInstance.computerId, computerId))
      .returning();

    if (!options.silent) {
      await this.recordEvent({
        computerId,
        agentId: computer.agentId,
        sessionId: computer.sessionId ?? undefined,
        eventType: 'computer.refreshed',
        actorType: 'service',
        summary: 'Computer state refreshed from CommonOS',
        payload: { status },
      });
    }
    return updated;
  }

  async readFile(args: { agentId: string; computerId: string; path: string }) {
    const computer = await this.getInstance(args.agentId, args.computerId);
    if (!computer.commonOsAgentId) {
      throw new BadRequestException('Computer is not linked to a CommonOS runtime');
    }
    const path = normalizeWorkspacePath(args.path);
    const data = await this.commonOsComputerRequest<{ content?: string }>(
      'GET',
      `/computers/${computer.commonOsAgentId}/workspace/read?path=${encodeURIComponent(path)}`,
      this.commonOsFleetId()
        ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}/workspace/read?path=${encodeURIComponent(path)}`
        : undefined,
    );
    await this.touchComputer(computer.computerId);
    return { path, content: data.content ?? '' };
  }

  async sendInstruction(args: {
    agentId: string;
    computerId: string;
    instruction: string;
    eventType: string;
    summary: string;
    waitMs?: number;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
  }) {
    const computer = await this.getInstance(args.agentId, args.computerId);
    if (!computer.commonOsAgentId) {
      throw new BadRequestException('Computer is not linked to a CommonOS runtime');
    }

    const sent = await this.commonOsComputerRequest<any>(
      'POST',
      `/computers/${computer.commonOsAgentId}/instructions`,
      this.commonOsFleetId()
        ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}/human-message`
        : undefined,
      {
        content: args.instruction,
        sessionId: (computer.metadata as any)?.commonOsSessionId,
      },
    );

    await this.recordEvent({
      computerId: computer.computerId,
      agentId: computer.agentId,
      sessionId: computer.sessionId ?? undefined,
      eventType: args.eventType,
      actorId: args.actorId,
      actorType: args.actorType,
      summary: args.summary,
      payload: {
        instruction: args.instruction,
        commonOsMessageId: sent?._id,
      },
    });

    const response = await this.pollCommonOsMessage(
      computer.commonOsAgentId,
      sent?._id,
      args.waitMs ?? 180_000,
    );
    await this.touchComputer(computer.computerId);
    await this.refreshInstance(computer.computerId, { silent: true }).catch(
      () => null,
    );

    await this.recordEvent({
      computerId: computer.computerId,
      agentId: computer.agentId,
      sessionId: computer.sessionId ?? undefined,
      eventType: `${args.eventType}.result`,
      actorId: args.actorId,
      actorType: args.actorType,
      summary: response.status === 'failed' ? 'Computer instruction failed' : 'Computer instruction completed',
      payload: response,
    });

    return response;
  }

  async runCommand(args: {
    agentId: string;
    computerId: string;
    command: string;
    cwd?: string;
    timeoutSeconds?: number;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
  }) {
    const command = args.command.trim();
    if (!command) throw new BadRequestException('command is required');
    if (command.length > 2000) {
      throw new BadRequestException('command is too long');
    }
    const timeoutSeconds = Math.max(
      5,
      Math.min(args.timeoutSeconds ?? 120, 600),
    );
    const cwd = args.cwd?.trim() || '/mnt/shared';
    const instruction = [
      'Use the CommonOS pod terminal for this computer.',
      'Run exactly this shell command and return stdout, stderr, and exit code.',
      'Do not run unrelated commands unless needed to report a precise failure.',
      `Working directory: ${cwd}`,
      `Timeout seconds: ${timeoutSeconds}`,
      '',
      '```sh',
      command,
      '```',
    ].join('\n');

    const result = await this.sendInstruction({
      agentId: args.agentId,
      computerId: args.computerId,
      instruction,
      eventType: 'terminal.command',
      summary: command.slice(0, 180),
      waitMs: (timeoutSeconds + 120) * 1000,
      actorId: args.actorId,
      actorType: args.actorType,
    });

    await this.db
      .update(schema.agentComputerInstance)
      .set({
        terminal: {
          lastCommand: command,
          lastExitCode: null,
          lastOutput: result.response ?? result.error ?? '',
          updatedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerInstance.computerId, args.computerId));

    return result;
  }

  async openBrowser(args: {
    agentId: string;
    computerId: string;
    url: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
  }) {
    const url = args.url.trim();
    if (!/^https?:\/\//i.test(url) && !/^http:\/\/localhost[:/]/i.test(url)) {
      throw new BadRequestException('url must start with http:// or https://');
    }
    const result = await this.sendInstruction({
      agentId: args.agentId,
      computerId: args.computerId,
      instruction: [
        'Use this computer browser.',
        `Open ${url}.`,
        'Wait until the page is loaded, then report the page title, current URL, and any obvious console/runtime errors.',
      ].join('\n'),
      eventType: 'browser.open',
      summary: `Open ${url}`,
      waitMs: 180_000,
      actorId: args.actorId,
      actorType: args.actorType,
    });
    const computer = await this.refreshInstance(args.computerId, {
      silent: true,
    });
    return { ...result, browser: computer.browser };
  }

  async getEvents(args: {
    agentId: string;
    computerId: string;
    limit?: number;
  }) {
    await this.getInstance(args.agentId, args.computerId);
    return this.db.query.agentComputerEvent.findMany({
      where: (t) => eq(t.computerId, args.computerId),
      orderBy: (t) => desc(t.createdAt),
      limit: Math.max(1, Math.min(args.limit ?? 80, 200)),
    });
  }

  async buildComputerPrompt(agentId: string, sessionId?: string) {
    const config = await this.getConfig(agentId).catch(() => null);
    if (!config?.enabled) return '';

    const computers = await this.listInstances({
      agentId,
      sessionId,
      includeTerminated: false,
    }).catch(() => []);
    const lines = computers.length
      ? computers
          .map(
            (c) =>
              `- ${c.name} (${c.computerId}) ${c.lifecycle}/${c.status}${c.browser?.url ? ` browser=${c.browser.url}` : ''}`,
          )
          .join('\n')
      : '- No active computers yet.';

    return [
      '### Computers',
      'You may use isolated CommonOS computers when work requires a filesystem, terminal, browser, or longer-running runtime.',
      `Computer use is ${config.allowAgentStart ? 'agent-startable' : 'user-start only'}; default mode is ${config.defaultMode}.`,
      'Use startAgentComputer before computer work when no suitable computer is active. Use runComputerCommand for terminal work, readComputerFile for files, and openComputerBrowser for browser work.',
      'Always keep commands scoped to the task, avoid secrets exfiltration, and summarize created files/screenshots/results for the user.',
      'Active computers:',
      lines,
    ].join('\n');
  }

  private async deployWithCommonOs(args: {
    agent: typeof schema.agent.$inferSelect;
    config: ComputerConfig;
    computer: ComputerInstance;
    lifecycle: ComputerLifecycle;
    name: string;
  }) {
    if (!this.commonOsConfigured()) {
      throw new Error(
        'CommonOS API is not configured. Set COMMON_OS_API_KEY and, for legacy fleet fallback or explicit placement, COMMON_OS_FLEET_ID.',
      );
    }

    const fleetId = this.commonOsFleetId();
    const commonOsAgent = await this.commonOsComputerRequest<CommonOsAgent>(
      'POST',
      '/computers',
      fleetId ? `/fleets/${fleetId}/agents` : undefined,
      {
        ...(fleetId ? { fleetId } : {}),
        name: args.name,
        role: args.name,
        systemPrompt: this.commonOsSystemPrompt(args.agent, args.lifecycle),
        permissionTier: 'worker',
        room: 'dev-room',
        integrationPath: 'native',
        ...(args.config.image ? { dockerImage: args.config.image } : {}),
        agentCommonsId: args.agent.agentId,
      },
    );

    const commonOsAgentId = String(commonOsAgent._id ?? commonOsAgent.id ?? '');
    if (!commonOsAgentId) {
      throw new Error('CommonOS did not return an agent id');
    }

    const [updated] = await this.db
      .update(schema.agentComputerInstance)
        .set({
        status: this.mapStatus(commonOsAgent.status),
        commonOsFleetId: fleetId || null,
        commonOsAgentId,
        cloudProvider: commonOsAgent.pod?.provider,
        region: commonOsAgent.pod?.region ?? args.config.region,
        namespaceId: commonOsAgent.pod?.namespaceId ?? null,
        podName: commonOsAgent.pod?.namespaceId
          ? `agent-${commonOsAgentId.replace(/_/g, '-')}`
          : null,
        workspaceRoot: commonOsAgent.workspace?.rootDir ?? '/mnt/shared',
        workspaceSnapshot: commonOsAgent.workspace?.snapshot ?? null,
        browser: commonOsAgent.browser ?? null,
        startedAt: commonOsAgent.startedAt
          ? new Date(commonOsAgent.startedAt)
          : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerInstance.computerId, args.computer.computerId))
      .returning();

    await this.recordEvent({
      computerId: args.computer.computerId,
      agentId: args.agent.agentId,
      sessionId: args.computer.sessionId ?? undefined,
      eventType: 'computer.running',
      actorType: 'service',
      summary: 'CommonOS computer deployed',
      payload: { commonOsAgentId },
    });

    return updated;
  }

  private async pollCommonOsMessage(
    commonOsAgentId: string,
    messageId: string | undefined,
    waitMs: number,
  ) {
    if (!messageId) {
      return { status: 'submitted', response: null, error: null };
    }
    const started = Date.now();
    while (Date.now() - started < Math.min(waitMs, 720_000)) {
      const list = await this.commonOsComputerRequest<any[]>(
        'GET',
        `/computers/${commonOsAgentId}/instructions`,
        this.commonOsFleetId()
          ? `/fleets/${this.commonOsFleetId()}/agents/${commonOsAgentId}/human-messages`
          : undefined,
      );
      const message = list.find((item) => item._id === messageId);
      if (message?.response || message?.status === 'failed') {
        return {
          status: message.status,
          response: message.response ?? null,
          error: message.error ?? null,
          respondedAt: message.respondedAt ?? null,
          commonOsMessageId: messageId,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    return {
      status: 'timeout',
      response: null,
      error: 'Timed out waiting for CommonOS computer response',
      commonOsMessageId: messageId,
    };
  }

  private async commonOsComputerRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    computerPath: string,
    legacyFleetPath?: string,
    body?: unknown,
  ): Promise<T> {
    if (this.commonOsUseGeneralComputerApi()) {
      try {
        return await this.commonOsRequest<T>(method, computerPath, body);
      } catch (err) {
        if (!legacyFleetPath) throw err;
        this.logger.warn(
          `CommonOS computer API ${method} ${computerPath} failed; falling back to fleet route: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (!legacyFleetPath) {
      throw new Error(
        'CommonOS fleet fallback is unavailable. Set COMMON_OS_FLEET_ID or deploy the CommonOS /computers API.',
      );
    }
    return this.commonOsRequest<T>(method, legacyFleetPath, body);
  }

  private async commonOsRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const apiUrl = this.commonOsApiUrl();
    const apiKey = this.commonOsApiKey();
    if (!apiUrl || !apiKey) {
      throw new Error('CommonOS API credentials are not configured');
    }
    const url = `${apiUrl}${this.commonOsBasePath(apiUrl)}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;
      throw new Error(
        payload?.error ||
          payload?.message ||
          `CommonOS ${method} ${path} failed with ${response.status}`,
      );
    }
    return response.json() as Promise<T>;
  }

  private async enforceLimits(
    agentId: string,
    lifecycle: ComputerLifecycle,
    config: ComputerConfig,
  ) {
    const active = await this.db.query.agentComputerInstance.findMany({
      where: (t) => and(eq(t.agentId, agentId), inArray(t.status, ACTIVE_STATUSES)),
      columns: { lifecycle: true },
    });
    if (active.length >= config.maxConcurrentComputers) {
      throw new BadRequestException(
        `Computer limit reached (${config.maxConcurrentComputers} active). Stop one before starting another.`,
      );
    }
    const sameLifecycle = active.filter((item) => item.lifecycle === lifecycle);
    const max =
      lifecycle === 'persistent'
        ? config.maxPersistentComputers
        : config.maxEphemeralComputers;
    if (sameLifecycle.length >= max) {
      throw new BadRequestException(
        `${lifecycle} computer limit reached (${max}).`,
      );
    }
  }

  private async assertAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (t) => eq(t.agentId, agentId),
    });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  private async assertSessionForAgent(agentId: string, sessionId: string) {
    if (!UUID_RE.test(sessionId)) {
      throw new BadRequestException('sessionId must be a valid UUID');
    }
    const session = await this.db.query.session.findFirst({
      where: (t) => and(eq(t.sessionId, sessionId as any), eq(t.agentId, agentId)),
    });
    if (!session) {
      throw new BadRequestException(
        'sessionId must reference an existing session for this agent',
      );
    }
  }

  private normalizeConfigPatch(
    patch: Partial<typeof schema.agentComputerConfig.$inferInsert>,
  ) {
    const normalized: Record<string, any> = {};
    const allowed = [
      'enabled',
      'defaultMode',
      'autoStart',
      'allowAgentStart',
      'allowUserSelect',
      'allowBrowser',
      'allowTerminal',
      'allowFilesystem',
      'networkAccess',
      'maxPersistentComputers',
      'maxEphemeralComputers',
      'maxConcurrentComputers',
      'idleTtlMinutes',
      'sessionTtlMinutes',
      'image',
      'cpuLimit',
      'memoryLimit',
      'storageLimit',
      'region',
      'provider',
      'metadata',
    ];
    for (const key of allowed) {
      if ((patch as any)[key] !== undefined) normalized[key] = (patch as any)[key];
    }

    if (normalized.defaultMode !== undefined) {
      normalized.defaultMode =
        normalized.defaultMode === 'persistent' ? 'persistent' : 'ephemeral';
    }

    for (const key of [
      'maxPersistentComputers',
      'maxEphemeralComputers',
      'maxConcurrentComputers',
      'idleTtlMinutes',
      'sessionTtlMinutes',
    ]) {
      if (normalized[key] !== undefined) {
        normalized[key] = Math.max(1, Math.min(Number(normalized[key]) || 1, 24 * 60));
      }
    }

    if (normalized.maxPersistentComputers !== undefined) {
      normalized.maxPersistentComputers = Math.min(
        normalized.maxPersistentComputers,
        3,
      );
    }
    if (normalized.maxEphemeralComputers !== undefined) {
      normalized.maxEphemeralComputers = Math.min(
        normalized.maxEphemeralComputers,
        5,
      );
    }
    if (normalized.maxConcurrentComputers !== undefined) {
      normalized.maxConcurrentComputers = Math.min(
        normalized.maxConcurrentComputers,
        5,
      );
    }

    return Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined),
    );
  }

  private async touchComputer(computerId: string) {
    await this.db
      .update(schema.agentComputerInstance)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.agentComputerInstance.computerId, computerId));
  }

  private async recordEvent(args: {
    computerId: string;
    agentId: string;
    sessionId?: string;
    eventType: string;
    actorType?: 'user' | 'agent' | 'service';
    actorId?: string;
    summary?: string;
    payload?: Record<string, any>;
  }) {
    await this.db.insert(schema.agentComputerEvent).values({
      computerId: args.computerId,
      agentId: args.agentId,
      sessionId: args.sessionId as any,
      eventType: args.eventType,
      actorType: args.actorType ?? 'agent',
      actorId: args.actorId,
      summary: args.summary,
      payload: args.payload,
    });
  }

  private mapStatus(status?: string | null): ComputerStatus {
    switch (status) {
      case 'running':
      case 'idle':
      case 'starting':
      case 'stopping':
      case 'stopped':
      case 'terminated':
      case 'failed':
      case 'error':
        return status;
      case 'provisioning':
      default:
        return status ? 'starting' : 'provisioning';
    }
  }

  private commonOsSystemPrompt(
    agent: typeof schema.agent.$inferSelect,
    lifecycle: ComputerLifecycle,
  ) {
    return [
      `You are the CommonOS computer runtime for Agent Commons agent ${agent.name}.`,
      `Agent Commons ID: ${agent.agentId}`,
      `Lifecycle: ${lifecycle}`,
      'Use the pod filesystem, terminal, and browser to complete computer-specific work.',
      'When asked to run a terminal command, run the exact requested command first and return stdout, stderr, and exit code.',
      'When asked to open a browser, use the pod browser tools and report visible/runtime errors.',
      'Keep all workspace files under /mnt/shared and avoid unrelated destructive changes.',
    ].join('\n');
  }

  private commonOsConfigured() {
    return Boolean(
      this.commonOsApiUrl() &&
        this.commonOsApiKey() &&
        (this.commonOsFleetId() || this.commonOsUseGeneralComputerApi()),
    );
  }

  private commonOsApiUrl() {
    return (
      process.env.COMMON_OS_API_URL ||
      process.env.COMMONOS_API_URL ||
      process.env.COMPUTE_API_URL ||
      'https://api.agentcommons.io'
    ).replace(/\/$/, '');
  }

  private commonOsApiKey() {
    return (
      process.env.COMMON_OS_API_KEY ||
      process.env.COMMONOS_API_KEY ||
      process.env.COMPUTE_API_KEY ||
      ''
    ).trim();
  }

  private commonOsFleetId() {
    return (
      process.env.COMMON_OS_FLEET_ID ||
      process.env.COMMONOS_FLEET_ID ||
      process.env.COMPUTE_FLEET_ID ||
      ''
    ).trim();
  }

  private commonOsUseGeneralComputerApi() {
    return process.env.COMMON_OS_COMPUTER_API !== 'legacy';
  }

  private commonOsBasePath(apiUrl: string) {
    if (process.env.COMMON_OS_API_BASE_PATH !== undefined) {
      return process.env.COMMON_OS_API_BASE_PATH;
    }
    return apiUrl === 'https://api.agentcommons.io' ? '/v1/compute' : '';
  }
}

function normalizeWorkspacePath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new BadRequestException('path is required');
  }
  const parts = trimmed
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new BadRequestException('path escapes workspace');
  }
  return `/${parts.join('/')}`;
}
