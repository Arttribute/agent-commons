import { forwardRef, Module } from '@nestjs/common';
import { AttributionController } from './attribution.controller';
import { AttributionService } from './attribution.service';
import { AgentModule } from '../agent';

@Module({
  imports: [forwardRef(() => AgentModule)],
  controllers: [AttributionController],
  providers: [AttributionService],
  exports: [AttributionService],
})
export class AttributionModule {}
