import { Global, Module } from '@nestjs/common';
import { DatabaseServiceProvider } from './database.service';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [DatabaseServiceProvider],
  exports: [DatabaseServiceProvider],
})
export class DatabaseModule {}
