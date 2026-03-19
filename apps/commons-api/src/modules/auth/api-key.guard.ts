import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from './api-key.service';

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

    // 1. Management service key — always passes, no principal attached
    if (token && this.secretKey && token === this.secretKey) {
      return true;
    }

    // 2. Per-principal key (sk-ac-*) — DB lookup, attach principal to request
    if (token && token.startsWith('sk-ac-')) {
      const principal = await this.apiKeyService.validate(token);
      if (principal) {
        request.principal = principal;
        return true;
      }
    }

    // 3. Auth disabled for local dev
    if (!this.enforced) return true;

    throw new UnauthorizedException('Missing or invalid API key');
  }
}
