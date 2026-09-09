import { PaymentSessionService } from './payments/payment-session.service';
import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { EncryptionModule } from '~/modules/encryption';
import { CapabilityProviderModule } from '~/provider';

@Module({
  imports: [EncryptionModule, CapabilityProviderModule],
  controllers: [WalletController],
  providers: [WalletService, PaymentSessionService],
  exports: [WalletService],
})
export class WalletModule {}
