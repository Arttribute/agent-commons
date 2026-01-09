import { forwardRef, Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskExecutionService } from './task-execution.service';
import { DatabaseModule } from '~/modules/database/database.module';
import { ToolModule } from '../tool';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => ToolModule), // For WorkflowService dependency
    SessionModule, // For SessionService dependency
  ],
  providers: [TaskService, TaskExecutionService],
  controllers: [TaskController],
  exports: [TaskService, TaskExecutionService],
})
export class TaskModule {}
