import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

const issuer = process.env.COMMONS_IDENTITY_ISSUER;
const clientId = process.env.COMMONS_IDENTITY_CLIENT_ID;
const clientSecret = process.env.COMMONS_IDENTITY_CLIENT_SECRET;
const AUTH_SESSION_VERSION = (
  process.env.COMMONS_AUTH_SESSION_VERSION ?? "v2"
).replace(/[^a-zA-Z0-9_-]/g, "-");
const identityBaseUrl = issuer?.replace(/\/api\/auth\/?$/, "");

// Rotating refresh tokens can only be exchanged once. Coalesce parallel page
// and API requests so they cannot invalidate one another and emit brief 401s.
const refreshFlights = new Map<string, Promise<any>>();

async function activateProduct(accessToken: unknown) {
  if (!issuer || typeof accessToken !== "string") return null;
  const response = await fetch(
    `${issuer.replace(/\/api\/auth\/?$/, "")}/api/identity/apps/agent-commons/activate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  ).catch(() => null);
  if (!response?.ok) return null;
  const identity = (await response.json()) as {
    firstActivation?: boolean;
    userId?: string;
    workspaceId?: string | null;
    image?: string | null;
  };
  // Provision the new user's credit account during the first product
  // activation. The credit service performs the 500-credit grant atomically;
  // the normal studio balance request safely retries if this network call is
  // unavailable during sign-in.
  if (identity.firstActivation) {
    await provisionCreditAccount(accessToken);
  }
  return identity;
}

async function provisionCreditAccount(accessToken: string) {
  const apiUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL?.replace(/\/$/, "");
  if (!apiUrl) return;
  await fetch(`${apiUrl}/v1/credits/balance`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(2_500),
  }).catch(() => null);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  if (!payload) return {};
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function exchangeIdentitySessionToken(identitySessionToken: string) {
  if (!identityBaseUrl) throw new Error("Commons Identity is not configured.");
  const response = await fetch(`${identityBaseUrl}/api/auth/token`, {
    headers: { Authorization: `Bearer ${identitySessionToken}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Commons Identity authorization expired.");
  const data = (await response.json()) as { token?: string };
  if (!data.token) throw new Error("Commons Identity did not return an access token.");
  const claims = decodeJwtPayload(data.token);
  if (
    typeof claims.sub !== "string" ||
    claims.iss !== issuer ||
    (claims.aud !== "commons-platform" &&
      !(Array.isArray(claims.aud) && claims.aud.includes("commons-platform")))
  ) {
    throw new Error("Commons Identity returned an invalid access token.");
  }
  return {
    accessToken: data.token,
    accessTokenExpiresAt:
      typeof claims.exp === "number"
        ? claims.exp * 1000
        : Date.now() + 10 * 60 * 1000,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      name: typeof claims.name === "string" ? claims.name : undefined,
      image: typeof claims.picture === "string" ? claims.picture : undefined,
      workspaceId:
        typeof claims.workspace_id === "string"
          ? claims.workspace_id
          : undefined,
    },
  };
}

