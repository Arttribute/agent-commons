import { Module } from '@nestjs/common';
import { UiPluginController } from './ui-plugin.controller';
import { UiPluginService } from './ui-plugin.service';
import { AppDataService } from './app-data/app-data.service';
import { AppNetworkService } from './app-network/app-network.service';

@Module({
  controllers: [UiPluginController],
  providers: [UiPluginService, AppDataService, AppNetworkService],
  exports: [UiPluginService, AppDataService, AppNetworkService],
})
export class UiPluginModule {}
