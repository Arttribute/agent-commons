import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { eq, gt, and } from 'drizzle-orm';
import { DatabaseService } from '~/modules/database/database.service';
import { SessionService } from '~/session/session.service';
import { AgentService } from './agent.service';
import * as schema from '#/models/schema';

/** Minimum allowed heartbeat interval in seconds */
const MIN_INTERVAL_SEC = 30;

/**
 * HeartbeatService — drives proactive, scheduled agent behaviour.
 *
 * This is NOT a network keepalive. The heartbeat means the agent initiates
 * actions on its own schedule rather than waiting for a user message.
 *
 * When `autonomyEnabled = true` and `autonomousIntervalSec > 0` for an agent,
 * a repeating timer fires at that interval. Each beat sends the agent a
 * structured prompt so it can:
 *   - Pick up pending tasks
 *   - Poll external services / tools
 *   - Take any other autonomous action defined in its instructions
 *
 * ── Distinct from SSE keepalive events ────────────────────────────────────
 * The `{type: "keepalive"}` events emitted on the streaming endpoint are a
 * purely technical measure to prevent GCP load-balancer idle timeouts. They
 * carry no agent behaviour and are handled silently by the CLI.
 * HeartbeatService is entirely separate from that mechanism.
 *
 * ── Lifecycle ─────────────────────────────────────────────────────────────
 * The service re-arms all enabled agents on startup so heartbeats survive
 * server restarts automatically.
 */
