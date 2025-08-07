import { Module, forwardRef } from '@nestjs/common';
import { EventEmitter } from 'events';
import { SpaceService } from './space.service';
import { SpaceController } from './space.controller';
import { DatabaseModule } from '~/modules/database/database.module';
import { AgentModule } from '~/agent/agent.module';
import { SessionModule } from '~/session/session.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AgentModule), SessionModule],
  controllers: [SpaceController],
  providers: [
    SpaceService,
    {
      provide: EventEmitter,
      useValue: new EventEmitter(),
    },
  ],
  exports: [SpaceService],
})
export class SpaceModule {}
