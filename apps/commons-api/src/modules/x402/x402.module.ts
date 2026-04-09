import { Global, Module } from '@nestjs/common';
import { X402Guard } from './x402.guard';

@Global()
@Module({
  providers: [X402Guard],
  exports: [X402Guard],
})
export class X402Module {}
