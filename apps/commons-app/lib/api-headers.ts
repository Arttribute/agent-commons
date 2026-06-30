import { auth } from "@/auth";
import { normalizePrincipalId } from "@/lib/principal-id";

const serviceTokenCache = new Map<string, { value: string; expiresAt: number }>();

function envValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value === '""' || value === "''") return undefined;
  return value;
}

/**
 * Returns Authorization header for server-side requests to the backend API.
 * Uses NEST_API_SECRET_KEY — a server-side-only env var (no NEXT_PUBLIC_ prefix).
 * This file must only be imported from Next.js API routes, not client components.
 */
export async function backendAuthHeaders(
  options: { allowServiceKey?: boolean; preferServiceKey?: boolean } = {},
): Promise<Record<string, string>> {
  const session = await auth();
  const delegatedUserId = normalizePrincipalId(session?.user?.id);
  const delegatedHeaders: Record<string, string> = delegatedUserId
    ? { "x-initiator": delegatedUserId, "x-owner-id": delegatedUserId }
    : {};

  const serviceHeaders =
    options.allowServiceKey || session?.user?.id
      ? await backendServiceAuthHeaders()
      : {};

  if ((options.preferServiceKey || session?.user?.id) && serviceHeaders.Authorization) {
    return { ...serviceHeaders, ...delegatedHeaders };
  }

  if (session?.accessToken && !session.accessTokenError) {
    return {
      Authorization: `Bearer ${session.accessToken}`,
      ...delegatedHeaders,
    };
  }

  if (serviceHeaders.Authorization) {
    return { ...serviceHeaders, ...delegatedHeaders };
  }

  if (process.env.ALLOW_LEGACY_MANAGEMENT_AUTH !== "true") return {};
  const key = envValue("NEST_API_SECRET_KEY");
  return key ? { Authorization: `Bearer ${key}`, ...delegatedHeaders } : delegatedHeaders;
}

export async function backendServiceAuthHeaders(): Promise<Record<string, string>> {
  const identityToken = await commonsIdentityServiceToken();
  if (identityToken) return { Authorization: `Bearer ${identityToken}` };

  const serviceKey =
    envValue("AGENT_COMMONS_API_KEY") ||
    envValue("COMMONS_API_KEY") ||
    envValue("NEST_API_SECRET_KEY");
  if (serviceKey) return { Authorization: `Bearer ${serviceKey}` };

  return {};
}

async function commonsIdentityServiceToken() {
  const issuer = envValue("COMMONS_IDENTITY_ISSUER");
  const clientId =
    envValue("AGENT_COMMONS_SERVICE_CLIENT_ID") ||
    envValue("COMMONS_IDENTITY_CLIENT_ID");
  const clientSecret =
    envValue("AGENT_COMMONS_SERVICE_CLIENT_SECRET") ||
    envValue("COMMONS_IDENTITY_CLIENT_SECRET");
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
      scope:
        "agents:read agents:write agents:run activity:read usage:read oauth:read oauth:write compute:read compute:write",
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
