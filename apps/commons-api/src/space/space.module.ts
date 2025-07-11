import { Module } from '@nestjs/common';

import { SpaceConductor } from './space-conductor.service';
import { SpaceController } from './space.controller';
import { SessionService } from '~/session/session.service';

@Module({
  imports: [],
  controllers: [SpaceController],
  providers: [SpaceConductor, SessionService],
  exports: [SpaceConductor],
})
export class SpaceModule {}
