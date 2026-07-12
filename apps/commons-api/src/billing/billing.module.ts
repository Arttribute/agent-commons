import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { CreditModule } from '~/credit/credit.module';
import { StripeProvider } from './stripe.provider';
import { EntitlementsService } from './entitlements.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingSweeperService } from './billing-sweeper.service';

@Module({
  imports: [DatabaseModule, CreditModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    StripeProvider,
    EntitlementsService,
    BillingService,
    BillingSweeperService,
  ],
  exports: [EntitlementsService, BillingService],
})
export class BillingModule {}
