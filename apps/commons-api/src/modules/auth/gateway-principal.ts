import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { ApiKeyPrincipal } from './api-key.service';

export function gatewayPrincipal(
  request: Request,
): ApiKeyPrincipal | null | undefined {
  const actorId = request.headers['x-commons-actor-id'];
  if (!actorId) return undefined;
  if (typeof actorId !== 'string') return null;
  const secret = process.env.COMMONS_GATEWAY_INTERNAL_SECRET;
  if (!secret) return null;

  const header = (name: string) => {
    const value = request.headers[name];
    return typeof value === 'string' ? value : '';
  };
  const timestamp = header('x-commons-timestamp');
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 60) {
    return null;
  }
  const path = request.originalUrl.split('?')[0]!;
  const values = [
    timestamp,
    request.method.toUpperCase(),
    path,
    header('x-commons-request-id'),
    actorId,
    header('x-commons-actor-type'),
    header('x-commons-workspace-id'),
    header('x-commons-project-id'),
    header('x-commons-scopes'),
  ];
  const expected = createHmac('sha256', secret)
    .update(values.join('\n'))
    .digest('base64url');
  const supplied = header('x-commons-signature');
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const actorType = header('x-commons-actor-type');
  return {
    principalId: actorId,
    principalType:
      actorType === 'agent' || actorType === 'service' ? actorType : 'user',
    workspaceId: header('x-commons-workspace-id') || null,
    projectId: header('x-commons-project-id') || null,
    scopes: header('x-commons-scopes').split(' ').filter(Boolean),
    authMethod: 'gateway',
  };
}
