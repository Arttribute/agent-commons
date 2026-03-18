import { Global, Module } from '@nestjs/common';
import { ModelProviderFactory } from './model-provider.factory';

@Global()
@Module({
  providers: [ModelProviderFactory],
  exports: [ModelProviderFactory],
})
export class ModelProviderModule {}
