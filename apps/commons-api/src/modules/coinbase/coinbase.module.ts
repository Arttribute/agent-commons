import { Global, Module } from '@nestjs/common';
import { CoinbaseServiceProvider } from './coinbase.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [CoinbaseServiceProvider],
  exports: [CoinbaseServiceProvider],
})
export class CoinbaseModule {}
