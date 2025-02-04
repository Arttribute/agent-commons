import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PinataModule } from './pinata/pinata.module';

@Module({
  imports: [PinataModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
