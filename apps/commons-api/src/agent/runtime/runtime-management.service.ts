import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import * as schema from '#/models/schema';
import { DatabaseService } from '~/modules/database';
import { ComputerService } from '~/computer';
import {
  RUNTIME_CAPABILITIES,
  isAgentRuntimeType,
  normalizeRuntimeType,
  type AgentRuntimeType,
  type RuntimeConfig,
} from './runtime.types';

@Injectable()
export class RuntimeManagementService {
  private readonly logger = new Logger(RuntimeManagementService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly computers: ComputerService,
  ) {}

  async get(agentId: string) {
    const agent = await this.getAgent(agentId);
    const runtimeType = normalizeRuntimeType(agent.runtimeType);
    const config = await this.computers.getConfig(agentId);
    const computer = await this.computers.getAssignedComputer(agentId);
    return {
      runtimeType,
      version: agent.runtimeVersion,
      status: agent.runtimeStatus,
      config: agent.runtimeConfig ?? {},
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
        runtimeCapabilities: RUNTIME_CAPABILITIES[runtimeType],
        runtimeUpdatedAt: now,
      })
      .where(eq(schema.agent.agentId, agentId));

    const runtimeConfigurationChanged =
      runtimeType !== normalizeRuntimeType(agent.runtimeType) ||
      input.version !== undefined ||
      input.config !== undefined;

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
      if (['failed', 'unavailable', 'terminated'].includes(String(computer.status))) {
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
    if (['failed', 'unavailable', 'terminated'].includes(String(computer.status))) {
      await this.setStatus(agentId, 'failed');
      throw new Error(
        computer.errorMessage || `${runtimeType} computer could not be started`,
      );
    }
    await this.setStatus(
      agentId,
      ['running', 'idle'].includes(String(computer.status)) ? 'ready' : 'starting',
    );
    return computer;
  }

  async sleep(agentId: string, actorId?: string) {
    await this.computers.stopAssignedComputer({
      agentId,
      actorId,
      actorType: actorId ? 'user' : 'service',
    });
    await this.setStatus(agentId, 'stopped');
    return this.get(agentId);
  }

  async restart(agentId: string, actorId?: string) {
    await this.setStatus(agentId, 'starting');
    await this.computers.restartAssignedComputer({
      agentId,
      actorId,
      actorType: actorId ? 'user' : 'service',
      reason: 'Agent runtime restart requested',
    });
    await this.setStatus(agentId, 'ready');
    return this.get(agentId);
  }

  private normalizeConfig(value?: RuntimeConfig | null): RuntimeConfig {
    const input = value ?? {};
    return {
      deploymentMode: input.deploymentMode ?? 'managed',
      channelPolicy: input.channelPolicy ?? 'pairing',
      enabledPlugins: this.cleanStringList(input.enabledPlugins),
      enabledToolsets: this.cleanStringList(input.enabledToolsets),
      memoryMode: input.memoryMode ?? 'hybrid',
      metadata: this.cleanMetadata(input.metadata),
    };
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
