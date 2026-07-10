import { Module } from '@nestjs/common';
import { OwnerGuard } from '~/modules/auth';
import { ComputerController } from './computer.controller';
import { ComputerMigrationService } from './computer-migration.service';
import { ComputerService } from './computer.service';

@Module({
  controllers: [ComputerController],
  providers: [ComputerMigrationService, ComputerService, OwnerGuard],
  exports: [ComputerService],
})
export class ComputerModule {}
