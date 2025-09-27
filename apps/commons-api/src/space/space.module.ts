import { Module, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { SpaceService } from './space.service';
import { SpaceController } from './space.controller';
import { SpaceStreamController } from './space-stream.controller';
import { DatabaseModule } from '~/modules/database/database.module';
import { AgentModule } from '~/agent/agent.module';
import { SessionModule } from '~/session/session.module';
import { WebCaptureService } from './web-capture.service';
import { StreamMonitorService } from './stream-monitor.service';
import { SpaceRtcGateway } from './space-rtc.gateway';
import { TranscriptionDeliveryService } from './transcription-delivery.service';
import { SpaceToolsService } from './space-tools.service';
import { SpaceAgentTriggerService } from './space-agent-trigger.service';
import { SpaceSpeechService } from './space-speech.service';
import { SpaceTtsService } from './space-tts.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => AgentModule), SessionModule],
  controllers: [SpaceController, SpaceStreamController],
  providers: [
    SpaceService,
    {
      provide: EventEmitter,
      useValue: new EventEmitter(),
    },
    WebCaptureService,
    StreamMonitorService,
    SpaceRtcGateway,
    TranscriptionDeliveryService,
    SpaceToolsService,
    SpaceAgentTriggerService,
    SpaceSpeechService,
    SpaceTtsService,
  ],
  exports: [
    SpaceService,
    WebCaptureService,
    StreamMonitorService,
    TranscriptionDeliveryService,
    SpaceToolsService,
    SpaceAgentTriggerService,
    SpaceSpeechService,
    SpaceTtsService,
  ],
})
export class SpaceModule {}
