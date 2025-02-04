import { Module } from '@nestjs/common';
import { PinataService } from './pinata.service';
import { PinataController } from './pinata.controller';

@Module({
  providers: [PinataService],
  controllers: [PinataController],
  exports: [PinataService],
})
export class PinataModule {}
