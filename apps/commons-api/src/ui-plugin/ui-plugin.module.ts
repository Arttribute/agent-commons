import { Module } from '@nestjs/common';
import { UiPluginController } from './ui-plugin.controller';
import { UiPluginService } from './ui-plugin.service';

@Module({
  controllers: [UiPluginController],
  providers: [UiPluginService],
  exports: [UiPluginService],
})
export class UiPluginModule {}
