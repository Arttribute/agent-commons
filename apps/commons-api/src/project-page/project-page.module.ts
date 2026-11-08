import { Module } from '@nestjs/common';
import { ProjectModule } from '~/project';
import { CodeProjectModule } from '~/code-project';
import { ProjectPageService } from './project-page.service';
import {
  ProjectPageController,
  ProjectPagesController,
  ProjectPageSdkController,
} from './project-page.controller';
@Module({
  imports: [ProjectModule, CodeProjectModule],
  providers: [ProjectPageService],
  controllers: [
    ProjectPageController,
    ProjectPagesController,
    ProjectPageSdkController,
  ],
  exports: [ProjectPageService],
})
export class ProjectPageModule {}
