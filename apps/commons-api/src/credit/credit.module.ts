import { Module } from '@nestjs/common';
import { DatabaseModule } from '~/modules/database';
import { CreditController } from './credit.controller';
import { CreditService } from './credit.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CreditController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditModule {}
