import { Global, Module } from '@nestjs/common';
import { EncryptionServiceProvider } from './encryption.service';

/**
 * EncryptionModule
 *
 * Provides encryption/decryption services for sensitive data.
 * Marked as @Global() so it's available throughout the application.
 */
@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [EncryptionServiceProvider],
  exports: [EncryptionServiceProvider],
})
export class EncryptionModule {}
