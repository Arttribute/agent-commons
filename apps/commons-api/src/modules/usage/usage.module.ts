import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { CreditModule } from '~/credit';
import { BillingModule } from '~/billing/billing.module';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';

@Module({
  imports: [DatabaseModule, CreditModule, BillingModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
