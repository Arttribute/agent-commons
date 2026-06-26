import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { CreditModule } from '~/credit';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';

@Module({
  imports: [DatabaseModule, CreditModule],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
