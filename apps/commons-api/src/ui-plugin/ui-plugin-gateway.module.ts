import { forwardRef, Module } from '@nestjs/common';
import { CreditModule } from '~/credit/credit.module';
import { MemoryModule } from '~/memory/memory.module';
import { AgentModule } from '~/agent/agent.module';
import { UiPluginModule } from './ui-plugin.module';
import { UiPluginGatewayController } from './ui-plugin-gateway.controller';
import { UiPluginGatewayService } from './ui-plugin-gateway.service';

/**
 * The bridge gateway runs agents on an app's behalf, so it depends on the
 * agent runtime. It lives apart from UiPluginModule, which the tool layer
 * (and therefore the agent runtime) imports.
 */
@Module({
  imports: [
    UiPluginModule,
    CreditModule,
    MemoryModule,
    forwardRef(() => AgentModule),
  ],
  controllers: [UiPluginGatewayController],
  providers: [UiPluginGatewayService],
})
export class UiPluginGatewayModule {}