@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);

  /** agentId → active Node.js interval timer */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  /** agentId → timestamp of last beat */
  private readonly lastBeat = new Map<string, Date>();

  constructor(
    private readonly db: DatabaseService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
  ) {}

  async onModuleInit() {
    try {
      const agents = await this.db.query.agent.findMany({
        where: (a) => and(eq(a.autonomyEnabled, true), gt(a.autonomousIntervalSec!, 0)),
      });
      for (const agent of agents) {
        this.arm(agent.agentId, agent.autonomousIntervalSec!);
      }
      if (agents.length) {
        this.logger.log(`Heartbeat armed for ${agents.length} agent(s)`);
      }
    } catch (err: any) {
      this.logger.error(`HeartbeatService init failed: ${err.message}`);
    }
  }

  onModuleDestroy() {
    for (const [agentId, timer] of this.timers) {
      clearInterval(timer);
      this.logger.debug(`Heartbeat disarmed for ${agentId} (module destroy)`);
    }
    this.timers.clear();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Enable the heartbeat for an agent and persist the settings. */
  async enable(agentId: string, intervalSec: number): Promise<void> {
    const clamped = Math.max(intervalSec, MIN_INTERVAL_SEC);
    await this.db
      .update(schema.agent)
      .set({ autonomyEnabled: true, autonomousIntervalSec: clamped })
      .where(eq(schema.agent.agentId, agentId));

    this.arm(agentId, clamped);
    this.logger.log(`Heartbeat enabled for agent ${agentId} every ${clamped}s`);
  }

  /** Disable the heartbeat for an agent and persist. */
  async disable(agentId: string): Promise<void> {
    await this.db
      .update(schema.agent)
      .set({ autonomyEnabled: false })
      .where(eq(schema.agent.agentId, agentId));

    this.disarm(agentId);
    this.logger.log(`Heartbeat disabled for agent ${agentId}`);
  }

  /** Return live + persisted heartbeat status for an agent. */
  async status(agentId: string): Promise<{
    enabled: boolean;
    intervalSec: number;
    isArmed: boolean;
    lastBeatAt: Date | null;
    nextBeatAt: Date | null;
  }> {
    const agent = await this.db.query.agent.findFirst({
      where: (a) => eq(a.agentId, agentId),
    });

    const enabled = agent?.autonomyEnabled ?? false;
    const intervalSec = agent?.autonomousIntervalSec ?? 0;
    const isArmed = this.timers.has(agentId);
    const lastBeatAt = this.lastBeat.get(agentId) ?? null;
    const nextBeatAt =
      isArmed && lastBeatAt
        ? new Date(lastBeatAt.getTime() + intervalSec * 1000)
        : null;

    return { enabled, intervalSec, isArmed, lastBeatAt, nextBeatAt };
  }

  /** Fire a single heartbeat beat immediately (for testing or manual wake-up). */
  async triggerNow(agentId: string): Promise<void> {
    await this.beat(agentId);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private arm(agentId: string, intervalSec: number) {
    this.disarm(agentId);
    const ms = Math.max(intervalSec, MIN_INTERVAL_SEC) * 1000;
    const timer = setInterval(
      () => this.beat(agentId).catch((err) =>
        this.logger.error(`Heartbeat beat error for ${agentId}: ${err.message}`),
      ),
      ms,
    );
    this.timers.set(agentId, timer);
  }

  private disarm(agentId: string) {
    const existing = this.timers.get(agentId);
    if (existing) {
      clearInterval(existing);
      this.timers.delete(agentId);
    }
  }

  private async beat(agentId: string): Promise<void> {
    this.lastBeat.set(agentId, new Date());
    this.logger.debug(`Heartbeat beat for agent ${agentId}`);

    try {
      const agent = await this.db.query.agent.findFirst({
        where: (a) => eq(a.agentId, agentId),
      });
      if (!agent) {
        this.logger.warn(`Heartbeat: agent ${agentId} not found — disarming`);
        this.disarm(agentId);
        return;
      }
      if (!agent.autonomyEnabled) {
        this.disarm(agentId);
        return;
      }

      // The heartbeat marker session exists only for DB tracking. Each beat gets
      // a fresh LangGraph thread ID so checkpoint history never accumulates —
      // reusing the same sessionId causes the context window to grow unboundedly.
      const markerSession = await this.getOrCreateHeartbeatSession(agent);
      const beatThreadId = `${markerSession.sessionId}:${Date.now()}`;

      this.agentService
        .runAgent({
          agentId,
          sessionId: beatThreadId,
          messages: [{ role: 'user', content: HEARTBEAT_PROMPT }],
          initiator: agentId,
        })
        .subscribe({
          error: (err: Error) =>
            this.logger.error(`Heartbeat run error for ${agentId}: ${err.message}`),
        });
    } catch (err: any) {
      this.logger.error(`Heartbeat beat failed for ${agentId}: ${err.message}`);
    }
  }

  private async getOrCreateHeartbeatSession(agent: {
    agentId: string;
    modelProvider?: string | null;
    modelId?: string | null;
    temperature?: number | null;
    maxTokens?: number | null;
  }) {
    const existing = await this.db.query.session.findFirst({
      where: (s) => and(
        eq(s.agentId, agent.agentId),
        eq(s.title, HEARTBEAT_SESSION_TITLE),
      ),
    });
    if (existing) return existing;

    return this.sessionService.createSession({
      value: {
        agentId: agent.agentId,
        initiator: agent.agentId,
        title: HEARTBEAT_SESSION_TITLE,
        model: {
          name: agent.modelId ?? 'gpt-4o',
          provider: agent.modelProvider ?? 'openai',
          modelId: agent.modelId ?? 'gpt-4o',
          temperature: agent.temperature ?? 0.7,
          maxTokens: agent.maxTokens ?? 2048,
        } as any,
      },
    });
  }
}

const HEARTBEAT_SESSION_TITLE = '__heartbeat__';

const HEARTBEAT_PROMPT = `⫷⫷HEARTBEAT⫸⫸

This is your scheduled heartbeat. You are running without direct user input.

Check your current state and decide what (if anything) to do:
1. Review your pending tasks — if any are due, execute them.
2. Check for any time-sensitive items in your instructions.
3. If there is nothing actionable, respond briefly with your status and stand by.

Be concise. Act only on what is necessary right now.`;
