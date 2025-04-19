import { Module } from '@nestjs/common';
import { AutonomyService } from './autonomy.service';
import { AutonomyController } from './autonomy.controller';
import { DatabaseModule } from '~/modules/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [AutonomyService],
  controllers: [AutonomyController],
  exports: [AutonomyService],
})
export class AutonomyModule {}
