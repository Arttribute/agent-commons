import { ForbiddenException } from '@nestjs/common';
export function assertOpsReader(
  principal:
    | { principalType?: string; scopes?: string[]; workspaceId?: string | null }
    | undefined,
) {
  const env = process.env.APP_ENV || process.env.NODE_ENV;
  if (
    principal?.principalType !== 'service' ||
    !principal.scopes?.includes('ops:read') ||
    !['staging', 'production'].includes(env ?? '') ||
    principal.workspaceId !== `ops:${env}`
  ) {
    throw new ForbiddenException(
      'Environment-bound ops:read service scope is required',
    );
  }
}
