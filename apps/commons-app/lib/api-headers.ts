import { auth } from "@/auth";
import type { Session } from "next-auth";
import { normalizePrincipalId } from "@/lib/principal-id";

const serviceTokenCache = new Map<string, { value: string; expiresAt: number }>();
const SERVICE_TOKEN_SCOPE =
  "agents:create agents:read agents:write agents:run activity:read usage:read compute:read compute:write";

type BackendAuthHeaderOptions = {
  allowServiceKey?: boolean;
  preferServiceKey?: boolean;
  preferUserToken?: boolean;
  allowLegacyServiceKey?: boolean;
  /** Reuse a session already resolved by the route to avoid duplicate work. */
  session?: Session | null;
};

type ServiceAuthHeaderOptions = {
  allowLegacyKey?: boolean;
};

function envValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value || value === '""' || value === "''") return undefined;
  return value;
}

/**
 * Returns Authorization headers for server-side requests to the backend API.
 * Signed-in app proxy requests prefer a Commons service identity with explicit
 * user delegation headers. That keeps backend ownership filtering on the stable
 * app-proxy path while preventing legacy service keys from masking a valid user
 * session when the public API gateway rejects them.
 * This file must only be imported from Next.js API routes, not client components.
 */
export async function backendAuthHeaders(
  options: BackendAuthHeaderOptions = {},
): Promise<Record<string, string>> {
  const session = Object.prototype.hasOwnProperty.call(options, "session")
    ? options.session
    : await auth();
  const delegatedUserId = normalizePrincipalId(session?.user?.id);
  const delegatedHeaders: Record<string, string> = delegatedUserId
    ? { "x-initiator": delegatedUserId, "x-owner-id": delegatedUserId }
    : {};
  const hasUserSession = Boolean(session?.user?.id);
  const userHeaders =
    session?.accessToken && !session.accessTokenError
      ? { Authorization: `Bearer ${session.accessToken}` }
      : null;
  const canUseServiceCredential = Boolean(
    options.allowServiceKey || options.preferServiceKey || session?.user?.id,
  );

  if (options.preferUserToken && userHeaders) {
    return { ...userHeaders, ...delegatedHeaders };
  }

  if (canUseServiceCredential) {
    const serviceHeaders = await backendServiceAuthHeaders({
      allowLegacyKey: options.allowLegacyServiceKey ?? !hasUserSession,
    });
    if (serviceHeaders.Authorization) {
      return { ...serviceHeaders, ...delegatedHeaders };
    }
  }

  if (userHeaders) {
    return { ...userHeaders, ...delegatedHeaders };
  }

  if (process.env.ALLOW_LEGACY_MANAGEMENT_AUTH !== "true") return {};
  const key = envValue("NEST_API_SECRET_KEY");
  return key ? { Authorization: `Bearer ${key}`, ...delegatedHeaders } : delegatedHeaders;
}

export async function backendServiceAuthHeaders(
  options: ServiceAuthHeaderOptions = {},
): Promise<Record<string, string>> {
  const identityToken = await commonsIdentityServiceToken();
  if (identityToken) return { Authorization: `Bearer ${identityToken}` };

  if (options.allowLegacyKey === false) return {};

  const serviceKey =
    envValue("AGENT_COMMONS_API_KEY") ||
    envValue("COMMONS_API_KEY") ||
    envValue("NEST_API_SECRET_KEY");
  if (serviceKey) return { Authorization: `Bearer ${serviceKey}` };

  return {};
}

/**
 * Resolve an Agent Commons account id from an email via the identity service.
 * Returns null when identity is unreachable, unconfigured, or has no match.
 */
export async function resolvePrincipalByEmail(
  email: string,
): Promise<string | null> {
  const issuer = envValue("COMMONS_IDENTITY_ISSUER");
  const token = await commonsIdentityServiceToken();
  if (!issuer || !token) return null;
  const base = issuer.replace(/\/api\/auth\/?$/, "");
  const response = await fetch(
    `${base}/api/identity/users/resolve?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  ).catch(() => null);
  if (!response?.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    data?: { userId?: string };
  } | null;
  return payload?.data?.userId ?? null;
}

async function commonsIdentityServiceToken() {
  const issuer = envValue("COMMONS_IDENTITY_ISSUER");
  const clientId = envValue("AGENT_COMMONS_SERVICE_CLIENT_ID");
  const clientSecret = envValue("AGENT_COMMONS_SERVICE_CLIENT_SECRET");
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
      scope: SERVICE_TOKEN_SCOPE,
      resource: "commons-platform",
    }),
  }).catch(() => null);

  if (!response?.ok) {
    if (response) {
      const body = await response.text().catch(() => "");
      console.error("Commons identity service token request failed", {
        status: response.status,
        body: body.slice(0, 240),
      });
    }
    return null;
  }
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
