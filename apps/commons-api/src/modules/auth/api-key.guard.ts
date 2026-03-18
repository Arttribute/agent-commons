import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const PUBLIC_KEY = 'isPublic';

/**
 * Global API-key guard.
 *
 * Behaviour is controlled by two environment variables:
 *
 *   API_AUTH_REQUIRED=false  — Disables enforcement (opt-out for local dev).
 *                              Default is ENFORCED — set this to disable.
 *
 *   API_SECRET_KEY=<secret>  — The expected bearer token value.
 *
 * Mark any controller or route handler as public with:
 *   @SetMetadata('isPublic', true)
 * or the exported helper decorator @Public().
 *
 * Requests that carry a matching `Authorization: Bearer <key>` header always
 * pass, regardless of the environment variable, so the SDK/CLI work in any env.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly enforced: boolean;
  private readonly secretKey: string | undefined;

  constructor(private readonly reflector: Reflector) {
    // Enforced by default; explicitly set API_AUTH_REQUIRED=false to disable (dev only)
    this.enforced = process.env.API_AUTH_REQUIRED !== 'false';
    this.secretKey = process.env.API_SECRET_KEY;
  }

  canActivate(context: ExecutionContext): boolean {
    // Allow routes decorated with @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader: string | undefined = (request.headers as any)['authorization'];

    // If a valid bearer key is present, always allow (supports SDK/CLI usage)
    if (authHeader && this.secretKey) {
      const token = authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : authHeader;
      if (token === this.secretKey) return true;
    }

    // If enforcement is disabled, pass through
    if (!this.enforced) return true;

    throw new UnauthorizedException('Missing or invalid API key');
  }
}
