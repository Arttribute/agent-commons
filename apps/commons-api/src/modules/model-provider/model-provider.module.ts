import { Global, Module } from '@nestjs/common';
import { ModelProviderFactory } from './model-provider.factory';
import { ModelProviderController } from './model-provider.controller';

@Global()
@Module({
  controllers: [ModelProviderController],
  providers: [ModelProviderFactory],
  exports: [ModelProviderFactory],
})
export class ModelProviderModule {}
