// apps/commons-api/src/space/transcription-delivery.service.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { AgentService } from '~/agent/agent.service';
import { SpaceService } from '~/space/space.service';

interface TranscriptionEvent {
  sessionId: string;
  spaceId: string;
  participantId: string;
  transcript: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  audioLevel?: number;
  type?: 'audio' | 'video' | 'speech_event';
}

@Injectable()
export class TranscriptionDeliveryService extends EventEmitter {
  private readonly logger = new Logger(TranscriptionDeliveryService.name);

  constructor(
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
    @Inject(forwardRef(() => SpaceService))
    private readonly spaceService: SpaceService,
  ) {
    super();
  }

  async deliverTranscriptionToAgent(
    agentId: string,
    transcription: TranscriptionEvent,
  ): Promise<void> {
    try {
      this.logger.log(`Delivering transcription to ${agentId}`);

      const response$ = this.agentService.runAgent({
        agentId,
        messages: [
          {
            role: 'system',
            content: `STREAM_TRANSCRIPTION_UPDATE:
              Space: ${transcription.spaceId}
              Participant: ${transcription.participantId}
              Timestamp: ${new Date(transcription.timestamp).toISOString()}
              Confidence: ${transcription.confidence}
              Kind: ${transcription.type ?? 'audio'}

              Transcription: "${transcription.transcript}"

              You are receiving this because you are monitoring this stream. Consider whether to act on this info (e.g., summarize, trigger a tool) or continue silently.
            `,
          },
        ],
        initiator: 'stream-monitor',
        spaceId: transcription.spaceId,
        stream: false,
        maxTurns: 1,
      });

      response$.subscribe({
        next: (chunk) => {
          if ((chunk as any).type === 'final') {
            this.logger.log(
              `Agent ${agentId} processed transcription: ${((chunk as any).payload?.content ?? '').slice(0, 120)}...`,
            );
          }
        },
        error: (error) =>
          this.logger.error(`Error delivering to ${agentId}`, error),
      });
    } catch (error) {
      this.logger.error(`Failed to deliver transcription to ${agentId}`, error);
    }
  }

  async broadcastTranscriptionToSpace(
    spaceId: string,
    transcription: TranscriptionEvent,
    monitoringAgents: string[],
  ): Promise<void> {
    this.logger.log(
      `Broadcasting to ${monitoringAgents.length} agents in ${spaceId}`,
    );
    await Promise.allSettled(
      monitoringAgents.map((agentId) =>
        this.deliverTranscriptionToAgent(agentId, transcription),
      ),
    );
  }
}
8;
