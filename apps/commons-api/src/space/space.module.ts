import { Module, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { SpaceService } from './space.service';
import { SpaceController } from './space.controller';
import { DatabaseModule } from '~/modules/database/database.module';
import { AgentModule } from '~/agent/agent.module';
import { SessionModule } from '~/session/session.module';
import { SpaceRTCService } from './space-rtc.service';
import { SpaceRTCGateway } from './space-rtc.gateway';
import { AiMediaBridgeService } from './ai-media-bridge.service';
import { AgentMediaController } from './agent-media.controller';
import { WebCaptureService } from './web-capture.service';
import { StreamMonitorService } from './stream-monitor.service';
import { TranscriptionDeliveryService } from './transcription-delivery.service';
import { SpaceToolsService } from './space-tools.service';
import { SpaceAgentTriggerService } from './space-agent-trigger.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => AgentModule), SessionModule],
  controllers: [SpaceController, AgentMediaController],
  providers: [
    SpaceService,
    {
      provide: EventEmitter,
      useValue: new EventEmitter(),
    },
    SpaceRTCService,
    SpaceRTCGateway,
    AiMediaBridgeService,
    WebCaptureService,
    StreamMonitorService,
    TranscriptionDeliveryService,
    SpaceToolsService,
    SpaceAgentTriggerService,
  ],
  exports: [
    SpaceService,
    SpaceRTCService,
    AiMediaBridgeService,
    WebCaptureService,
    StreamMonitorService,
    TranscriptionDeliveryService,
    SpaceToolsService,
    SpaceAgentTriggerService,
  ],
})
export class SpaceModule {}
