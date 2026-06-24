import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from './api-key.service';
import {
  claimScopes,
  isCommonsIdentityConfigured,
  verifyCommonsIdentityToken,
} from './identity-token';
import { gatewayPrincipal } from './gateway-principal';

export const PUBLIC_KEY = 'isPublic';

/**
 * Global API-key guard.
 *
 * Auth is checked in priority order:
 *
 *   1. @Public() decorator — skip auth entirely for that route.
 *
 *   2. API_SECRET_KEY env var match — the commons-app management service key.
 *      Full access, no principal attached to the request.
 *
 *   3. sk-ac-* token — a per-principal key from the api_keys DB table.
 *      On success, attaches `request.principal = { principalId, principalType }`
 *      so downstream handlers know who is calling.
 *
 *   4. API_AUTH_REQUIRED=false — disables enforcement for local dev.
 *      Default is ENFORCED.
 *
 * Key formats:
 *   - Management key: any opaque string set in API_SECRET_KEY env var
 *   - Per-principal:  sk-ac-<32 hex chars>
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly enforced: boolean;
  private readonly secretKey: string | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {
    this.enforced = process.env.API_AUTH_REQUIRED !== 'false';
    this.secretKey = process.env.API_SECRET_KEY;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<any>();
    const authHeader: string | undefined = request.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader;

    // Requests from api.agentcommons.io carry a short-lived, HMAC-signed
    // principal envelope. Public credentials never reach internal services.
    const forwardedPrincipal = gatewayPrincipal(request);
    if (forwardedPrincipal) {
      request.principal = forwardedPrincipal;
      return true;
    }
    if (forwardedPrincipal === null) {
      throw new UnauthorizedException('Invalid gateway principal signature');
    }

    // 1. Canonical Commons identity token — preferred for every interactive
    // app and for delegated service calls.
    if (token && isCommonsIdentityConfigured()) {
      const claims = await verifyCommonsIdentityToken(token);
      if (claims) {
        request.principal = {
          principalId: claims.sub,
          principalType:
            claims.actor_type === 'agent'
              ? 'agent'
              : claims.actor_type === 'service'
                ? 'service'
                : 'user',
          workspaceId: claims.workspace_id ?? null,
          scopes: claimScopes(claims),
          authMethod: 'identity_token',
        };
        return true;
      }
    }

    // 2. Management service key — compatibility-only. New services should use
    // OAuth client credentials so a principal is always attached.
    if (token && this.secretKey && token === this.secretKey) {
      return true;
    }

    // 3. Per-principal key (sk-ac-*) — retained for automation and migration.
    if (token && token.startsWith('sk-ac-')) {
      const principal = await this.apiKeyService.validate(token);
      if (principal) {
        request.principal = principal;
        return true;
      }
    }

    // 4. Auth disabled for local dev
    if (!this.enforced) return true;

    throw new UnauthorizedException('Missing or invalid API key');
  }
}
