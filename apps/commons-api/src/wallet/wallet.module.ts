import { PaymentSessionService } from './payments/payment-session.service';
import { TransferAllowanceService } from './payments/transfer-allowance.service';
import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { EncryptionModule } from '~/modules/encryption';
import { CapabilityProviderModule } from '~/provider';

@Module({
  imports: [EncryptionModule, CapabilityProviderModule],
  controllers: [WalletController],
  providers: [WalletService, PaymentSessionService, TransferAllowanceService],
  exports: [WalletService, TransferAllowanceService],
})
export class WalletModule {}
