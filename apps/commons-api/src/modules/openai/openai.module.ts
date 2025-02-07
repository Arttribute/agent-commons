import { Global, Module } from '@nestjs/common';
import { OpenAIServiceProvider } from './openai.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [OpenAIServiceProvider],
  exports: [OpenAIServiceProvider],
})
export class OpenAIModule {}
