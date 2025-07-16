import { Module, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { SpaceService } from './space.service';
import { SpaceController } from './space.controller';
import { SpaceBusService } from './space-bus.service';
import { DatabaseModule } from '~/modules/database/database.module';
import { AgentModule } from '~/agent/agent.module';
import { SessionModule } from '~/session/session.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AgentModule), SessionModule],
  controllers: [SpaceController],
  providers: [
    SpaceService,
    SpaceBusService,
    {
      provide: EventEmitter,
      useValue: new EventEmitter(),
    },
  ],
  exports: [SpaceService, SpaceBusService],
})
export class SpaceModule {}
