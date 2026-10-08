import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database/database.service';
import { CreditService } from '~/credit/credit.service';
import { creditsPerMinute } from '~/billing/compute-pricing';
import { ComputerService } from './computer.service';
import { ComputeMeteringService } from './compute-metering.service';
import {
  evaluateResourceUpgrade,
  resourceUpgradePolicy,
} from './resource-upgrade-policy';

type Request = {
  agentId: string;
  ownerId: string;
  sessionId?: string;
  runId?: string;
  profile: 'standard' | 'performance' | 'gpu';
  minutes?: number;
  reason: string;
};
const resourceKeys = [
  'resourceProfile',
  'resourceMode',
  'cpuRequest',
  'cpuLimit',
  'memoryRequest',
  'memoryLimit',
  'storageLimit',
  'gpuType',
  'gpuCount',
] as const;
const baselineOf = (config: any) =>
  Object.fromEntries(resourceKeys.map((key) => [key, config[key]]));

@Injectable()
export class ResourceUpgradeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceUpgradeService.name);
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly db: DatabaseService,
    private readonly computers: ComputerService,
    private readonly metering: ComputeMeteringService,
    private readonly credits: CreditService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => this.expire().catch((error) => this.logger.error(error.message)),
      15_000,
    );
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async assertOwner(agentId: string, ownerId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: eq(schema.agent.agentId, agentId),
    });
    if (!ownerId || (agent?.ownerUserId ?? agent?.owner) !== ownerId)
      throw new ForbiddenException(
        'Only the computer owner can authorize temporary resources.',
      );
  }

  async request(input: Request) {
    await this.assertOwner(input.agentId, input.ownerId);
    const config = await this.computers.getConfig(input.agentId);
    if (!config.enabled || !config.allowAgentStart)
      throw new ForbiddenException('Agent computer access is disabled.');
    if (!input.reason?.trim() || input.reason.length > 2000)
      throw new BadRequestException(
        'Explain why the task needs temporary resources.',
      );
    const requested = evaluateResourceUpgrade(
      resourceUpgradePolicy((config.metadata as any)?.resourceUpgradePolicy),
      input.profile,
      input.minutes,
    );
    if ((config.metadata as any)?.resourceUpgradeLease)
      throw new ConflictException(
        'A temporary resource upgrade is already active. Release it before requesting another.',
      );
    const estimate = creditsPerMinute(requested.profile) * requested.minutes;
    const [change] = await this.db
      .insert(schema.copilotChange)
      .values({
        agentId: input.agentId,
        ownerUserId: input.ownerId,
        sessionId: input.sessionId,
        scope: 'computers',
        resourceType: 'computer',
        resourceId: input.agentId,
        action: 'update',
        title: `${requested.profile === 'gpu' ? 'GPU' : 'CPU and RAM'} for up to ${requested.minutes} minutes`,
        description: `${input.reason.trim()} Estimated compute cost: ${estimate} credits. Partial minutes are rounded up. Persistent files are retained.`,
        before: baselineOf(config),
        after: {
          profile: requested.profile,
          minutes: requested.minutes,
          estimatedCredits: estimate,
          runId: input.runId ?? null,
        },
      })
      .returning();
    if (requested.automatic)
      return this.accept(input.agentId, change.changeId, input.ownerId, true);
    return {
      requiresConfirmation: true,
      changes: [change],
      message:
        'Waiting for owner approval. No additional resources have been activated.',
    };
  }

  async pending(agentId: string, ownerId: string) {
    await this.assertOwner(agentId, ownerId);
    return this.db
      .select()
      .from(schema.copilotChange)
      .where(
        and(
          eq(schema.copilotChange.agentId, agentId),
          eq(schema.copilotChange.resourceType, 'computer'),
          eq(schema.copilotChange.status, 'pending'),
        ),
      );
  }

  async getRequest(agentId: string, changeId: string, ownerId: string) {
    await this.assertOwner(agentId, ownerId);
    const change = await this.db.query.copilotChange.findFirst({
      where: and(
        eq(schema.copilotChange.changeId, changeId),
        eq(schema.copilotChange.agentId, agentId),
        eq(schema.copilotChange.ownerUserId, ownerId),
        eq(schema.copilotChange.resourceType, 'computer'),
      ),
    });
    if (!change) throw new NotFoundException('Resource request not found.');
    return change;
  }

  async accept(
    agentId: string,
    changeId: string,
    ownerId: string,
    automatic = false,
  ) {
    await this.assertOwner(agentId, ownerId);
    const leaseId = randomUUID();
    const lease = await this.db.transaction(async (tx) => {
      const [change] = await tx
        .select()
        .from(schema.copilotChange)
        .where(
          and(
            eq(schema.copilotChange.changeId, changeId),
            eq(schema.copilotChange.agentId, agentId),
            eq(schema.copilotChange.ownerUserId, ownerId),
            eq(schema.copilotChange.resourceType, 'computer'),
          ),
        )
        .for('update');
      if (!change || change.status !== 'pending')
        throw new ConflictException(
          'This resource request has already been reviewed.',
        );
      const [config] = await tx
        .select()
        .from(schema.agentComputerConfig)
        .where(eq(schema.agentComputerConfig.agentId, agentId))
        .for('update');
      if (!config?.enabled || !config.allowAgentStart)
        throw new ForbiddenException('Agent computer access is disabled.');
      const metadata = (config.metadata ?? {}) as Record<string, any>;
      if (metadata.resourceUpgradeLease)
        throw new ConflictException('Another resource upgrade is active.');
      if (
        resourceKeys.some(
          (key) => config[key] !== (change.before as any)?.[key],
        )
      )
        throw new ConflictException(
          'Computer settings changed. Request a new upgrade.',
        );
      if (Date.now() - change.createdAt.getTime() > 30 * 60_000)
        throw new ConflictException(
          'This request expired. Request a new upgrade.',
        );
      const after = change.after as any;
      const requested = evaluateResourceUpgrade(
        resourceUpgradePolicy(metadata.resourceUpgradePolicy),
        after.profile,
        after.minutes,
      );
      if (automatic && !requested.automatic)
        throw new ForbiddenException(
          'Automatic resource access has not been enabled by the owner.',
        );
      const balance = await this.credits.getBalance({ principalId: ownerId });
      if (
        balance.available <
        creditsPerMinute(requested.profile) * requested.minutes
      )
        throw new BadRequestException(
          'Insufficient compute credits for the requested duration.',
        );
      const lease = {
        leaseId,
        changeId,
        ownerId,
        sessionId: change.sessionId,
        runId: after.runId,
        profile: requested.profile,
        endsAt: new Date(Date.now() + requested.minutes * 60_000).toISOString(),
        baseline: baselineOf(config),
        state: 'applying',
      };
      await tx
        .update(schema.agentComputerConfig)
        .set({
          metadata: { ...metadata, resourceUpgradeLease: lease },
          updatedAt: new Date(),
        })
        .where(eq(schema.agentComputerConfig.configId, config.configId));
      // Reserve the proposal once. Other reviews cannot activate the same request.
      await tx
        .update(schema.copilotChange)
        .set({ status: 'applied', reviewedAt: new Date() })
        .where(eq(schema.copilotChange.changeId, changeId));
      return lease;
    });
    try {
      await this.metering.settleForResourceChange(agentId);
      const balance = await this.credits.getBalance({ principalId: ownerId });
      if (
        balance.available <
        creditsPerMinute(lease.profile) *
          ((Date.parse(lease.endsAt) - Date.now()) / 60_000)
      )
        throw new BadRequestException(
          'Insufficient compute credits after settling prior computer use.',
        );
      await this.computers.updateConfig(
        agentId,
        {
          resourceProfile: lease.profile,
          resourceMode: 'fixed',
          resources: {
            storageGiB: this.storageGiB(lease.baseline.storageLimit),
          },
        } as any,
        leaseId,
      );
      await this.setLeaseState(agentId, leaseId, 'active');
      await this.db
        .update(schema.copilotChange)
        .set({ appliedAt: new Date() })
        .where(eq(schema.copilotChange.changeId, changeId));
      return {
        requiresConfirmation: false,
        leaseId,
        profile: lease.profile,
        endsAt: lease.endsAt,
        status: 'starting',
        message:
          'Resources requested. Wait for the computer to become ready and verify GPU availability before using CUDA.',
        changes: [
          {
            ...(await this.db.query.copilotChange.findFirst({
              where: eq(schema.copilotChange.changeId, changeId),
            })),
          },
        ],
      };
    } catch (error) {
      await this.release(
        agentId,
        ownerId,
        lease.sessionId ?? undefined,
        leaseId,
      ).catch((restoreError) =>
        this.logger.error(
          `Resource restoration failed: ${restoreError.message}`,
        ),
      );
      await this.db
        .update(schema.copilotChange)
        .set({ status: 'rejected' })
        .where(eq(schema.copilotChange.changeId, changeId));
      throw error;
    }
  }

  async reject(agentId: string, changeId: string, ownerId: string) {
    await this.assertOwner(agentId, ownerId);
    const [change] = await this.db
      .update(schema.copilotChange)
      .set({ status: 'rejected', reviewedAt: new Date() })
      .where(
        and(
          eq(schema.copilotChange.changeId, changeId),
          eq(schema.copilotChange.agentId, agentId),
          eq(schema.copilotChange.ownerUserId, ownerId),
          eq(schema.copilotChange.resourceType, 'computer'),
          eq(schema.copilotChange.status, 'pending'),
        ),
      )
      .returning();
    if (!change)
      throw new ConflictException(
        'This resource request has already been reviewed.',
      );
    return change;
  }

  private storageGiB(value: unknown) {
    const match = String(value).match(/^(\d+(?:\.\d+)?)Gi$/);
    if (!match)
      throw new BadRequestException(
        'Temporary upgrades require persistent storage measured in GiB.',
      );
    return Number(match[1]);
  }

  private async setLeaseState(agentId: string, leaseId: string, state: string) {
    await this.db.execute(
      sql`update agent_computer_config set metadata = jsonb_set(metadata, '{resourceUpgradeLease,state}', to_jsonb(${state}::text)), updated_at = now() where agent_id = ${agentId} and metadata->'resourceUpgradeLease'->>'leaseId' = ${leaseId}`,
    );
  }

  async release(
    agentId: string,
    ownerId: string,
    sessionId?: string,
    expectedLeaseId?: string,
  ) {
    await this.assertOwner(agentId, ownerId);
    const config = await this.computers.getConfig(agentId);
    const lease = (config.metadata as any)?.resourceUpgradeLease;
    if (!lease) return { released: false };
    if (expectedLeaseId && expectedLeaseId !== lease.leaseId)
      throw new ConflictException('The active resource lease changed.');
    if (sessionId && lease.sessionId !== sessionId)
      throw new ForbiddenException(
        'Temporary resources belong to another chat.',
      );
    const claimed = await this.db.execute(
      sql`update agent_computer_config set metadata = jsonb_set(metadata, '{resourceUpgradeLease,state}', '"releasing"'::jsonb), updated_at = now() where agent_id = ${agentId} and metadata->'resourceUpgradeLease'->>'leaseId' = ${lease.leaseId} and (metadata->'resourceUpgradeLease'->>'state' <> 'releasing' or updated_at < now() - interval '2 minutes') returning config_id`,
    );
    if (!claimed.length) return { released: false, status: 'releasing' };
    try {
      const computer = await this.computers.getAssignedComputer(agentId);
      if (computer?.resourceProfile !== lease.baseline.resourceProfile)
        await this.metering.settleForResourceChange(agentId);
      await this.computers.updateConfig(
        agentId,
        {
          ...lease.baseline,
          resources: { storageGiB: this.storageGiB(config.storageLimit) },
        } as any,
        lease.leaseId,
      );
      await this.db.execute(
        sql`update agent_computer_config set metadata = metadata - 'resourceUpgradeLease', updated_at = now() where agent_id = ${agentId} and metadata->'resourceUpgradeLease'->>'leaseId' = ${lease.leaseId}`,
      );
      return { released: true, profile: lease.baseline.resourceProfile };
    } catch (error) {
      await this.setLeaseState(agentId, lease.leaseId, 'restore_failed');
      // An unreachable resize must not leave expensive compute silently running.
      await this.computers
        .stopAssignedComputer({ agentId, actorType: 'service' })
        .catch((stopError) =>
          this.logger.error(`Resource stop failed: ${stopError.message}`),
        );
      throw error;
    }
  }

  async expire() {
    const rows = await this.db
      .select({
        agentId: schema.agentComputerConfig.agentId,
        metadata: schema.agentComputerConfig.metadata,
      })
      .from(schema.agentComputerConfig)
      .where(
        sql`${schema.agentComputerConfig.metadata}->'resourceUpgradeLease' is not null`,
      );
    for (const row of rows) {
      const metadata = row.metadata as any;
      const lease = metadata.resourceUpgradeLease;
      const policy = resourceUpgradePolicy(metadata.resourceUpgradePolicy);
      const agent = await this.db.query.agent.findFirst({
        where: eq(schema.agent.agentId, row.agentId),
      });
      const ownerId = agent?.ownerUserId ?? agent?.owner;
      if (
        lease.ownerId === ownerId &&
        Date.parse(lease.endsAt) > Date.now() &&
        lease.state !== 'restore_failed' &&
        (lease.profile === 'gpu' ? policy.gpuAccess : policy.cpuAccess) !==
          'off'
      )
        continue;
      if (ownerId)
        await this.release(
          row.agentId,
          ownerId,
          undefined,
          lease.leaseId,
        ).catch((error) =>
          this.logger.error(`Expired resources: ${error.message}`),
        );
    }
  }

  async bindRun(
    agentId: string,
    ownerId?: string,
    sessionId?: string,
    runId?: string,
  ) {
    const config = await this.computers.getConfig(agentId);
    const lease = (config.metadata as any)?.resourceUpgradeLease;
    if (!lease) return;
    if (
      !ownerId ||
      lease.ownerId !== ownerId ||
      (lease.sessionId && lease.sessionId !== sessionId)
    )
      throw new ForbiddenException(
        'Temporary resources are approved for another owner or chat.',
      );
    if (lease.state !== 'active' || Date.parse(lease.endsAt) <= Date.now())
      throw new ConflictException(
        'Temporary resources are still changing or expired.',
      );
    if (runId)
      await this.db.execute(
        sql`update agent_computer_config set metadata = jsonb_set(metadata, '{resourceUpgradeLease,runId}', to_jsonb(${runId}::text)), updated_at = now() where agent_id = ${agentId} and metadata->'resourceUpgradeLease'->>'leaseId' = ${lease.leaseId}`,
      );
  }

  async finishRun(agentId: string, runId: string) {
    const config = await this.computers.getConfig(agentId);
    const lease = (config.metadata as any)?.resourceUpgradeLease;
    if (lease?.runId === runId)
      await this.release(
        agentId,
        lease.ownerId,
        lease.sessionId ?? undefined,
        lease.leaseId,
      );
  }
}
