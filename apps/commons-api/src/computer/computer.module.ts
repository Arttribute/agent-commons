import { Module } from '@nestjs/common';
import { OwnerGuard } from '~/modules/auth';
import { ComputerController } from './computer.controller';
import { ComputerService } from './computer.service';

@Module({
  controllers: [ComputerController],
  providers: [ComputerService, OwnerGuard],
  exports: [ComputerService],
})
export class ComputerModule {}
