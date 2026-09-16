/**
 * Client-credentials token for first-party service-to-service calls.
 *
 * Common Arcade verifies Commons identity tokens directly, so an agent that
 * builds a game there authenticates with this platform's own service identity
 * and names the acting creator in a delegation header. That keeps the flow
 * working for background runs, such as scheduled tasks and heartbeats, where no
 * end-user request is in flight to borrow a token from.
 *
 * This mirrors the helper commons-app uses for its backend calls.
 */

const SERVICE_TOKEN_SCOPE = 'agents:read agents:write';

let cached: { value: string; expiresAt: number; key: string } | null = null;

function envValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value === '""' || value === "''") return undefined;
  return value;
}

/** Discard the memoized token; used by tests and after a 401 from a consumer. */
export function resetCommonsServiceToken() {
  cached = null;
}

export function commonsServiceIdentityConfigured() {
  return Boolean(
    envValue('COMMONS_IDENTITY_ISSUER') &&
      envValue('AGENT_COMMONS_SERVICE_CLIENT_ID') &&
      envValue('AGENT_COMMONS_SERVICE_CLIENT_SECRET'),
  );
}

export async function commonsServiceToken(): Promise<string | null> {
  const issuer = envValue('COMMONS_IDENTITY_ISSUER');
  const clientId = envValue('AGENT_COMMONS_SERVICE_CLIENT_ID');
  const clientSecret = envValue('AGENT_COMMONS_SERVICE_CLIENT_SECRET');
  if (!issuer || !clientId || !clientSecret) return null;

  const key = `${issuer}:${clientId}`;
  if (cached && cached.key === key && cached.expiresAt > Date.now() + 30_000) {
    return cached.value;
  }

  const response = await fetch(`${issuer.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: SERVICE_TOKEN_SCOPE,
      resource: 'commons-platform',
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  if (!response?.ok) return null;
  const token = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!token?.access_token) return null;

  cached = {
    key,
    value: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 600) * 1000,
  };
  return cached.value;
}
