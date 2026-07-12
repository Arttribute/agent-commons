import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { BillingModule } from '~/billing/billing.module';
import { FlagService } from './flag.service';
import { FlagController } from './flag.controller';

@Module({
  imports: [DatabaseModule, BillingModule],
  controllers: [FlagController],
  providers: [FlagService],
  exports: [FlagService],
})
export class FlagModule {}
