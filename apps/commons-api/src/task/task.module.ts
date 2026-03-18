import { forwardRef, Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { TaskExecutionService } from './task-execution.service';
import { TaskSchedulerService } from './task-scheduler.service';
import { DatabaseModule } from '~/modules/database/database.module';
import { ToolModule } from '../tool';
import { SessionModule } from '../session/session.module';
import { OwnerGuard } from '~/modules/auth';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => ToolModule),
    SessionModule,
  ],
  providers: [TaskService, TaskExecutionService, TaskSchedulerService, OwnerGuard],
  controllers: [TaskController],
  exports: [TaskService, TaskExecutionService, TaskSchedulerService],
})
export class TaskModule {}
