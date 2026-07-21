import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { EntitlementsService } from '~/billing/entitlements.service';
import { ComputeProfile } from '~/billing/plan-catalog';
import { creditsPerMinute } from '~/billing/compute-pricing';
import { CreditService } from '~/credit';
import { v4 as uuidv4 } from 'uuid';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { EncryptionService } from '~/modules/encryption';
import {
  agentRunProgress,
  type AgentRunProgressEvent,
} from '~/agent/run-progress';

/** @deprecated Input compatibility only. All assigned computers are persistent. */
type LegacyComputerLifecycle = 'persistent' | 'ephemeral';
type ComputerResourceProfile = 'starter' | 'standard' | 'performance' | 'gpu';
type ComputerResourceMode = 'fixed' | 'elastic';
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
    podName?: string | null;
  } | null;
  desiredState?: 'running' | 'stopped';
  resources?: {
    profile?: ComputerResourceProfile;
    mode?: ComputerResourceMode;
    cpuRequest?: string;
    cpuLimit?: string;
    memoryRequest?: string;
    memoryLimit?: string;
    storageLimit?: string;
    gpuType?: string | null;
    gpuCount?: number;
    generation?: number;
  } | null;
  compute?: {
    tenantId?: string | null;
    cellId?: string | null;
    volumeId?: string | null;
    generation?: number;
  } | null;
  workspace?: {
    snapshot?: string | null;
    rootDir?: string | null;
    updatedAt?: string | null;
  } | null;
  browser?: ComputerInstance['browser'] | null;
  runtime?: Record<string, any> | null;
  lastHeartbeatAt?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
};

type CommonOsInstructionProgress = {
  status?: string;
  elapsedMs: number;
};

export type CommonOsRuntimeEvent = {
  id: string;
  type: string;
  payload: {
    msgId?: string;
    sessionId?: string | null;
    status?: string;
    delta?: string;
    tool?: string;
    label?: string;
  };
  createdAt?: string;
};

const COMPUTER_RESOURCE_PROFILES: Record<
  ComputerResourceProfile,
  {
    cpuRequest: string;
    cpuLimit: string;
    memoryRequest: string;
    memoryLimit: string;
    storageLimit: string;
    gpuType: string | null;
    gpuCount: number;
  }
> = {
  starter: {
    cpuRequest: '250m',
    cpuLimit: '1',
    memoryRequest: '512Mi',
    memoryLimit: '2Gi',
    storageLimit: '10Gi',
    gpuType: null,
    gpuCount: 0,
  },
  standard: {
    cpuRequest: '500m',
    cpuLimit: '2',
    memoryRequest: '1Gi',
    memoryLimit: '4Gi',
    storageLimit: '20Gi',
    gpuType: null,
    gpuCount: 0,
  },
  performance: {
    cpuRequest: '1',
    cpuLimit: '4',
    memoryRequest: '2Gi',
    memoryLimit: '8Gi',
    storageLimit: '50Gi',
    gpuType: null,
    gpuCount: 0,
  },
  gpu: {
    cpuRequest: '2',
    cpuLimit: '8',
    memoryRequest: '8Gi',
    memoryLimit: '32Gi',
    storageLimit: '100Gi',
    gpuType: 'nvidia-l4',
    gpuCount: 1,
  },
};

@Injectable()
export class ComputerService {
  private readonly logger = new Logger(ComputerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
    private readonly entitlements: EntitlementsService,
    private readonly credits: CreditService,
  ) {}

