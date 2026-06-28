import { auth } from "@/auth";

const serviceTokenCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Returns Authorization header for server-side requests to the backend API.
 * Uses NEST_API_SECRET_KEY — a server-side-only env var (no NEXT_PUBLIC_ prefix).
 * This file must only be imported from Next.js API routes, not client components.
 */
export async function backendAuthHeaders(options: { allowServiceKey?: boolean } = {}): Promise<Record<string, string>> {
  const session = await auth();
  if (session?.accessToken) {
    return { Authorization: `Bearer ${session.accessToken}` };
  }
  if (options.allowServiceKey) {
    const identityToken = await commonsIdentityServiceToken();
    if (identityToken) return { Authorization: `Bearer ${identityToken}` };

    const serviceKey =
      process.env.AGENT_COMMONS_API_KEY ||
      process.env.COMMONS_API_KEY ||
      process.env.NEST_API_SECRET_KEY;
    if (serviceKey) return { Authorization: `Bearer ${serviceKey}` };
  }
  if (process.env.ALLOW_LEGACY_MANAGEMENT_AUTH !== "true") return {};
  const key = process.env.NEST_API_SECRET_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function commonsIdentityServiceToken() {
  const issuer = process.env.COMMONS_IDENTITY_ISSUER;
  const clientId =
    process.env.AGENT_COMMONS_SERVICE_CLIENT_ID ||
    process.env.COMMONS_IDENTITY_CLIENT_ID;
  const clientSecret =
    process.env.AGENT_COMMONS_SERVICE_CLIENT_SECRET ||
    process.env.COMMONS_IDENTITY_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) return null;

  const cacheKey = `${issuer}:${clientId}`;
  const cached = serviceTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const response = await fetch(`${issuer.replace(/\/$/, "")}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "oauth:read oauth:write agents:read agents:run",
      resource: "commons-platform",
    }),
  }).catch(() => null);

  if (!response?.ok) return null;
  const token = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!token?.access_token) return null;

  serviceTokenCache.set(cacheKey, {
    value: token.access_token,
    expiresAt: Date.now() + (token.expires_in ?? 600) * 1000,
  });
  return token.access_token;
}
