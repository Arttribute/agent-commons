import { Module } from '@nestjs/common';
import { OwnerGuard } from '~/modules/auth';
import { CreditModule } from '~/credit/credit.module';
import { BillingModule } from '~/billing/billing.module';
import { ComputerController } from './computer.controller';
import { ComputerMigrationService } from './computer-migration.service';
import { ComputerService } from './computer.service';
import { ComputeMeteringService } from './compute-metering.service';
import { CapabilityProviderModule } from '~/provider';
import { ResourceUpgradeService } from './resource-upgrade.service';

@Module({
  imports: [CreditModule, BillingModule, CapabilityProviderModule],
  controllers: [ComputerController],
  providers: [
    ComputerMigrationService,
    ComputerService,
    ComputeMeteringService,
    ResourceUpgradeService,
    OwnerGuard,
  ],
  exports: [ComputerService, ResourceUpgradeService],
})
export class ComputerModule {}
