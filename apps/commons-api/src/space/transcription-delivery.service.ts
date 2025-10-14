// apps/commons-api/src/space/transcription-delivery.service.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { AgentService } from '~/agent/agent.service';
import { SpaceService } from '~/space/space.service';
import { StreamMonitorService } from './stream-monitor.service';

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
    @Inject(forwardRef(() => StreamMonitorService))
    private readonly streamMonitor: StreamMonitorService,
  ) {
    super();
  }

  async deliverTranscriptionToAgent(
    agentId: string,
    transcription: TranscriptionEvent,
  ): Promise<void> {
    try {
      this.logger.log(`Delivering transcription to ${agentId}`);
      console.log('Actual audio transcription: ', transcription);

      const { latestFrameUrl } = this.streamMonitor.getLatestFrameDataForSpace(
        transcription.spaceId,
      );
      const userContent: any[] = [
        {
          type: 'text',
          text: ` 
            Participant: ${transcription.participantId}
            Timestamp: ${new Date(transcription.timestamp).toISOString()}
            MessageContent: ${transcription.transcript}`,
        },
      ];
      if (latestFrameUrl) {
        userContent.push({
          type: 'image_url',
          image_url: { url: latestFrameUrl },
        });
      }

      const response$ = this.agentService.runAgent({
        agentId,
        messages: [
          {
            role: 'system',
            content: `
              STREAM_TRANSCRIPTION_UPDATE:
              Space: ${transcription.spaceId}
              Participant: ${transcription.participantId}
              Timestamp: ${new Date(transcription.timestamp).toISOString()}
              Confidence: ${transcription.confidence}
              Kind: ${transcription.type ?? 'audio'}

              You are receiving this because you are listening to a live ${transcription.type ?? 'audio'} stream. Use the MessageContent to decide whether to respond or act. Typically you are expected to respond in voice using the speakInSpace tool.
            `,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        initiator: transcription.participantId,
        spaceId: transcription.spaceId,
        turnCount: 0,
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
