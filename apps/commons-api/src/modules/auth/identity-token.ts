export interface CommonsIdentityClaims {
  sub: string;
  azp?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  workspace_id?: string | null;
  actor_type?: 'user' | 'agent' | 'service';
  scope?: string | string[];
  scopes?: string[];
  email?: string;
}

let jwks: unknown;

async function configuredJwks() {
  if (jwks) return jwks;
  const url = process.env.COMMONS_IDENTITY_JWKS_URL;
  if (!url) return null;
  const { createRemoteJWKSet } = await import('jose');
  jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

export function isCommonsIdentityConfigured(): boolean {
  return Boolean(
    process.env.COMMONS_IDENTITY_ISSUER &&
      process.env.COMMONS_IDENTITY_JWKS_URL,
  );
}

export async function verifyCommonsIdentityToken(
  token: string,
): Promise<CommonsIdentityClaims | null> {
  const remoteJwks = await configuredJwks();
  const issuer = process.env.COMMONS_IDENTITY_ISSUER;
  if (!remoteJwks || !issuer) return null;

  try {
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(token, remoteJwks as any, {
      issuer,
      audience: process.env.COMMONS_IDENTITY_AUDIENCE ?? 'commons-platform',
      algorithms: ['ES256'],
    });
    const claims = payload as unknown as CommonsIdentityClaims;
    if (!claims.sub && claims.actor_type === 'service' && claims.azp) {
      claims.sub = claims.azp;
    }
    if (!claims.sub) return null;
    return claims;
  } catch {
    return null;
  }
}

export function claimScopes(claims: CommonsIdentityClaims): string[] {
  if (Array.isArray(claims.scopes)) return claims.scopes;
  if (Array.isArray(claims.scope)) return claims.scope;
  if (typeof claims.scope === 'string') {
    return claims.scope.split(' ').filter(Boolean);
  }
  return [];
}
