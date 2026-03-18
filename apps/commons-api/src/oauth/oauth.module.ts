// src/oauth/oauth.module.ts

import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthProviderService } from './oauth-provider.service';
import { OAuthConnectionService } from './oauth-connection.service';
import { OAuthStateService } from './oauth-state.service';
import { OAuthFlowService } from './oauth-flow.service';
import { OAuthTokenInjectionService } from './oauth-token-injection.service';

/**
 * OAuthModule
 *
 * Provides OAuth 2.0 authentication services for tools requiring
 * delegated user authorization (e.g., Google Classroom, GitHub, Slack).
 *
 * Features:
 * - Provider registration and management
 * - OAuth flow handling (authorization, callback, refresh)
 * - Secure token storage with AES-256-GCM encryption
 * - Automatic token injection into tool API calls
 * - Connection resolution (initiator → owner priority)
 */
@Module({
  imports: [],
  controllers: [OAuthController],
  providers: [
    OAuthProviderService,
    OAuthConnectionService,
    OAuthStateService,
    OAuthFlowService,
    OAuthTokenInjectionService,
  ],
  exports: [
    OAuthProviderService,
    OAuthConnectionService,
    OAuthFlowService,
    OAuthTokenInjectionService,
  ],
})
export class OAuthModule {}
