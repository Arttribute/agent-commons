import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { SessionSuggestionsService } from './session-suggestions.service';
import { ProjectModule } from '~/project/project.module';

@Module({
  imports: [ProjectModule],
  providers: [SessionService, SessionSuggestionsService],
  controllers: [SessionController],
  exports: [SessionService],
})
export class SessionModule {}
