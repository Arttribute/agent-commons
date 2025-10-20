import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { AgentService } from '~/agent/agent.service';
import { SpaceService } from './space.service';
import { StreamMonitorService } from './stream-monitor.service';
import { DatabaseService } from '~/modules/database/database.service';
import { SessionService } from '~/session/session.service';
import * as schema from '#/models/schema';
import { and, eq } from 'drizzle-orm';

interface PendingTrigger {
  spaceId: string;
  messageId: string;
  content: string;
  senderId: string;
  scheduledAt: number;
}

@Injectable()
export class SpaceAgentTriggerService {
  private readonly logger = new Logger(SpaceAgentTriggerService.name);
  private queue: PendingTrigger[] = [];
  private processing = false;
  private debounceMs = 600; // configurable later
  private maxConcurrent = 2;

  constructor(
    private readonly emitter: EventEmitter,
    private readonly agentService: AgentService,
    private readonly db: DatabaseService,
    private readonly space: SpaceService,
    // SessionService needed to fetch/create per-space sessions
    @Inject(forwardRef(() => SessionService))
    private readonly session: SessionService,
    @Inject(forwardRef(() => StreamMonitorService))
    private readonly streamMonitor: StreamMonitorService,
  ) {
    this.emitter.on('space.message.created', (evt: any) => {
      this.handleNewMessage(evt.spaceId, evt.message);
    });
  }

  configure(opts: { debounceMs?: number; maxConcurrent?: number }) {
    if (opts.debounceMs !== undefined) this.debounceMs = opts.debounceMs;
    if (opts.maxConcurrent !== undefined)
      this.maxConcurrent = opts.maxConcurrent;
  }

  private async handleNewMessage(spaceId: string, message: any) {
    try {
      // Ignore system & agent messages to avoid loops
      if (message.senderType !== 'human') return;
      if (!message.content || !message.content.trim()) return;

      // Immediate parallel trigger mode (default). Use queue only if explicitly enabled.
      const useQueue = process.env.SPACE_TRIGGER_USE_QUEUE === '1';
      if (useQueue) {
        const now = Date.now();
        this.queue.push({
          spaceId,
          messageId: message.messageId,
          content: message.content,
          senderId: message.senderId,
          scheduledAt: now + this.debounceMs,
        });
        this.logger.debug(
          `Queued trigger for space ${spaceId} message ${message.messageId}`,
        );
        this.process();
      } else {
        this.logger.debug(
          `Immediate trigger for space ${spaceId} message ${message.messageId}`,
        );
        // Fire-and-forget parallel runs for all agents in space
        await this.triggerAgentsForSpace(spaceId, {
          spaceId,
          messageId: message.messageId,
          content: message.content,
          senderId: message.senderId,
          scheduledAt: Date.now(),
        });
      }
    } catch (e) {
      this.logger.warn(`handleNewMessage error: ${String(e)}`);
    }
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length) {
        const now = Date.now();
        // Remove expired / due items (respect debounce)
        const due = this.queue.filter((q) => q.scheduledAt <= now);
        if (!due.length) {
          // Wait a bit for next due
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        // Group by spaceId and take the latest message per space to reduce noise
        const latestPerSpace = new Map<string, PendingTrigger>();
        due.forEach((item) => {
          const existing = latestPerSpace.get(item.spaceId);
          if (!existing || existing.scheduledAt < item.scheduledAt) {
            latestPerSpace.set(item.spaceId, item);
          }
        });

        // Remove processed from queue
        this.queue = this.queue.filter((q) => !due.includes(q));

        const tasks = Array.from(latestPerSpace.values()).slice(
          0,
          this.maxConcurrent,
        );
        for (const task of tasks) {
          await this.triggerAgentsForSpace(task.spaceId, task);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async triggerAgentsForSpace(
    spaceId: string,
    trigger: PendingTrigger,
  ) {
    try {
      // Get subscribed agents (active members flagged isSubscribed)
      const subscribed = await this.db.query.spaceMember.findMany({
        where: and(
          eq(schema.spaceMember.spaceId, spaceId),
          eq(schema.spaceMember.memberType, 'agent'),
          eq(schema.spaceMember.isSubscribed, true),
          eq(schema.spaceMember.status, 'active'),
        ),
      });
      if (!subscribed.length) return;

      this.logger.log(
        `Triggering ${subscribed.length} agents for space ${spaceId} (message ${trigger.messageId})`,
      );
      const { latestFrameUrl } =
        this.streamMonitor.getLatestFrameDataForSpace(spaceId);
      const previousMessages = await this.space.getMessages(spaceId, 10);
      const systemTrigger = `
        You are receiving this message because a new message was posted in a space you are subscribed to.
        Recent messages for context:
        ${JSON.stringify(previousMessages)}
        ${latestFrameUrl ? `Note that you are currently monitoring a video stream. Analyze the latest video frame data provided as an image in detail in order to contextualize your response.` : ''}

        If relevant, you may respond with a concise helpful reply or take appropriate actions.
      `;

      for (const agentMember of subscribed) {
        // Basic turn limiting metadata: start at 0
        const fullTriggercontent: any[] = [
          { type: 'text', text: trigger.content },
        ];
        if (latestFrameUrl) {
          fullTriggercontent.push({
            type: 'image_url',
            image_url: { url: latestFrameUrl },
          });
        }
        this.logger.debug(
          `Full trigger content for space ${spaceId}: ${JSON.stringify(fullTriggercontent)}`,
        );

        // Ensure there's a dedicated session for this agent in this space
        const { session: spaceSession, created } =
          await this.session.getOrCreateAgentSpaceSession({
            agentId: agentMember.memberId,
            spaceId,
            initiator: trigger.senderId,
          });

        this.logger.log(
          `Running agent ${agentMember.memberId} ${created ? 'with new session' : 'with existing session'} ${spaceSession.sessionId}`,
          {
            sessionId: spaceSession.sessionId,
            spaceId,
            initiator: trigger.senderId,
          },
        );

        this.agentService
          .runAgent({
            agentId: agentMember.memberId,
            messages: [
              { role: 'system', content: systemTrigger },
              {
                role: 'user',
                content: fullTriggercontent,
              },
            ],
            spaceId,
            sessionId: spaceSession.sessionId,
            initiator: trigger.senderId,
            turnCount: 0,
            maxTurns: 1,
          })
          .subscribe({
            next: () => {},
            error: (err) =>
              this.logger.warn(
                `runAgent failed (${agentMember.memberId}) for space ${spaceId}: ${String(err)}`,
              ),
            complete: () => {
              this.logger.debug(
                `Agent ${agentMember.memberId} completed response for space ${spaceId}`,
              );
            },
          });
      }
    } catch (e) {
      this.logger.warn(`triggerAgentsForSpace error: ${String(e)}`);
    }
  }
}
