import { Module } from '@nestjs/common';
import { DatabaseModule } from '../modules/database';
import { SkillService } from './skill.service';
import { SkillController } from './skill.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SkillController],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
