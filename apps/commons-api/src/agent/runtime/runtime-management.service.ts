import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database';
import { EncryptionService } from '~/modules/encryption';
import { ComputerService } from '~/computer';
import {
  RUNTIME_CAPABILITIES,
  RUNTIME_CHANNEL_IDS,
  isAgentRuntimeType,
  normalizeRuntimeType,
  type AgentRuntimeType,
  type RuntimeChannelConfig,
  type RuntimeChannelId,
  type RuntimeConfig,
} from './runtime.types';

@Injectable()
export class RuntimeManagementService {
  private readonly logger = new Logger(RuntimeManagementService.name);
  private readonly readyCache = new Map<
    string,
    { expiresAt: number; computer: any }
  >();
  private readonly readyCacheTtlMs = 60_000;

  constructor(
    private readonly db: DatabaseService,
    private readonly computers: ComputerService,
    private readonly encryption: EncryptionService,
  ) {}

  async get(agentId: string) {
    const agent = await this.getAgent(agentId);
    const runtimeType = normalizeRuntimeType(agent.runtimeType);
    const config = await this.computers.getConfig(agentId);
    let computer = await this.computers.getAssignedComputer(agentId);
    if (
      runtimeType !== 'native' &&
      computer?.commonOsAgentId &&
      ['provisioning', 'starting'].includes(String(computer.status))
    ) {
      computer = await this.computers
        .refreshInstance(computer.computerId, { silent: true })
        .catch(() => computer);
    }
    const effectiveStatus =
      runtimeType === 'native'
        ? 'ready'
        : ['running', 'idle'].includes(String(computer?.status))
          ? 'ready'
          : ['failed', 'unavailable', 'terminated'].includes(
                String(computer?.status),
              )
            ? 'failed'
            : computer?.status === 'stopped'
              ? 'stopped'
              : ['provisioning', 'starting'].includes(String(computer?.status))
                ? 'starting'
                : agent.runtimeStatus;
    if (effectiveStatus !== agent.runtimeStatus) {
      await this.setStatus(agentId, effectiveStatus);
    }
    return {
      runtimeType,
      version: agent.runtimeVersion,
      status: effectiveStatus,
      config: this.publicConfig(agent),
      capabilities:
        agent.runtimeCapabilities ?? RUNTIME_CAPABILITIES[runtimeType],
      updatedAt: agent.runtimeUpdatedAt,
      managed: runtimeType !== 'native',
      computer: this.computers.toPublicComputer(computer, config),
    };
  }

  async configure(
    agentId: string,
    input: {
      runtimeType?: AgentRuntimeType;
      version?: string | null;
      config?: RuntimeConfig;
      deploy?: boolean;
    },
    actor?: { id?: string; type?: 'user' | 'agent' | 'service' },
  ) {
    this.readyCache.delete(agentId);
    const agent = await this.getAgent(agentId);
    const runtimeType =
      input.runtimeType ?? normalizeRuntimeType(agent.runtimeType);
    if (!isAgentRuntimeType(runtimeType)) {
      throw new BadRequestException(
        `Unsupported agent runtime: ${String(runtimeType)}`,
      );
    }
    const runtimeConfig = this.normalizeConfig(
      input.config ?? (agent.runtimeConfig as RuntimeConfig),
      runtimeType,
    );
    const secretUpdate = input.config
      ? this.updateChannelSecrets(
          (agent.runtimeSecrets ?? {}) as Record<
            string,
            Record<string, string>
          >,
          input.config.channels,
        )
      : {
          value: (agent.runtimeSecrets ?? {}) as Record<
            string,
            Record<string, string>
          >,
          changed: false,
        };
    this.validateChannelConfiguration(
      runtimeType,
      runtimeConfig.channels,
      secretUpdate.value,
    );
    const now = new Date();
    await this.db
      .update(schema.agent)
      .set({
        runtimeType,
        runtimeVersion:
          input.version === undefined ? agent.runtimeVersion : input.version,
        runtimeStatus: runtimeType === 'native' ? 'ready' : 'stopped',
        runtimeConfig,
        runtimeSecrets: secretUpdate.value,
        runtimeCapabilities: RUNTIME_CAPABILITIES[runtimeType],
        runtimeUpdatedAt: now,
      })
      .where(eq(schema.agent.agentId, agentId));

    const runtimeConfigurationChanged =
      runtimeType !== normalizeRuntimeType(agent.runtimeType) ||
      input.version !== undefined ||
      (input.config !== undefined &&
        JSON.stringify(runtimeConfig) !==
          JSON.stringify(
            this.normalizeConfig(agent.runtimeConfig, runtimeType),
          )) ||
      secretUpdate.changed;

    if (
      runtimeType === 'native' &&
      normalizeRuntimeType(agent.runtimeType) !== 'native'
    ) {
      const computer = await this.computers.getAssignedComputer(agentId);
      if (
        computer &&
        ['provisioning', 'starting', 'running', 'idle'].includes(
          String(computer.status),
        )
      ) {
        await this.computers.stopAssignedComputer({
          agentId,
          actorId: actor?.id,
          actorType: actor?.type ?? 'service',
        });
      }
    }
    if (runtimeType !== 'native') {
      const current = await this.computers.getConfig(agentId);
      await this.computers.updateConfig(agentId, {
        enabled: true,
        autoStart: true,
        allowAgentStart: true,
        allowUserSelect: true,
        resourceProfile:
          current.resourceProfile === 'starter'
            ? 'standard'
            : current.resourceProfile,
      });
      if (runtimeConfigurationChanged) {
        const computer = await this.computers.getAssignedComputer(agentId);
        if (
          computer &&
          ['provisioning', 'starting', 'running', 'idle'].includes(
            String(computer.status),
          )
        ) {
          await this.computers.stopAssignedComputer({
            agentId,
            actorId: actor?.id,
            actorType: actor?.type ?? 'service',
          });
        }
      }
      if (input.deploy !== false) {
        await this.deploy(agentId, actor);
      }
    }
    return this.get(agentId);
  }