async function performAccessTokenRefresh(token: any) {
  if (token.identitySessionToken) {
    try {
      const exchanged = await exchangeIdentitySessionToken(
        String(token.identitySessionToken),
      );
      return {
        ...token,
        accessToken: exchanged.accessToken,
        accessTokenExpiresAt: exchanged.accessTokenExpiresAt,
        identityUserId: exchanged.user.id,
        workspaceId: exchanged.user.workspaceId ?? token.workspaceId,
        accessTokenError: undefined,
      };
    } catch {
      return { ...token, accessTokenError: "RefreshAccessTokenError" };
    }
  }
  if (!issuer || !token.refreshToken) return token;
  try {
    const response = await fetch(`${issuer}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        client_id: process.env.COMMONS_IDENTITY_CLIENT_ID ?? "",
        ...(process.env.COMMONS_IDENTITY_CLIENT_SECRET
          ? { client_secret: process.env.COMMONS_IDENTITY_CLIENT_SECRET }
          : {}),
      }),
    });
    if (!response.ok) return { ...token, accessTokenError: "RefreshAccessTokenError" };
    const refreshed = (await response.json()) as {
      access_token: string;
      expires_in?: number;
      refresh_token?: string;
    };
    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      accessTokenExpiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      accessTokenError: undefined,
    };
  } catch {
    return { ...token, accessTokenError: "RefreshAccessTokenError" };
  }
}

async function refreshAccessToken(token: any) {
  const key = String(token.identitySessionToken ?? token.refreshToken ?? "");
  if (!key) return token;
  const existing = refreshFlights.get(key);
  if (existing) return existing;
  const flight = performAccessTokenRefresh(token).finally(() => {
    refreshFlights.delete(key);
  });
  refreshFlights.set(key, flight);
  return flight;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: issuer && clientId
    ? [
        {
          id: "commons",
          name: "Commons",
          type: "oidc",
          issuer,
          clientId,
          clientSecret,
          authorization: {
            params: {
              scope:
                "openid email profile offline_access agents:read agents:write agents:run activity:read usage:read",
              resource: "commons-platform",
            },
          },
          checks: ["pkce", "state"],
          profile(profile: {
            sub: string;
            email?: string;
            name?: string;
            picture?: string;
            workspace_id?: string;
          }) {
            return {
              id: profile.sub,
              identityUserId: profile.sub,
              workspaceId: profile.workspace_id,
              email: profile.email,
              name: profile.name ?? profile.email?.split("@")[0],
              image: profile.picture,
            };
          },
        },
        Credentials({
          id: "desktop-device",
          name: "Agent Commons Desktop",
          credentials: {
            identitySessionToken: { type: "password" },
          },
          async authorize(credentials) {
            const identitySessionToken = credentials?.identitySessionToken;
            if (typeof identitySessionToken !== "string") return null;
            try {
              const exchanged = await exchangeIdentitySessionToken(
                identitySessionToken,
              );
              return {
                ...exchanged.user,
                identitySessionToken,
                accessToken: exchanged.accessToken,
                accessTokenExpiresAt: exchanged.accessTokenExpiresAt,
              };
            } catch {
              return null;
            }
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.authSessionVersion = AUTH_SESSION_VERSION;
        token.identityUserId = user.id;
        token.workspaceId = (user as { workspaceId?: string }).workspaceId;
      }
      if (account?.provider === "desktop-device" && user) {
        const desktopUser = user as typeof user & {
          identitySessionToken?: string;
          accessToken?: string;
          accessTokenExpiresAt?: number;
          workspaceId?: string;
        };
        token.identitySessionToken = desktopUser.identitySessionToken;
        token.accessToken = desktopUser.accessToken;
        token.accessTokenExpiresAt = desktopUser.accessTokenExpiresAt;
        token.workspaceId = desktopUser.workspaceId ?? token.workspaceId;
        const identity = await activateProduct(desktopUser.accessToken);
        if (identity?.userId) token.identityUserId = identity.userId;
        if (identity?.workspaceId) token.workspaceId = identity.workspaceId;
        if (identity?.image) token.picture = identity.image;
      } else if (account) {
        token.authSessionVersion = AUTH_SESSION_VERSION;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpiresAt = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 60 * 60 * 1000;
        const identity = await activateProduct(account.access_token);
        if (identity?.userId) token.identityUserId = identity.userId;
        if (identity?.workspaceId) token.workspaceId = identity.workspaceId;
        if (identity?.image) token.picture = identity.image;
      }
      if (
        token.accessTokenExpiresAt &&
        Date.now() >= Number(token.accessTokenExpiresAt) - 30_000
      ) {
        return refreshAccessToken(token);
      }
      return token;
    },
    session({ session, token }) {
      session.authSessionVersion = token.authSessionVersion as string | undefined;
      session.user.id = String(token.identityUserId ?? token.sub ?? "");
      session.user.workspaceId = token.workspaceId as string | undefined;
      if (token.picture) session.user.image = String(token.picture);
      // auth() receives a JSON-serialized session, so these must be enumerable
      // for server-side API routes. The public /api/auth/session route removes
      // them before its response reaches the browser.
      session.accessToken = token.accessToken as string | undefined;
      session.accessTokenError = token.accessTokenError as string | undefined;
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: `authjs.agent-commons.session-token.${AUTH_SESSION_VERSION}`,
    },
  },
});