  /**
   * Plan gate shared with flows that create computer-backed agents (managed
   * runtimes). Throws a 402 `upgrade_required` when the owner's plan has no
   * computer access so clients can open the plans dialog.
   */
  async assertComputerPlan(
    ownerId: string | null | undefined,
    message = 'Agent computers require a paid plan. Upgrade to Plus or higher to use computer features.',
  ): Promise<void> {
    if (process.env.BILLING_ENFORCEMENT === 'false') return;
    if (!ownerId) return; // unowned/legacy agents are not gated
    const ent = await this.entitlements.getEntitlements(ownerId);
    if (!ent.computerUse) {
      throw new HttpException(
        {
          code: 'upgrade_required',
          feature: 'computer_use',
          message,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /**
   * Enforce the caller's subscription entitlements before starting a computer.
   * Free plans cannot use computers at all; paid plans are limited to their
   * allowed resource profiles and a max concurrent-computer count. Gated behind
   * BILLING_ENFORCEMENT so it can be rolled out independently.
   */
  private async assertComputeEntitlement(
    agent: {
      agentId: string;
      ownerUserId?: string | null;
      owner?: string | null;
    },
    resourceProfile: string,
    requireRuntimeCapacity = true,
  ): Promise<void> {
    if (process.env.BILLING_ENFORCEMENT === 'false') return;
    const ownerId = agent.ownerUserId ?? agent.owner;
    if (!ownerId) return; // unowned/legacy agents are not gated

    await this.assertComputerPlan(ownerId);
    const ent = await this.entitlements.getEntitlements(ownerId);
    if (!ent.allowedProfiles.includes(resourceProfile as ComputeProfile)) {
      throw new HttpException(
        {
          code: 'upgrade_required',
          feature: 'compute_profile',
          message: `The "${resourceProfile}" computer profile is not included in your plan. Upgrade for higher-tier compute.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    if (!requireRuntimeCapacity) return;
    const runningCount = await this.countRunningComputersForOwner(
      ownerId,
      agent.agentId,
    );
    if (runningCount >= ent.maxConcurrentComputers) {
      throw new HttpException(
        {
          code: 'limit_reached',
          feature: 'concurrent_computers',
          message: `Your plan allows ${ent.maxConcurrentComputers} concurrent computer(s). Stop one or upgrade.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    const balance = await this.credits.getBalance({ principalId: ownerId });
    const required = creditsPerMinute(resourceProfile);
    if (balance.available < required) {
      throw new HttpException(
        {
          code: 'insufficient_credits',
          feature: 'computer_use',
          message: `At least ${required} credits are required to wake this computer.`,
          available: balance.available,
          required,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private async countRunningComputersForOwner(
    ownerId: string,
    excludeAgentId?: string,
  ): Promise<number> {
    const rows = await this.db
      .select({ id: schema.agentComputerInstance.computerId })
      .from(schema.agentComputerInstance)
      .where(
        and(
          eq(schema.agentComputerInstance.ownerUserId, ownerId),
          inArray(schema.agentComputerInstance.status, ACTIVE_STATUSES),
          ...(excludeAgentId
            ? [ne(schema.agentComputerInstance.agentId, excludeAgentId)]
            : []),
        ),
      );
    return rows.length;
  }

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
        defaultMode: 'persistent',
        provider: 'commonos',
        resourceProfile: 'standard',
        resourceMode: 'elastic',
        ...COMPUTER_RESOURCE_PROFILES.standard,
      })
      .returning();
    return created;
  }

  toPublicConfig(config: ComputerConfig) {
    return {
      ...config,
      persistence: 'persistent' as const,
      autoWake: config.autoStart,
      allowAgentUse: config.allowAgentStart,
      resources: this.publicResources(config),
    };
  }

  toPublicComputer(computer: ComputerInstance | null, config: ComputerConfig) {
    if (!computer) return null;
    const sleeping =
      computer.desiredState === 'stopped' || computer.status === 'stopped';
    return {
      ...computer,
      enabled: config.enabled,
      persistence: 'persistent' as const,
      desiredState: !config.enabled
        ? ('disabled' as const)
        : sleeping
          ? ('sleeping' as const)
          : ('running' as const),
      status: sleeping ? ('sleeping' as const) : computer.status,
      resources: this.publicResources(computer),
      runtimeId: computer.commonOsAgentId,
      sleptAt: computer.stoppedAt,
    };
  }

  async updateConfig(
    agentId: string,
    patch: Partial<typeof schema.agentComputerConfig.$inferInsert>,
  ) {
    const agent = await this.assertAgent(agentId);
    const current = await this.getConfig(agentId);
    const next = this.normalizeConfigPatch(patch, current);
    if (next.enabled) {
      // A plain enable toggle (`{ enabled: true }`) carries no resourceProfile,
      // so validate against the effective profile — the one the computer will
      // actually run with — not the (possibly absent) patched value. Otherwise
      // the entitlement check receives `undefined` and reports the bogus
      // "undefined" computer profile even for a fully paid plan.
      await this.assertComputeEntitlement(
        agent,
        next.resourceProfile ?? current.resourceProfile,
        false,
      );
      if (!current.enabled) await this.assertComputerSlot(agent);
    }

    const [updated] = await this.db
      .update(schema.agentComputerConfig)
      .set({
        ...next,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerConfig.configId, current.configId))
      .returning();

    const computer = await this.getAssignedComputer(agentId);
    if (computer) {
      if (!updated.enabled) {
        if (ACTIVE_STATUSES.includes(computer.status as ComputerStatus)) {
          await this.stopComputer({
            agentId,
            computerId: computer.computerId,
            actorType: 'service',
          });
        }
      } else {
        await this.applyConfigToComputer(computer, updated);
      }
    }
    return updated;
  }

  private async assertComputerSlot(agent: {
    agentId: string;
    ownerUserId?: string | null;
    owner?: string | null;
  }) {
    if (process.env.BILLING_ENFORCEMENT === 'false') return;
    const ownerId = agent.ownerUserId ?? agent.owner;
    if (!ownerId) return;
    const ent = await this.entitlements.getEntitlements(ownerId);
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.agentComputerConfig)
      .innerJoin(
        schema.agent,
        eq(schema.agent.agentId, schema.agentComputerConfig.agentId),
      )
      .where(
        and(
          eq(schema.agentComputerConfig.enabled, true),
          or(
            eq(schema.agent.ownerUserId, ownerId),
            eq(schema.agent.owner, ownerId),
          ),
        ),
      );
    if (Number(row?.count ?? 0) >= ent.maxComputerAgents) {
      throw new HttpException(
        {
          code: 'limit_reached',
          feature: 'computer_agents',
          message: `Your plan includes ${ent.maxComputerAgents} persistent computer slot(s). Disable one or upgrade.`,
          limit: ent.maxComputerAgents,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async listInstances(args: {
    agentId: string;
    sessionId?: string;
    includeTerminated?: boolean;
  }) {
    const computer = await this.getAssignedComputer(args.agentId);
    if (!computer) return [];
    if (computer.commonOsAgentId) {
      await this.refreshInstance(computer.computerId, { silent: true }).catch(
        () => null,
      );
    }
    const refreshed = await this.getAssignedComputer(args.agentId);
    if (!refreshed) return [];
    if (!args.includeTerminated && refreshed.status === 'terminated') return [];
    return [refreshed];
  }

  async getAssignedComputer(agentId: string): Promise<ComputerInstance | null> {
    return (
      (await this.db.query.agentComputerInstance.findFirst({
        where: (t) => and(eq(t.agentId, agentId), eq(t.canonical, true)),
        orderBy: (t) => desc(t.createdAt),
      })) ?? null
    );
  }

  async getInstance(agentId: string, computerId: string) {
    const computer = await this.db.query.agentComputerInstance.findFirst({
      where: (t) =>
        and(
          eq(t.agentId, agentId),
          eq(t.computerId, computerId),
          eq(t.canonical, true),
        ),
    });
    if (!computer) throw new NotFoundException('Computer not found');
    return computer;
  }

  async startComputer(args: {
    agentId: string;
    sessionId?: string;
    /** @deprecated Computers are always persistent. */
    lifecycle?: LegacyComputerLifecycle;
    name?: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    reason?: string;
    runId?: string;
    toolCallId?: string;
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

    this.emitComputerToolProgress(args.runId, {
      toolName: 'startAgentComputer',
      stage: 'computer',
      status: 'running',
      message: 'Waking the agent computer',
      detail: 'Persistent workspace',
      payload: {
        lifecycle: 'persistent',
        sessionId,
        toolCallId: args.toolCallId,
      },
    });
    // Check plan, profile, concurrency, and a one-minute credit floor before
    // attaching to or waking any billable runtime.
    await this.assertComputeEntitlement(agent, config.resourceProfile);
    let computer = await this.getAssignedComputer(args.agentId);
    if (
      computer &&
      ACTIVE_STATUSES.includes(computer.status as ComputerStatus)
    ) {
      const refreshed = await this.refreshInstance(computer.computerId, {
        silent: true,
      }).catch(() => computer!);
      if (ACTIVE_STATUSES.includes(refreshed.status as ComputerStatus)) {
        await this.recordEvent({
          computerId: computer.computerId,
          agentId: args.agentId,
          sessionId,
          eventType: 'computer.attached',
          actorId: args.actorId,
          actorType: args.actorType,
          summary: 'Persistent computer attached',
          payload: { reason: args.reason },
        });
        this.emitComputerReady(
          args.runId,
          refreshed,
          args.toolCallId,
          'Agent computer attached',
        );
        return refreshed;
      }
      // The local row can lag an asynchronous pod failure. Continue into the
      // wake path with the refreshed state so a failed runtime is replaceable.
      computer = refreshed;
    }

    // Subscription gates apply when compute is provisioned or woken. Attaching
    // to the agent's healthy persistent computer stays on the fast path.
    const now = new Date();
    const name = args.name?.trim() || `${agent.name} computer`;
    if (!computer) {
      const [created] = await this.db
        .insert(schema.agentComputerInstance)
        .values({
          computerId: uuidv4(),
          agentId: args.agentId,
          sessionId: null,
          ownerUserId: agent.ownerUserId ?? agent.owner,
          workspaceId: agent.workspaceId,
          name,
          lifecycle: 'persistent',
          canonical: true,
          desiredState: 'running',
          status: 'provisioning',
          provider: config.provider,
          region: config.region,
          image: config.image,
          resourceProfile: config.resourceProfile,
          resourceMode: config.resourceMode,
          cpuRequest: config.cpuRequest,
          cpuLimit: config.cpuLimit,
          memoryRequest: config.memoryRequest,
          memoryLimit: config.memoryLimit,
          storageLimit: config.storageLimit,
          gpuType: config.gpuType,
          gpuCount: config.gpuCount,
          workspaceRoot: '/mnt/shared',
          expiresAt: null,
          lastActivityAt: now,
          metadata: {
            reason: args.reason,
            provisioner: 'commonos',
          },
        })
        .onConflictDoNothing()
        .returning();
      computer = created ?? (await this.getAssignedComputer(args.agentId));
    }
    if (!computer) {
      throw new Error('Could not create the agent computer record');
    }
    const computerId = computer.computerId;

    await this.recordEvent({
      computerId,
      agentId: args.agentId,
      sessionId,
      eventType: computer.commonOsAgentId
        ? 'computer.waking'
        : 'computer.provisioning',
      actorId: args.actorId,
      actorType: args.actorType,
      summary: computer.commonOsAgentId
        ? 'Computer wake requested'
        : 'Computer provisioning started',
      payload: { lifecycle: 'persistent', name, reason: args.reason },
    });

    this.emitComputerToolProgress(args.runId, {
      toolName: 'startAgentComputer',
      stage: 'computer',
      status: 'running',
      message: 'Requesting agent computer runtime',
      detail: name,
      payload: {
        progressId: computerId,
        computerId,
        lifecycle: 'persistent',
        name,
        toolCallId: args.toolCallId,
      },
    });
    const stopProvisioningHeartbeat = this.startRunProgressHeartbeat(
      args.runId,
      () => ({
        type: 'toolProgress',
        toolName: 'startAgentComputer',
        stage: 'computer',
        status: 'running',
        message: 'Booting agent computer',
        detail: `Persistent workspace - ${this.formatElapsed(Date.now() - now.getTime())}`,
        payload: {
          progressId: computerId,
          computerId,
          lifecycle: 'persistent',
          name,
          toolCallId: args.toolCallId,
        },
      }),
    );

    try {
      // The canonical POST is an idempotent upsert in CommonOS. Using it for
      // both first boot and wake keeps runtime adapter configuration in sync
      // (including OpenClaw ↔ Hermes switches) while preserving the volume.
      const provisioned = await this.deployWithCommonOs({
        agent,
        config,
        computer,
        name,
      });
      stopProvisioningHeartbeat();
      this.emitComputerReady(args.runId, provisioned, args.toolCallId);
      return provisioned;
    } catch (err: any) {
      stopProvisioningHeartbeat();
      const message = err instanceof Error ? err.message : String(err);
      await this.db
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
      this.emitComputerToolProgress(args.runId, {
        toolName: 'startAgentComputer',
        stage: 'computer',
        status: 'failed',
        message: 'Agent computer could not be started',
        detail: message,
        payload: {
          progressId: computerId,
          computerId,
          lifecycle: 'persistent',
          error: message,
          toolCallId: args.toolCallId,
        },
      });
      throw new ServiceUnavailableException(
        `Agent computer could not be started: ${message}`,
      );
    }
  }

  async stopComputer(args: {
    agentId: string;
    computerId: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
  }) {
    const computer = await this.getInstance(args.agentId, args.computerId);
    if (computer.status === 'stopped' && computer.desiredState === 'stopped') {
      return computer;
    }
    // Persist intent before the remote call. If CommonOS is temporarily
    // unavailable, metering can retry the stop without continuing to charge.
    await this.db
      .update(schema.agentComputerInstance)
      .set({
        status: 'stopping',
        desiredState: 'stopped',
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerInstance.computerId, args.computerId));
    if (computer.commonOsAgentId) {
      await this.commonOsComputerRequest<CommonOsAgent>(
        'PATCH',
        `/computers/${computer.commonOsAgentId}`,
        this.commonOsFleetId()
          ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}`
          : undefined,
        { desiredState: 'stopped' },
        args.agentId,
      );
    }

    const [updated] = await this.db
      .update(schema.agentComputerInstance)
      .set({
        status: 'stopped',
        desiredState: 'stopped',
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
      summary: 'Computer sleeping; persistent workspace retained',
    });
    return updated;
  }

  async stopAssignedComputer(args: {
    agentId: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
  }) {
    const computer = await this.getAssignedComputer(args.agentId);
    if (!computer) return null;
    return this.stopComputer({ ...args, computerId: computer.computerId });
  }

  async restartAssignedComputer(args: {
    agentId: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    reason?: string;
  }) {
    const computer = await this.getAssignedComputer(args.agentId);
    if (computer) {
      await this.stopComputer({ ...args, computerId: computer.computerId });
    }
    return this.startComputer({
      ...args,
      reason: args.reason ?? 'Computer restart requested',
    });
  }

  async runtimeChannelAction(args: {
    agentId: string;
    channel: 'telegram' | 'whatsapp' | 'slack' | 'discord';
    action: 'connect' | 'status' | 'disconnect' | 'approve' | 'test';
    pairingCode?: string;
    target?: string;
    message?: string;
  }) {
    let computer = await this.getAssignedComputer(args.agentId);
    if (!computer?.commonOsAgentId) {
      throw new BadRequestException('Managed runtime is not provisioned');
    }
    const commonOsAgentId = computer.commonOsAgentId;
    if (!['running', 'idle'].includes(String(computer.status))) {
      computer = await this.refreshInstance(computer.computerId, {
        silent: true,
      }).catch(() => computer);
    }
    // CommonOS inspects the channel sidecar directly and returns a transient
    // state until that container is ready. Model prewarming should not block
    // channel setup once the sidecar can already serve pairing requests.
    return this.commonOsComputerRequest<{
      output?: Record<string, unknown> | string;
      raw?: string;
    }>(
      'POST',
      `/computers/${commonOsAgentId}/runtime-channels/${args.channel}/${args.action}`,
      undefined,
      {
        ...(args.pairingCode ? { pairingCode: args.pairingCode } : {}),
        ...(args.target ? { target: args.target } : {}),
        ...(args.message ? { message: args.message } : {}),
      },
      args.agentId,
    );
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
      undefined,
      computer.agentId,
    );
    const reportedStatus = this.mapStatus(commonOs.status);
    const heartbeatAt = commonOs.lastHeartbeatAt
      ? new Date(commonOs.lastHeartbeatAt).getTime()
      : NaN;
    const runtimeStartedAt = commonOs.startedAt
      ? new Date(commonOs.startedAt).getTime()
      : NaN;
    const activeRuntimeIsStale =
      ['running', 'idle'].includes(reportedStatus) &&
      ((Number.isFinite(heartbeatAt) && Date.now() - heartbeatAt > 120_000) ||
        (!Number.isFinite(heartbeatAt) &&
          Number.isFinite(runtimeStartedAt) &&
          Date.now() - runtimeStartedAt > 300_000));
    const status = activeRuntimeIsStale ? 'failed' : reportedStatus;
    const [updated] = await this.db
      .update(schema.agentComputerInstance)
      .set({
        status,
        desiredState: commonOs.desiredState ?? computer.desiredState,
        cloudProvider: commonOs.pod?.provider ?? computer.cloudProvider,
        region: commonOs.pod?.region ?? computer.region,
        namespaceId: commonOs.pod?.namespaceId ?? computer.namespaceId,
        podName:
          commonOs.pod?.podName ??
          (commonOs.pod?.namespaceId
            ? `computer-${String(commonOs._id ?? computer.commonOsAgentId).replace(/_/g, '-')}`
            : computer.podName),
        resourceProfile:
          commonOs.resources?.profile ?? computer.resourceProfile,
        resourceMode: commonOs.resources?.mode ?? computer.resourceMode,
        cpuRequest: commonOs.resources?.cpuRequest ?? computer.cpuRequest,
        cpuLimit: commonOs.resources?.cpuLimit ?? computer.cpuLimit,
        memoryRequest:
          commonOs.resources?.memoryRequest ?? computer.memoryRequest,
        memoryLimit: commonOs.resources?.memoryLimit ?? computer.memoryLimit,
        storageLimit: commonOs.resources?.storageLimit ?? computer.storageLimit,
        gpuType: commonOs.resources?.gpuType ?? computer.gpuType,
        gpuCount: commonOs.resources?.gpuCount ?? computer.gpuCount,
        runtimeGeneration:
          commonOs.compute?.generation ??
          commonOs.resources?.generation ??
          computer.runtimeGeneration,
        persistentVolumeId:
          commonOs.compute?.volumeId ?? computer.persistentVolumeId,
        computeTenantId: commonOs.compute?.tenantId ?? computer.computeTenantId,
        computeCellId: commonOs.compute?.cellId ?? computer.computeCellId,
        workspaceRoot: commonOs.workspace?.rootDir ?? computer.workspaceRoot,
        workspaceSnapshot:
          commonOs.workspace?.snapshot ?? computer.workspaceSnapshot,
        browser: commonOs.browser ?? computer.browser,
        startedAt:
          commonOs.startedAt &&
          !Number.isNaN(new Date(commonOs.startedAt).getTime())
            ? new Date(commonOs.startedAt)
            : computer.startedAt,
        errorMessage: activeRuntimeIsStale
          ? 'The agent computer stopped responding and will be recovered when it is next started.'
          : (commonOs.pod?.lastError ?? null),
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

  async refreshForAgent(agentId: string, computerId: string) {
    await this.getInstance(agentId, computerId);
    return this.refreshInstance(computerId);
  }

  async readFile(args: {
    agentId: string;
    computerId?: string;
    sessionId?: string;
    path: string;
  }) {
    await this.assertCapability(args.agentId, 'filesystem');
    const computer = await this.resolveComputerForTool({
      agentId: args.agentId,
      computerId: args.computerId,
      sessionId: args.sessionId,
    });
    if (!computer.commonOsAgentId) {
      throw new BadRequestException(
        'Computer is not linked to a CommonOS runtime',
      );
    }
    const path = normalizeWorkspacePath(args.path);
    const data = await this.commonOsComputerRequest<{ content?: string }>(
      'GET',
      `/computers/${computer.commonOsAgentId}/workspace/read?path=${encodeURIComponent(path)}`,
      this.commonOsFleetId()
        ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}/workspace/read?path=${encodeURIComponent(path)}`
        : undefined,
      undefined,
      computer.agentId,
    );
    await this.touchComputer(computer.computerId);
    return { path, content: data.content ?? '' };
  }

  async writeFiles(args: {
    agentId: string;
    computerId?: string;
    sessionId?: string;
    files: Array<{ path: string; content: string }>;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    runId?: string;
    toolCallId?: string;
  }) {
    await this.assertCapability(args.agentId, 'filesystem');
    if (!Array.isArray(args.files) || args.files.length === 0) {
      throw new BadRequestException('files must contain at least one file');
    }
    if (args.files.length > 40) {
      throw new BadRequestException(
        'A single write can contain at most 40 files',
      );
    }
    let totalBytes = 0;
    const files = args.files.map((file) => {
      const path = normalizeWorkspacePath(file.path).replace(/^\//, '');
      if (typeof file.content !== 'string') {
        throw new BadRequestException(`File content must be text: ${path}`);
      }
      totalBytes += Buffer.byteLength(file.content);
      return { path, content: file.content };
    });
    if (totalBytes > 500_000) {
      throw new BadRequestException('A single write cannot exceed 500 KB');
    }
    const computer = await this.resolveComputerForTool({
      agentId: args.agentId,
      computerId: args.computerId,
      sessionId: args.sessionId,
    });
    const result = await this.sendInstruction({
      agentId: args.agentId,
      computerId: computer.computerId,
      sessionId: args.sessionId,
      eventType: 'workspace.write',
      summary: `Write ${files.length} file${files.length === 1 ? '' : 's'}`,
      instruction: [
        'Use cli_write_file to write every file below exactly as provided.',
        'Create parent directories as needed. Do not abbreviate, summarize, or replace file content with placeholders.',
        'After all writes, verify the paths with cli_list_directory and report any failure.',
        '',
        JSON.stringify(files),
      ].join('\n'),
      waitMs: 300_000,
      actorId: args.actorId,
      actorType: args.actorType,
      runId: args.runId,
      toolCallId: args.toolCallId,
    });
    return {
      ...result,
      computerId: computer.computerId,
      files: files.map((file) => file.path),
      bytes: totalBytes,
    };
  }

  async sendInstruction(args: {
    agentId: string;
    computerId: string;
    sessionId?: string;
    instruction: string;
    eventType: string;
    summary: string;
    waitMs?: number;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    runId?: string;
    toolCallId?: string;
    onRuntimeEvent?: (event: CommonOsRuntimeEvent) => void | Promise<void>;
  }) {
    const computer = await this.getInstance(args.agentId, args.computerId);
    this.assertComputerSessionCompatible(computer, args.sessionId);
    if (!computer.commonOsAgentId) {
      throw new BadRequestException(
        'Computer is not linked to a CommonOS runtime',
      );
    }
    const agentCommonsSessionId =
      args.sessionId ?? computer.sessionId ?? undefined;
    const commonOsSessionId =
      agentCommonsSessionId ?? (computer.metadata as any)?.commonOsSessionId;
    const progressId = uuidv4();
    const toolName = this.toolNameForComputerEvent(args.eventType);
    const stage = this.stageForComputerEvent(args.eventType);

    this.emitComputerToolProgress(args.runId, {
      toolName,
      stage,
      status: 'running',
      message: this.runningMessageForComputerEvent(args.eventType),
      detail: args.summary,
      payload: {
        progressId,
        computerId: computer.computerId,
        eventType: args.eventType,
        summary: args.summary,
        toolCallId: args.toolCallId,
      },
    });
    const submitStartedAt = Date.now();
    const stopSubmitHeartbeat = this.startRunProgressHeartbeat(
      args.runId,
      () => ({
        type: 'toolProgress',
        toolName,
        stage,
        status: 'running',
        message: this.submittingMessageForComputerEvent(args.eventType),
        detail: `${args.summary} - ${this.formatElapsed(Date.now() - submitStartedAt)}`,
        payload: {
          progressId,
          computerId: computer.computerId,
          eventType: args.eventType,
          summary: args.summary,
          toolCallId: args.toolCallId,
        },
      }),
    );

    let sent: any;
    try {
      sent = await this.commonOsComputerRequest<any>(
        'POST',
        `/computers/${computer.commonOsAgentId}/instructions`,
        this.commonOsFleetId()
          ? `/fleets/${this.commonOsFleetId()}/agents/${computer.commonOsAgentId}/human-message`
          : undefined,
        {
          content: args.instruction,
          ...(commonOsSessionId ? { sessionId: commonOsSessionId } : {}),
        },
        computer.agentId,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitComputerToolProgress(args.runId, {
        toolName,
        stage,
        status: 'failed',
        message: this.failedMessageForComputerEvent(args.eventType),
        detail: message,
        payload: {
          progressId,
          computerId: computer.computerId,
          eventType: args.eventType,
          summary: args.summary,
          error: message,
          toolCallId: args.toolCallId,
        },
      });
      throw error;
    } finally {
      stopSubmitHeartbeat();
    }

    await this.recordEvent({
      computerId: computer.computerId,
      agentId: computer.agentId,
      sessionId: agentCommonsSessionId,
      eventType: args.eventType,
      actorId: args.actorId,
      actorType: args.actorType,
      summary: args.summary,
      payload: {
        instruction: args.instruction,
        commonOsMessageId: sent?._id,
        commonOsSessionId: sent?.sessionId ?? commonOsSessionId ?? null,
      },
    });
    this.emitComputerToolProgress(args.runId, {
      toolName,
      stage,
      status: 'running',
      message: this.acceptedMessageForComputerEvent(args.eventType),
      detail: args.summary,
      payload: {
        progressId,
        computerId: computer.computerId,
        commonOsMessageId: sent?._id,
        commonOsSessionId: sent?.sessionId ?? commonOsSessionId ?? null,
        eventType: args.eventType,
        summary: args.summary,
        toolCallId: args.toolCallId,
      },
    });

    const response = await this.pollCommonOsMessage(
      computer.commonOsAgentId,
      computer.agentId,
      sent?._id,
      args.waitMs ?? 180_000,
      (progress) => {
        this.emitComputerToolProgress(args.runId, {
          toolName,
          stage,
          status: 'running',
          message: this.waitingMessageForComputerEvent(args.eventType),
          detail: `${args.summary} - ${(progress.status ?? 'pending').replace(/_/g, ' ')} - ${this.formatElapsed(progress.elapsedMs)}`,
          payload: {
            progressId,
            computerId: computer.computerId,
            commonOsMessageId: sent?._id,
            commonOsSessionId: sent?.sessionId ?? commonOsSessionId ?? null,
            commonOsStatus: progress.status,
            eventType: args.eventType,
            summary: args.summary,
            toolCallId: args.toolCallId,
          },
        });
      },
      args.onRuntimeEvent,
    );
    await this.touchComputer(computer.computerId);
    await this.refreshInstance(computer.computerId, { silent: true }).catch(
      () => null,
    );

    await this.recordEvent({
      computerId: computer.computerId,
      agentId: computer.agentId,
      sessionId: agentCommonsSessionId,
      eventType: `${args.eventType}.result`,
      actorId: args.actorId,
      actorType: args.actorType,
      summary:
        response.status === 'failed'
          ? 'Computer instruction failed'
          : 'Computer instruction completed',
      payload: response,
    });

    const failed =
      response.status === 'failed' || response.status === 'timeout';
    this.emitComputerToolProgress(args.runId, {
      toolName,
      stage,
      status: failed ? 'failed' : 'completed',
      message: failed
        ? this.failedMessageForComputerEvent(args.eventType)
        : this.completedMessageForComputerEvent(args.eventType),
      detail: this.summarizeComputerResponse(response) ?? args.summary,
      payload: {
        progressId,
        computerId: computer.computerId,
        commonOsMessageId: sent?._id,
        status: response.status,
        responsePreview: this.summarizeComputerResponse(response),
        error: response.error ?? null,
        eventType: args.eventType,
        summary: args.summary,
        toolCallId: args.toolCallId,
      },
    });

    return response;
  }

  async runCommand(args: {
    agentId: string;
    computerId?: string;
    sessionId?: string;
    command: string;
    cwd?: string;
    timeoutSeconds?: number;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    runId?: string;
    toolCallId?: string;
  }) {
    await this.assertCapability(args.agentId, 'terminal');
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
      'If this command starts a dev server or another long-running process, keep it running and return the process id plus recent logs instead of waiting forever.',
      'Do not run unrelated commands unless needed to report a precise failure.',
      `Working directory: ${cwd}`,
      `Timeout seconds: ${timeoutSeconds}`,
      '',
      '```sh',
      command,
      '```',
    ].join('\n');

    const computer = await this.resolveComputerForTool({
      agentId: args.agentId,
      computerId: args.computerId,
      sessionId: args.sessionId,
    });

    const result = await this.sendInstruction({
      agentId: args.agentId,
      computerId: computer.computerId,
      sessionId: args.sessionId,
      instruction,
      eventType: 'terminal.command',
      summary: command.slice(0, 180),
      waitMs: (timeoutSeconds + 120) * 1000,
      actorId: args.actorId,
      actorType: args.actorType,
      runId: args.runId,
      toolCallId: args.toolCallId,
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
      .where(eq(schema.agentComputerInstance.computerId, computer.computerId));

    return result;
  }

  async openBrowser(args: {
    agentId: string;
    computerId?: string;
    sessionId?: string;
    url: string;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    runId?: string;
    toolCallId?: string;
  }) {
    const config = await this.assertCapability(args.agentId, 'browser');
    if (config.networkAccess === 'disabled') {
      throw new BadRequestException(
        'Network access is disabled for this computer',
      );
    }
    const url = args.url.trim();
    if (!/^https?:\/\//i.test(url) && !/^http:\/\/localhost[:/]/i.test(url)) {
      throw new BadRequestException('url must start with http:// or https://');
    }
    const computerForTool = await this.resolveComputerForTool({
      agentId: args.agentId,
      computerId: args.computerId,
      sessionId: args.sessionId,
    });

    const result = await this.sendInstruction({
      agentId: args.agentId,
      computerId: computerForTool.computerId,
      sessionId: args.sessionId,
      instruction: [
        'Use this computer browser.',
        `Open ${url}.`,
        'Use browser_wait, browser_inspect, and browser_screenshot after loading.',
        'Report the page title, current URL, rendered content, and every console, page, network, framework-overlay, or runtime error.',
        'Treat any detected error or blank application root as a failed check; do not describe the page as working.',
      ].join('\n'),
      eventType: 'browser.open',
      summary: `Open ${url}`,
      waitMs: 180_000,
      actorId: args.actorId,
      actorType: args.actorType,
      runId: args.runId,
      toolCallId: args.toolCallId,
    });
    const computer = await this.refreshInstance(computerForTool.computerId, {
      silent: true,
    });
    return { ...result, browser: computer.browser };
  }

  async testBrowser(args: {
    agentId: string;
    computerId?: string;
    sessionId?: string;
    url?: string;
    actions?: Array<{
      type: 'click' | 'type' | 'select' | 'press' | 'expectText';
      selector?: string;
      text?: string;
      value?: string;
      key?: string;
    }>;
    actorId?: string;
    actorType?: 'user' | 'agent' | 'service';
    runId?: string;
    toolCallId?: string;
  }) {
    await this.assertCapability(args.agentId, 'browser');
    const computerForTool = await this.resolveComputerForTool({
      agentId: args.agentId,
      computerId: args.computerId,
      sessionId: args.sessionId,
    });
    const actions = (args.actions ?? []).slice(0, 20);
    const result = await this.sendInstruction({
      agentId: args.agentId,
      computerId: computerForTool.computerId,
      sessionId: args.sessionId,
      instruction: [
        'Test the application in this computer browser like a careful human developer.',
        args.url ? `Open ${args.url} first.` : 'Use the currently open page.',
        'Wait until the page is interactive. Use browser_inspect and browser_eval to inspect rendered text, the application root, runtime overlays, console errors, page errors, and failed requests.',
        actions.length
          ? `Perform these actions in order and verify their effects:\n${JSON.stringify(actions, null, 2)}`
          : 'Exercise the primary visible interaction when it is safe and reversible.',
        'Capture a final browser screenshot.',
        'Return a concise test report with passed checks, failed checks, current URL/title, diagnostics, and screenshot status.',
        'Any console error, page error, failed framework overlay, blank app root, broken interaction, or failed required request means the test failed. Never claim success while one remains.',
      ].join('\n'),
      eventType: 'browser.test',
      summary: `Test ${args.url ?? 'current browser page'}`,
      waitMs: 300_000,
      actorId: args.actorId,
      actorType: args.actorType,
      runId: args.runId,
      toolCallId: args.toolCallId,
    });
    const computer = await this.refreshInstance(computerForTool.computerId, {
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
    const computer = computers[0];
    const line = computer
      ? `- ${computer.name} (${computer.computerId}) persistent/${computer.status}${computer.browser?.url ? ` browser=${computer.browser.url}` : ''}`
      : '- The persistent computer has not been provisioned yet.';

    return [
      '### Persistent computer',
      'This agent can have exactly one isolated CommonOS computer. Its workspace persists across chats and pod restarts.',
      `Computer use is ${config.allowAgentStart ? 'agent-wakeable' : 'user-wake only'}; resource profile is ${config.resourceProfile}/${config.resourceMode}.`,
      'Use startAgentComputer to wake or attach the assigned computer before computer work. It is idempotent and never creates an extra computer. Use writeComputerFiles for complete source files, runComputerCommand for finite terminal work, readComputerFile for files, and testComputerBrowser for application verification.',
      'Never encode source files in shell heredocs or long commands. writeComputerFiles is the reliable structured file-writing path.',
      'Always keep commands scoped to the task, avoid secrets exfiltration, and summarize created files/screenshots/results for the user.',
      'Assigned computer:',
      line,
    ].join('\n');
  }

  private emitComputerToolProgress(
    runId: string | undefined,
    event: Omit<AgentRunProgressEvent, 'type'> & {
      type?: AgentRunProgressEvent['type'];
    },
  ) {
    agentRunProgress.emit(runId, {
      ...event,
      type: event.type ?? 'toolProgress',
    });
  }

  private startRunProgressHeartbeat(
    runId: string | undefined,
    buildEvent: () => AgentRunProgressEvent,
    intervalMs = 5_000,
  ) {
    if (!runId) return () => undefined;
    const interval = setInterval(() => {
      agentRunProgress.emit(runId, buildEvent());
    }, intervalMs);
    return () => clearInterval(interval);
  }

  private toolNameForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') return 'runComputerCommand';
    if (eventType === 'browser.open') return 'openComputerBrowser';
    if (eventType === 'browser.test') return 'testComputerBrowser';
    if (eventType === 'workspace.write') return 'writeComputerFiles';
    return 'startAgentComputer';
  }

  private stageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') return 'computer_terminal';
    if (eventType === 'browser.open') return 'computer_browser';
    if (eventType === 'browser.test') return 'computer_browser_test';
    if (eventType === 'workspace.write') return 'computer_files';
    return 'computer';
  }

  private runningMessageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') return 'Running terminal command';
    if (eventType === 'browser.open') return 'Opening browser';
    return 'Using agent computer';
  }

  private submittingMessageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') {
      return 'Sending terminal command to agent computer';
    }
    if (eventType === 'browser.open') {
      return 'Sending browser action to agent computer';
    }
    return 'Sending instruction to agent computer';
  }

  private acceptedMessageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') {
      return 'Terminal command accepted';
    }
    if (eventType === 'browser.open') {
      return 'Browser action accepted';
    }
    return 'Computer instruction accepted';
  }

  private waitingMessageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') {
      return 'Terminal command still running';
    }
    if (eventType === 'browser.open') {
      return 'Browser action still running';
    }
    return 'Computer instruction still running';
  }

  private completedMessageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') {
      return 'Terminal command finished';
    }
    if (eventType === 'browser.open') {
      return 'Browser updated';
    }
    return 'Computer instruction completed';
  }

  private failedMessageForComputerEvent(eventType: string) {
    if (eventType === 'terminal.command') {
      return 'Terminal command failed';
    }
    if (eventType === 'browser.open') {
      return 'Browser action failed';
    }
    return 'Computer instruction failed';
  }

  private summarizeComputerResponse(response: any) {
    const text = String(response?.error ?? response?.response ?? '').trim();
    if (!text) return undefined;
    return text.replace(/\s+/g, ' ').slice(0, 220);
  }

  private formatElapsed(ms: number) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return `${seconds}s elapsed`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining
      ? `${minutes}m ${remaining}s elapsed`
      : `${minutes}m elapsed`;
  }

  private emitComputerReady(
    runId: string | undefined,
    computer: ComputerInstance,
    toolCallId?: string,
    message = 'Agent computer is ready',
  ) {
    this.emitComputerToolProgress(runId, {
      toolName: 'startAgentComputer',
      stage: 'computer',
      status: 'completed',
      message,
      detail: computer.name ?? computer.computerId,
      payload: {
        progressId: computer.computerId,
        computerId: computer.computerId,
        commonOsAgentId: computer.commonOsAgentId,
        status: computer.status,
        lifecycle: 'persistent',
        toolCallId,
      },
    });
  }

  private async deployWithCommonOs(args: {
    agent: typeof schema.agent.$inferSelect;
    config: ComputerConfig;
    computer: ComputerInstance;
    name: string;
  }) {
    if (!this.commonOsConfigured()) {
      throw new Error(
        'CommonOS computer API is not configured. Set COMMON_OS_API_URL and COMMON_OS_API_KEY.',
      );
    }

    const runtimeType = String(args.agent.runtimeType ?? 'native');
    const integrationPath =
      runtimeType === 'openclaw' || runtimeType === 'hermes'
        ? runtimeType
        : runtimeType === 'custom'
          ? 'guest'
          : 'native';
    const modelApiKey = this.decryptStoredSecret(args.agent.modelApiKey);
    const runtimeConfig = (args.agent.runtimeConfig ?? {}) as Record<
      string,
      any
    >;
    const runtimeChannels = this.runtimeChannels(args.agent);
    const commonOsAgent = await this.commonOsComputerRequest<CommonOsAgent>(
      'POST',
      '/computers',
      undefined,
      {
        name: args.name,
        role: args.name,
        systemPrompt: this.commonOsSystemPrompt(args.agent),
        permissionTier: 'worker',
        room: 'dev-room',
        integrationPath,
        nativeConfig:
          integrationPath === 'native'
            ? {
                modelProvider: args.agent.modelProvider,
                modelId: args.agent.modelId,
                ...(modelApiKey ? { modelApiKey } : {}),
              }
            : undefined,
        openclawConfig:
          integrationPath === 'openclaw'
            ? {
                modelProvider: args.agent.modelProvider,
                modelId: args.agent.modelId,
                ...(modelApiKey ? { modelApiKey } : {}),
                channels: runtimeChannels,
                plugins: runtimeConfig.enabledPlugins ?? [],
                dmPolicy: runtimeConfig.channelPolicy ?? 'pairing',
              }
            : undefined,
        hermesConfig:
          integrationPath === 'hermes'
            ? {
                modelProvider: args.agent.modelProvider,
                modelId: args.agent.modelId,
                ...(modelApiKey ? { modelApiKey } : {}),
                toolsets: runtimeConfig.enabledToolsets ?? [],
                channels: runtimeChannels,
              }
            : undefined,
        ...(args.config.image ? { dockerImage: args.config.image } : {}),
        agentCommonsId: args.agent.agentId,
        agentCommonsApiUrl:
          process.env.AGENT_COMMONS_API_URL ||
          process.env.AGENTCOMMONS_API_URL ||
          undefined,
        computerId: args.computer.computerId,
        ownerUserId: args.agent.ownerUserId ?? args.agent.owner,
        workspaceId: args.agent.workspaceId,
        resources: this.commonOsResources(args.config),
        resourceProfile: args.config.resourceProfile,
        resourceMode: args.config.resourceMode,
        idleTtlMinutes: args.config.idleTtlMinutes,
        policy: {
          allowBrowser: args.config.allowBrowser,
          allowTerminal: args.config.allowTerminal,
          allowFilesystem: args.config.allowFilesystem,
          networkAccess: args.config.networkAccess,
        },
      },
      args.agent.agentId,
    );

    const commonOsAgentId = String(commonOsAgent._id ?? commonOsAgent.id ?? '');
    if (!commonOsAgentId) {
      throw new Error('CommonOS did not return an agent id');
    }

    const [updated] = await this.db
      .update(schema.agentComputerInstance)
      .set({
        status: this.mapStatus(commonOsAgent.status),
        desiredState: commonOsAgent.desiredState ?? 'running',
        commonOsFleetId: null,
        commonOsAgentId,
        cloudProvider: commonOsAgent.pod?.provider,
        region: commonOsAgent.pod?.region ?? args.config.region,
        namespaceId: commonOsAgent.pod?.namespaceId ?? null,
        podName:
          commonOsAgent.pod?.podName ??
          (commonOsAgent.pod?.namespaceId
            ? `computer-${commonOsAgentId.replace(/_/g, '-')}`
            : null),
        resourceProfile:
          commonOsAgent.resources?.profile ?? args.config.resourceProfile,
        resourceMode: commonOsAgent.resources?.mode ?? args.config.resourceMode,
        cpuRequest:
          commonOsAgent.resources?.cpuRequest ?? args.config.cpuRequest,
        cpuLimit: commonOsAgent.resources?.cpuLimit ?? args.config.cpuLimit,
        memoryRequest:
          commonOsAgent.resources?.memoryRequest ?? args.config.memoryRequest,
        memoryLimit:
          commonOsAgent.resources?.memoryLimit ?? args.config.memoryLimit,
        storageLimit:
          commonOsAgent.resources?.storageLimit ?? args.config.storageLimit,
        gpuType: commonOsAgent.resources?.gpuType ?? args.config.gpuType,
        gpuCount: commonOsAgent.resources?.gpuCount ?? args.config.gpuCount,
        runtimeGeneration:
          commonOsAgent.compute?.generation ??
          commonOsAgent.resources?.generation ??
          args.computer.runtimeGeneration + 1,
        persistentVolumeId:
          commonOsAgent.compute?.volumeId ?? args.computer.persistentVolumeId,
        computeTenantId:
          commonOsAgent.compute?.tenantId ?? args.computer.computeTenantId,
        computeCellId:
          commonOsAgent.compute?.cellId ?? args.computer.computeCellId,
        workspaceRoot: commonOsAgent.workspace?.rootDir ?? '/mnt/shared',
        workspaceSnapshot: commonOsAgent.workspace?.snapshot ?? null,
        browser: commonOsAgent.browser ?? null,
        errorMessage: commonOsAgent.pod?.lastError ?? null,
        startedAt: commonOsAgent.startedAt
          ? new Date(commonOsAgent.startedAt)
          : new Date(),
        updatedAt: new Date(),
      })
      .where(
        eq(schema.agentComputerInstance.computerId, args.computer.computerId),
      )
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

  private decryptStoredSecret(value?: string | null): string | undefined {
    if (!value) return undefined;
    if (!value.startsWith('enc:')) return value;
    const [, iv, tag, encryptedValue] = value.split(':');
    if (!iv || !tag || !encryptedValue) {
      throw new Error('Stored model API key is malformed');
    }
    return this.encryption.decrypt(encryptedValue, iv, tag);
  }

  private runtimeChannels(agent: typeof schema.agent.$inferSelect) {
    const config = (agent.runtimeConfig ?? {}) as Record<string, any>;
    const storedSecrets = (agent.runtimeSecrets ?? {}) as Record<
      string,
      Record<string, string>
    >;
    const result: Record<string, Record<string, unknown>> = {};
    for (const [id, rawChannel] of Object.entries(
      (config.channels ?? {}) as Record<string, Record<string, unknown>>,
    )) {
      if (!rawChannel?.enabled) continue;
      const credentials = Object.fromEntries(
        Object.entries(storedSecrets[id] ?? {}).flatMap(([field, value]) => {
          const decrypted = this.decryptStoredSecret(value);
          return decrypted ? [[field, decrypted]] : [];
        }),
      );
      result[id] = {
        enabled: true,
        mode: rawChannel.mode,
        dmPolicy: rawChannel.dmPolicy ?? config.channelPolicy ?? 'pairing',
        allowFrom: Array.isArray(rawChannel.allowFrom)
          ? rawChannel.allowFrom
          : [],
        requireMention: rawChannel.requireMention !== false,
        homeTarget: rawChannel.homeTarget,
        ...credentials,
      };
    }
    return result;
  }

  private async pollCommonOsMessage(
    commonOsAgentId: string,
    agentCommonsId: string,
    messageId: string | undefined,
    waitMs: number,
    onProgress?: (progress: CommonOsInstructionProgress) => void,
    onRuntimeEvent?: (event: CommonOsRuntimeEvent) => void | Promise<void>,
  ) {
    if (!messageId) {
      return { status: 'submitted', response: null, error: null };
    }
    const started = Date.now();
    let lastProgressAt = 0;
    let lastStatus = '';
    // Fast turns never need a heartbeat check — the first one only fires
    // after 30s of waiting.
    let lastHeartbeatCheckAt = started;
    let staleHeartbeatMs = 0;
    const observedEventIds = new Set<string>();
    let lastEventAt: string | undefined;
    let lastEventId: string | undefined;
    let snapshotSupported = true;
    const forwardEvents = async (runtimeEvents: any[]) => {
      for (const event of runtimeEvents) {
        const id = String(event?._id ?? event?.id ?? '');
        if (!id || observedEventIds.has(id)) continue;
        observedEventIds.add(id);
        const createdAt = event?.createdAt
          ? new Date(event.createdAt).toISOString()
          : undefined;
        if (createdAt) {
          lastEventAt = createdAt;
          lastEventId = id;
        }
        if (onRuntimeEvent) {
          await onRuntimeEvent({
            id,
            type: String(event?.type ?? ''),
            payload: (event?.payload ?? {}) as CommonOsRuntimeEvent['payload'],
            createdAt,
          });
        }
      }
    };
    while (Date.now() - started < Math.min(waitMs, 720_000)) {
      // A wedged runtime daemon keeps its pod Running while heartbeats,
      // message polling, and event emission all stop — without this check
      // the run would sit silent until waitMs expires. kubelet's liveness
      // probe restarts such a daemon and the control plane re-queues the
      // instruction, so report recovery progress and only abort once the
      // heartbeat has been stale far beyond the restart+reclaim window.
      if (Date.now() - lastHeartbeatCheckAt >= 30_000) {
        lastHeartbeatCheckAt = Date.now();
        const runtimeDoc = await this.commonOsComputerRequest<{
          lastHeartbeatAt?: string | null;
        }>(
          'GET',
          `/computers/${commonOsAgentId}`,
          undefined,
          undefined,
          agentCommonsId,
        ).catch(() => null);
        const heartbeatAt = runtimeDoc?.lastHeartbeatAt
          ? new Date(runtimeDoc.lastHeartbeatAt).getTime()
          : NaN;
        staleHeartbeatMs = Number.isFinite(heartbeatAt)
          ? Math.max(0, Date.now() - heartbeatAt)
          : staleHeartbeatMs;
        if (staleHeartbeatMs > 360_000) {
          return {
            status: 'failed',
            response: null,
            error:
              'The agent runtime stopped responding (no heartbeat for over 6 minutes) and did not recover after an automatic restart. Restart the runtime and try again.',
            commonOsMessageId: messageId,
          };
        }
        if (staleHeartbeatMs > 90_000 && onProgress) {
          lastProgressAt = Date.now();
          onProgress({
            status: 'runtime_recovering',
            elapsedMs: Date.now() - started,
          });
        }
      }
      let message: any;
      if (this.commonOsUseGeneralComputerApi()) {
        if (snapshotSupported) {
          const suffix = lastEventAt
            ? `?after=${encodeURIComponent(lastEventAt)}${lastEventId ? `&afterId=${encodeURIComponent(lastEventId)}` : ''}`
            : '';
          try {
            const snapshot = await this.commonOsComputerRequest<{
              message?: any;
              events?: any[];
            }>(
              'GET',
              `/computers/${commonOsAgentId}/instructions/${messageId}/snapshot${suffix}`,
              undefined,
              undefined,
              agentCommonsId,
            );
            message = snapshot.message;
            await forwardEvents(snapshot.events ?? []);
          } catch (error) {
            snapshotSupported = false;
            this.logger.warn(
              `CommonOS instruction snapshot is unavailable; using compatibility polling: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        if (!snapshotSupported) {
          const [list, runtimeEvents] = await Promise.all([
            this.commonOsComputerRequest<any[]>(
              'GET',
              `/computers/${commonOsAgentId}/instructions`,
              undefined,
              undefined,
              agentCommonsId,
            ),
            this.commonOsComputerRequest<any[]>(
              'GET',
              `/computers/${commonOsAgentId}/instructions/${messageId}/events`,
              undefined,
              undefined,
              agentCommonsId,
            ),
          ]);
          message = list.find((item) => item._id === messageId);
          await forwardEvents(runtimeEvents);
        }
      } else {
        const list = await this.commonOsComputerRequest<any[]>(
          'GET',
          `/computers/${commonOsAgentId}/instructions`,
          this.commonOsFleetId()
            ? `/fleets/${this.commonOsFleetId()}/agents/${commonOsAgentId}/human-messages`
            : undefined,
          undefined,
          agentCommonsId,
        );
        message = list.find((item) => item._id === messageId);
      }
      const status = String(message?.status ?? 'pending');
      const now = Date.now();
      if (
        onProgress &&
        (status !== lastStatus || now - lastProgressAt >= 5_000)
      ) {
        lastStatus = status;
        lastProgressAt = now;
        onProgress({
          status,
          elapsedMs: now - started,
        });
      }
      if (message?.response || message?.status === 'failed') {
        return {
          status: message.status,
          response: message.response ?? null,
          error: message.error ?? null,
          usage: message.usage ?? null,
          respondedAt: message.respondedAt ?? null,
          commonOsMessageId: messageId,
        };
      }
      const elapsed = Date.now() - started;
      await new Promise((resolve) =>
        setTimeout(resolve, elapsed < 15_000 ? 350 : 800),
      );
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
    agentCommonsId?: string,
  ): Promise<T> {
    if (this.commonOsUseGeneralComputerApi()) {
      try {
        return await this.commonOsRequest<T>(
          method,
          computerPath,
          body,
          agentCommonsId,
        );
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
    return this.commonOsRequest<T>(
      method,
      legacyFleetPath,
      body,
      agentCommonsId,
    );
  }

  private async commonOsRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
    agentCommonsId?: string,
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
        ...(agentCommonsId
          ? { 'x-agent-commons-agent-id': agentCommonsId }
          : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      throw new Error(
        payload?.error ||
          payload?.message ||
          `CommonOS ${method} ${path} failed with ${response.status}`,
      );
    }
    return response.json() as Promise<T>;
  }

  private async resolveComputerForTool(args: {
    agentId: string;
    computerId?: string | null;
    sessionId?: string | null;
  }): Promise<ComputerInstance> {
    const requestedId = args.computerId?.trim();
    if (requestedId) {
      const computer = await this.getInstance(args.agentId, requestedId);
      if (!ACTIVE_STATUSES.includes(computer.status as ComputerStatus)) {
        throw new BadRequestException(
          'The agent computer is sleeping. Wake it before using computer tools.',
        );
      }
      return computer;
    }

    const computers = await this.listInstances({
      agentId: args.agentId,
      sessionId: args.sessionId ?? undefined,
      includeTerminated: false,
    });
    const usable = computers.filter(
      (computer) =>
        ACTIVE_STATUSES.includes(computer.status as ComputerStatus) &&
        Boolean(computer.commonOsAgentId),
    );
    const selected = usable[0];
    if (!selected) {
      throw new BadRequestException(
        'The agent computer is not running. Wake it before using computer tools.',
      );
    }
    return selected;
  }

  private assertComputerSessionCompatible(
    computer: ComputerInstance,
    sessionId?: string | null,
  ) {
    // Persistent computers belong to agents, not chat sessions. Keep this
    // method as a no-op while older call sites and records are migrated.
    void computer;
    void sessionId;
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
      where: (t) =>
        and(eq(t.sessionId, sessionId as any), eq(t.agentId, agentId)),
    });
    if (!session) {
      throw new BadRequestException(
        'sessionId must reference an existing session for this agent',
      );
    }
  }

  private normalizeConfigPatch(
    patch: Partial<typeof schema.agentComputerConfig.$inferInsert>,
    current?: ComputerConfig,
  ) {
    const source: Record<string, any> = {
      ...(patch as Record<string, any>),
      ...((patch as any).autoWake !== undefined
        ? { autoStart: Boolean((patch as any).autoWake) }
        : {}),
      ...((patch as any).allowAgentUse !== undefined
        ? { allowAgentStart: Boolean((patch as any).allowAgentUse) }
        : {}),
    };
    const normalized: Record<string, any> = {};
    const allowed = [
      'enabled',
      'autoStart',
      'allowAgentStart',
      'allowUserSelect',
      'allowBrowser',
      'allowTerminal',
      'allowFilesystem',
      'networkAccess',
      'idleTtlMinutes',
      'image',
      'resourceProfile',
      'resourceMode',
      'cpuRequest',
      'cpuLimit',
      'memoryRequest',
      'memoryLimit',
      'storageLimit',
      'gpuType',
      'gpuCount',
      'region',
      'metadata',
    ];
    for (const key of allowed) {
      if (source[key] !== undefined) normalized[key] = source[key];
    }

    normalized.defaultMode = 'persistent';
    normalized.maxPersistentComputers = 1;
    normalized.maxEphemeralComputers = 0;
    normalized.maxConcurrentComputers = 1;

    if (normalized.resourceProfile !== undefined) {
      if (!(normalized.resourceProfile in COMPUTER_RESOURCE_PROFILES)) {
        throw new BadRequestException(
          'resourceProfile must be starter, standard, performance, or gpu',
        );
      }
      Object.assign(
        normalized,
        COMPUTER_RESOURCE_PROFILES[
          normalized.resourceProfile as ComputerResourceProfile
        ],
      );
    }

    const resources = (patch as any).resources as
      | {
          vcpu?: number;
          memoryGiB?: number;
          storageGiB?: number;
          gpu?: { count?: number; type?: string } | null;
        }
      | undefined;
    if (resources) {
      if (resources.vcpu !== undefined) {
        const value = Number(resources.vcpu);
        if (!Number.isFinite(value) || value <= 0 || value > 32) {
          throw new BadRequestException(
            'resources.vcpu must be between 0 and 32',
          );
        }
        normalized.cpuLimit = String(value);
      }
      if (resources.memoryGiB !== undefined) {
        const value = Number(resources.memoryGiB);
        if (!Number.isFinite(value) || value <= 0 || value > 128) {
          throw new BadRequestException(
            'resources.memoryGiB must be between 0 and 128',
          );
        }
        normalized.memoryLimit = `${value}Gi`;
      }
      if (resources.storageGiB !== undefined) {
        const value = Number(resources.storageGiB);
        if (!Number.isFinite(value) || value < 10 || value > 2048) {
          throw new BadRequestException(
            'resources.storageGiB must be between 10 and 2048',
          );
        }
        normalized.storageLimit = `${value}Gi`;
      }
      if (resources.gpu !== undefined) {
        const count = resources.gpu ? Number(resources.gpu.count ?? 1) : 0;
        if (!Number.isInteger(count) || count < 0 || count > 8) {
          throw new BadRequestException(
            'resources.gpu.count must be an integer between 0 and 8',
          );
        }
        normalized.gpuCount = count;
        normalized.gpuType =
          count > 0 ? (resources.gpu?.type ?? 'nvidia-l4') : null;
      }
    }

    if (normalized.resourceMode !== undefined) {
      normalized.resourceMode =
        normalized.resourceMode === 'fixed' ? 'fixed' : 'elastic';
    }
    if (normalized.resourceMode === 'fixed') {
      normalized.cpuRequest = normalized.cpuLimit ?? current?.cpuLimit;
      normalized.memoryRequest = normalized.memoryLimit ?? current?.memoryLimit;
    }

    if (normalized.networkAccess !== undefined) {
      if (
        !['standard', 'restricted', 'disabled'].includes(
          normalized.networkAccess,
        )
      ) {
        throw new BadRequestException(
          'networkAccess must be standard, restricted, or disabled',
        );
      }
    }

    if (normalized.idleTtlMinutes !== undefined) {
      normalized.idleTtlMinutes = Math.max(
        5,
        Math.min(Number(normalized.idleTtlMinutes) || 60, 24 * 60),
      );
    }

    const nextStorage = normalized.storageLimit ?? current?.storageLimit;
    if (
      current?.storageLimit &&
      nextStorage &&
      this.storageGiB(nextStorage) < this.storageGiB(current.storageLimit)
    ) {
      if (normalized.resourceProfile !== undefined) {
        // A smaller compute profile never shrinks or destroys the existing
        // workspace. The retained capacity may be billed as storage overage.
        normalized.storageLimit = current.storageLimit;
      } else {
        throw new BadRequestException(
          'Persistent storage cannot be reduced. Choose the current size or a larger value.',
        );
      }
    }

    return Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined),
    );
  }

  private commonOsResources(config: ComputerConfig) {
    return {
      vcpu: this.cpuCores(config.cpuLimit),
      memoryGiB: this.gibibytes(config.memoryLimit),
      storageGiB: this.gibibytes(config.storageLimit),
      gpu:
        Number(config.gpuCount ?? 0) > 0
          ? {
              count: Number(config.gpuCount),
              ...(config.gpuType ? { type: config.gpuType } : {}),
            }
          : null,
    };
  }

  private publicResources(resource: {
    cpuLimit?: string | null;
    memoryLimit?: string | null;
    storageLimit?: string | null;
    gpuType?: string | null;
    gpuCount?: number | null;
  }) {
    return {
      vcpu: this.cpuCores(resource.cpuLimit),
      memoryGiB: this.gibibytes(resource.memoryLimit),
      storageGiB: this.gibibytes(resource.storageLimit),
      gpu:
        Number(resource.gpuCount ?? 0) > 0
          ? {
              count: Number(resource.gpuCount),
              ...(resource.gpuType ? { type: resource.gpuType } : {}),
            }
          : null,
    };
  }

  private cpuCores(value?: string | null) {
    const text = String(value ?? '0').trim();
    if (text.endsWith('m')) return Number(text.slice(0, -1)) / 1000;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private gibibytes(value?: string | null) {
    const match = String(value ?? '0')
      .trim()
      .match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti)?$/i);
    if (!match) return 0;
    const amount = Number(match[1]);
    switch ((match[2] ?? 'Gi').toLowerCase()) {
      case 'ki':
        return amount / (1024 * 1024);
      case 'mi':
        return amount / 1024;
      case 'ti':
        return amount * 1024;
      default:
        return amount;
    }
  }

  private async applyConfigToComputer(
    computer: ComputerInstance,
    config: ComputerConfig,
  ) {
    let commonOs: CommonOsAgent | null = null;
    if (computer.commonOsAgentId) {
      commonOs = await this.commonOsComputerRequest<CommonOsAgent>(
        'PATCH',
        `/computers/${computer.commonOsAgentId}`,
        undefined,
        {
          resourceProfile: config.resourceProfile,
          resourceMode: config.resourceMode,
          resources: this.commonOsResources(config),
          idleTtlMinutes: config.idleTtlMinutes,
          policy: {
            allowBrowser: config.allowBrowser,
            allowTerminal: config.allowTerminal,
            allowFilesystem: config.allowFilesystem,
            networkAccess: config.networkAccess,
          },
        },
        computer.agentId,
      );
    }
    const [updated] = await this.db
      .update(schema.agentComputerInstance)
      .set({
        resourceProfile: config.resourceProfile,
        resourceMode: config.resourceMode,
        cpuRequest: config.cpuRequest,
        cpuLimit: config.cpuLimit,
        memoryRequest: config.memoryRequest,
        memoryLimit: config.memoryLimit,
        storageLimit: config.storageLimit,
        gpuType: config.gpuType,
        gpuCount: config.gpuCount,
        runtimeGeneration:
          commonOs?.compute?.generation ??
          commonOs?.resources?.generation ??
          computer.runtimeGeneration,
        updatedAt: new Date(),
      })
      .where(eq(schema.agentComputerInstance.computerId, computer.computerId))
      .returning();
    return updated;
  }

  private async assertCapability(
    agentId: string,
    capability: 'browser' | 'terminal' | 'filesystem',
  ) {
    const config = await this.getConfig(agentId);
    if (!config.enabled) {
      throw new BadRequestException('Computer use is disabled for this agent');
    }
    const allowed =
      capability === 'browser'
        ? config.allowBrowser
        : capability === 'terminal'
          ? config.allowTerminal
          : config.allowFilesystem;
    if (!allowed) {
      throw new BadRequestException(
        `${capability} access is disabled for this computer`,
      );
    }
    return config;
  }

  private storageGiB(value: string) {
    const match = String(value)
      .trim()
      .match(/^(\d+(?:\.\d+)?)(Gi|Ti)$/i);
    if (!match) {
      throw new BadRequestException('storageLimit must use Gi or Ti units');
    }
    const amount = Number(match[1]);
    return match[2].toLowerCase() === 'ti' ? amount * 1024 : amount;
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

  private commonOsSystemPrompt(agent: typeof schema.agent.$inferSelect) {
    return [
      `You are the CommonOS computer runtime for Agent Commons agent ${agent.name}.`,
      `Agent Commons ID: ${agent.agentId}`,
      'Lifecycle: persistent workspace with replaceable runtime generations',
      'Use the pod filesystem, terminal, and browser to complete computer-specific work.',
      'When asked to run a terminal command, run the exact requested command first and return stdout, stderr, and exit code.',
      'When asked to open a browser, use the pod browser tools and report visible/runtime errors.',
      'Keep all durable workspace files under /mnt/shared and avoid unrelated destructive changes.',
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
    // The persistent singleton contract is the only supported provisioning
    // path. Keep the old environment variable harmless during rolling secret
    // updates; individual read/tool calls may still use their explicit legacy
    // fallback while old CommonOS tasks drain.
    return true;
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
  const parts = trimmed.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new BadRequestException('path escapes workspace');
  }
  return `/${parts.join('/')}`;
}
