import { Module } from '@nestjs/common';
import { BrainModule } from '~/brain';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';

@Module({
  imports: [BrainModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
