import { Module } from '@nestjs/common';
import { GoalService } from './goal.service';
import { GoalController } from './goal.controller';
import { DatabaseModule } from '~/modules/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [GoalService],
  controllers: [GoalController],
  exports: [GoalService],
})
export class GoalModule {}
