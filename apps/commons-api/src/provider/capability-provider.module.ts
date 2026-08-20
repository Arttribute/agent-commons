import { Module } from '@nestjs/common';
import { CapabilityProviderController } from './capability-provider.controller';
import { CapabilityProviderService } from './capability-provider.service';

@Module({
  controllers: [CapabilityProviderController],
  providers: [CapabilityProviderService],
  exports: [CapabilityProviderService],
})
export class CapabilityProviderModule {}
