import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyService } from './api-key.service';
import { AuthController } from './auth.controller';
import { RateLimitGuard } from './rate-limit.guard';

@Module({
  controllers: [AuthController],
  providers: [
    ApiKeyService,
    // Global guards. Registration order matters: ApiKeyGuard must run before
    // RateLimitGuard so the limiter can key on the authenticated principal.
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [ApiKeyService],
})
export class AuthModule {}
