import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';

@Module({
  controllers: [AuthController],
  providers: [
    ApiKeyService,
    // Global API key guard — registered here so ApiKeyService is in scope
    { provide: APP_GUARD, useClass: ApiKeyGuard },
  ],
  exports: [ApiKeyService],
})
export class AuthModule {}
