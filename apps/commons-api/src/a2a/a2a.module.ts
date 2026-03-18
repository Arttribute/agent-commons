import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../modules/database';
import { AgentModule } from '../agent/agent.module';
import { A2aService } from './a2a.service';
import { A2aController } from './a2a.controller';

@Module({
  imports: [DatabaseModule, forwardRef(() => AgentModule)],
  controllers: [A2aController],
  providers: [A2aService],
  exports: [A2aService],
})
export class A2aModule {}
