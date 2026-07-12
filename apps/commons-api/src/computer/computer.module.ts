import { Module } from '@nestjs/common';
import { OwnerGuard } from '~/modules/auth';
import { CreditModule } from '~/credit/credit.module';
import { BillingModule } from '~/billing/billing.module';
import { ComputerController } from './computer.controller';
import { ComputerMigrationService } from './computer-migration.service';
import { ComputerService } from './computer.service';
import { ComputeMeteringService } from './compute-metering.service';

@Module({
  imports: [CreditModule, BillingModule],
  controllers: [ComputerController],
  providers: [
    ComputerMigrationService,
    ComputerService,
    ComputeMeteringService,
    OwnerGuard,
  ],
  exports: [ComputerService],
})
export class ComputerModule {}
