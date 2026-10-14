import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';
import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CreditController, ReferralController],
  providers: [CreditService, ReferralService],
  exports: [CreditService],
})
export class CreditModule {}