  async ensureConfigured(agentId: string, deploy = true) {
    const agent = await this.getAgent(agentId);
    const runtimeType = normalizeRuntimeType(agent.runtimeType);
    if (runtimeType === 'native') return this.get(agentId);
    return this.configure(
      agentId,
      {
        runtimeType,
        version: agent.runtimeVersion,
        config: (agent.runtimeConfig ?? {}) as RuntimeConfig,
        deploy,
      },
      { type: 'service' },
    );
  }

  async deploy(
    agentId: string,
    actor?: { id?: string; type?: 'user' | 'agent' | 'service' },
  ) {
    this.readyCache.delete(agentId);
    const agent = await this.getAgent(agentId);
    const runtimeType = normalizeRuntimeType(agent.runtimeType);
    if (runtimeType === 'native') {
      throw new BadRequestException(
        'Native agents do not require a managed runtime deployment',
      );
    }
    await this.setStatus(agentId, 'provisioning');
    try {
      const computer = await this.computers.startComputer({
        agentId,
        name: `${agent.name} ${runtimeType} runtime`,
        reason: `${runtimeType} runtime deployment`,
        actorId: actor?.id,
        actorType: actor?.type ?? 'service',
      });
      if (
        ['failed', 'unavailable', 'terminated'].includes(
          String(computer.status),
        )
      ) {
        throw new Error(
          computer.errorMessage ||
            `${runtimeType} computer could not be started`,
        );
      }
      await this.setStatus(
        agentId,
        ['running', 'idle'].includes(String(computer.status))
          ? 'ready'
          : 'starting',
      );
      if (['running', 'idle'].includes(String(computer.status))) {
        this.readyCache.set(agentId, {
          expiresAt: Date.now() + this.readyCacheTtlMs,
          computer,
        });
      }
      return computer;
    } catch (error) {
      await this.setStatus(agentId, 'failed');
      this.logger.error(
        `Runtime deployment failed for ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async ensureReady(agentId: string, sessionId?: string) {
    const cached = this.readyCache.get(agentId);
    if (cached && cached.expiresAt > Date.now()) return cached.computer;
    if (cached) this.readyCache.delete(agentId);
    const agent = await this.getAgent(agentId);
    const runtimeType = normalizeRuntimeType(agent.runtimeType);
    if (runtimeType === 'native') {
      throw new BadRequestException('Native runtime is executed in-process');
    }
    const current = await this.computers.getConfig(agentId);
    if (!current.enabled) {
      await this.computers.updateConfig(agentId, {
        enabled: true,
        autoStart: true,
        allowAgentStart: true,
      });
    }
    await this.setStatus(agentId, 'starting');
    const computer = await this.computers.startComputer({
      agentId,
      sessionId,
      name: `${agent.name} ${runtimeType} runtime`,
      reason: 'Agent session requested the managed runtime',
      actorType: 'service',
    });
    if (
      ['failed', 'unavailable', 'terminated'].includes(String(computer.status))
    ) {
      await this.setStatus(agentId, 'failed');
      throw new Error(
        computer.errorMessage || `${runtimeType} computer could not be started`,
      );
    }
    await this.setStatus(
      agentId,
      ['running', 'idle'].includes(String(computer.status))
        ? 'ready'
        : 'starting',
    );
    if (['running', 'idle'].includes(String(computer.status))) {
      this.readyCache.set(agentId, {
        expiresAt: Date.now() + this.readyCacheTtlMs,
        computer,
      });
    }
    return computer;
  }

  async sleep(agentId: string, actorId?: string) {
    this.readyCache.delete(agentId);
    await this.computers.stopAssignedComputer({
      agentId,
      actorId,
      actorType: actorId ? 'user' : 'service',
    });
    await this.setStatus(agentId, 'stopped');
    return this.get(agentId);
  }

  async restart(agentId: string, actorId?: string) {
    this.readyCache.delete(agentId);
    await this.setStatus(agentId, 'starting');
    try {
      const computer = await this.computers.restartAssignedComputer({
        agentId,
        actorId,
        actorType: actorId ? 'user' : 'service',
        reason: 'Agent runtime restart requested',
      });
      if (
        !computer ||
        ['failed', 'unavailable', 'terminated'].includes(
          String(computer.status),
        )
      ) {
        throw new Error(
          computer?.errorMessage || 'Managed runtime could not be restarted',
        );
      }
      await this.setStatus(
        agentId,
        ['running', 'idle'].includes(String(computer.status))
          ? 'ready'
          : 'starting',
      );
      return this.get(agentId);
    } catch (error) {
      await this.setStatus(agentId, 'failed');
      throw error;
    }
  }

  async channelAction(agentId: string, channel: string, action: string) {
    const agent = await this.getAgent(agentId);
    if (normalizeRuntimeType(agent.runtimeType) !== 'openclaw') {
      throw new BadRequestException(
        'QR channel setup is currently available for OpenClaw',
      );
    }
    if (channel !== 'whatsapp') {
      throw new BadRequestException('Unsupported runtime channel');
    }
    if (!['connect', 'status', 'disconnect'].includes(action)) {
      throw new BadRequestException('Unsupported runtime channel action');
    }
    try {
      await this.ensureReady(agentId);
      return await this.computers.runtimeChannelAction({
        agentId,
        channel,
        action: action as 'connect' | 'status' | 'disconnect',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      throw new ServiceUnavailableException(
        detail.includes('timed out')
          ? 'WhatsApp setup is taking longer than expected. Try again in a moment.'
          : detail || 'WhatsApp setup is temporarily unavailable',
      );
    }
  }

  private normalizeConfig(
    value?: RuntimeConfig | null,
    runtimeType: AgentRuntimeType = 'native',
  ): RuntimeConfig {
    const input = value ?? {};
    return {
      deploymentMode: input.deploymentMode ?? 'managed',
      channelPolicy: input.channelPolicy ?? 'pairing',
      enabledPlugins: this.cleanStringList(input.enabledPlugins),
      enabledToolsets: this.cleanStringList(input.enabledToolsets),
      memoryMode: input.memoryMode ?? 'hybrid',
      channels: this.normalizeChannels(
        input.channels,
        runtimeType,
        input.channelPolicy ?? 'pairing',
      ),
      metadata: this.cleanMetadata(input.metadata),
    };
  }

  private normalizeChannels(
    value: RuntimeConfig['channels'],
    runtimeType: AgentRuntimeType,
    defaultPolicy: NonNullable<RuntimeConfig['channelPolicy']>,
  ): RuntimeConfig['channels'] {
    const channels: RuntimeConfig['channels'] = {};
    for (const id of RUNTIME_CHANNEL_IDS) {
      const input = value?.[id];
      if (!input) continue;
      const dmPolicy = input.dmPolicy ?? defaultPolicy;
      const allowFrom = this.cleanStringList(input.allowFrom);
      if (dmPolicy === 'open' && !allowFrom.includes('*')) allowFrom.push('*');
      channels[id] = {
        enabled: input.enabled !== false && dmPolicy !== 'disabled',
        ...(id === 'whatsapp'
          ? {
              mode:
                runtimeType === 'openclaw'
                  ? input.mode === 'self-chat'
                    ? 'self-chat'
                    : 'bot'
                  : (input.mode ?? 'bot'),
            }
          : {}),
        dmPolicy,
        allowFrom,
        requireMention: input.requireMention !== false,
        ...(input.homeTarget?.trim()
          ? { homeTarget: input.homeTarget.trim() }
          : {}),
      };
    }
    return channels;
  }

  private publicConfig(agent: typeof schema.agent.$inferSelect) {
    const config = this.normalizeConfig(
      agent.runtimeConfig as RuntimeConfig,
      normalizeRuntimeType(agent.runtimeType),
    );
    const secrets = (agent.runtimeSecrets ?? {}) as Record<
      string,
      Record<string, string>
    >;
    const channels = Object.fromEntries(
      Object.entries(config.channels ?? {}).map(([id, channel]) => {
        const configuredFields = Object.keys(secrets[id] ?? {}).sort();
        const needsPairing = id === 'whatsapp' && channel?.mode !== 'cloud';
        const required = this.requiredCredentialFields(
          id as RuntimeChannelId,
          channel,
        );
        return [
          id,
          {
            ...channel,
            setupMethod: needsPairing ? 'qr' : 'credentials',
            configuredFields,
            configured:
              channel?.enabled === true &&
              (needsPairing ||
                required.every((field) => configuredFields.includes(field))),
            needsPairing,
          },
        ];
      }),
    );
    return { ...config, channels };
  }

  private updateChannelSecrets(
    current: Record<string, Record<string, string>>,
    channels?: RuntimeConfig['channels'],
  ) {
    const next = Object.fromEntries(
      Object.entries(current).map(([channel, values]) => [
        channel,
        { ...values },
      ]),
    );
    let changed = false;
    for (const id of RUNTIME_CHANNEL_IDS) {
      const patch = channels?.[id];
      if (!patch) continue;
      if (patch.clearCredentials) {
        if (next[id]) changed = true;
        delete next[id];
      }
      for (const [field, rawValue] of Object.entries(patch.credentials ?? {})) {
        if (!this.allowedCredentialFields(id).includes(field)) continue;
        const value = rawValue.trim();
        if (!value) continue;
        next[id] ??= {};
        next[id][field] = this.encryptSecret(value);
        changed = true;
      }
    }
    return { value: next, changed };
  }

  private validateChannelConfiguration(
    runtimeType: AgentRuntimeType,
    channels: RuntimeConfig['channels'],
    secrets: Record<string, Record<string, string>>,
  ) {
    for (const [rawId, channel] of Object.entries(channels ?? {})) {
      if (!channel?.enabled) continue;
      const id = rawId as RuntimeChannelId;
      if (runtimeType === 'openclaw' && id === 'whatsapp') continue;
      if (
        runtimeType === 'hermes' &&
        id === 'whatsapp' &&
        channel.mode !== 'cloud'
      ) {
        continue;
      }
      const missing = this.requiredCredentialFields(id, channel).filter(
        (field) => !secrets[id]?.[field],
      );
      if (missing.length) {
        throw new BadRequestException(
          `${id} is missing required credentials: ${missing.join(', ')}`,
        );
      }
    }
  }

  private requiredCredentialFields(
    id: RuntimeChannelId,
    channel?: RuntimeChannelConfig,
  ) {
    if (id === 'telegram') return ['botToken'];
    if (channel?.mode === 'cloud') {
      return ['phoneNumberId', 'accessToken', 'appSecret', 'verifyToken'];
    }
    return [];
  }

  private allowedCredentialFields(id: RuntimeChannelId) {
    return id === 'telegram'
      ? ['botToken']
      : ['phoneNumberId', 'accessToken', 'appSecret', 'verifyToken'];
  }

  private encryptSecret(value: string) {
    const encrypted = this.encryption.encrypt(value);
    return `enc:${encrypted.iv}:${encrypted.tag}:${encrypted.encryptedValue}`;
  }

  private cleanStringList(value?: string[]) {
    return [
      ...new Set((value ?? []).map((item) => item.trim()).filter(Boolean)),
    ].slice(0, 100);
  }

  private cleanMetadata(value?: Record<string, unknown>) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value ?? {})) {
      if (/(?:secret|token|password|api.?key|private.?key)/i.test(key))
        continue;
      if (
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
      ) {
        result[key] = item;
      }
    }
    return result;
  }

  private async setStatus(agentId: string, runtimeStatus: string) {
    await this.db
      .update(schema.agent)
      .set({ runtimeStatus, runtimeUpdatedAt: new Date() })
      .where(eq(schema.agent.agentId, agentId));
  }

  private async getAgent(agentId: string) {
    const agent = await this.db.query.agent.findFirst({
      where: (table) => eq(table.agentId, agentId),
    });
    if (!agent) throw new BadRequestException('Agent not found');
    return agent;
  }
}
