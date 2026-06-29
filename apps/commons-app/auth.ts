import NextAuth from "next-auth";

const issuer = process.env.COMMONS_IDENTITY_ISSUER;
const AUTH_SESSION_VERSION = (
  process.env.COMMONS_AUTH_SESSION_VERSION ?? "v2"
).replace(/[^a-zA-Z0-9_-]/g, "-");

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
  return response.json() as Promise<{
    userId?: string;
    workspaceId?: string | null;
    image?: string | null;
  }>;
}

async function refreshAccessToken(token: any) {
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: issuer
    ? [
        {
          id: "commons",
          name: "Commons",
          type: "oidc",
          issuer,
          clientId: process.env.COMMONS_IDENTITY_CLIENT_ID,
          clientSecret: process.env.COMMONS_IDENTITY_CLIENT_SECRET,
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
      ]
    : [],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.authSessionVersion = AUTH_SESSION_VERSION;
        token.identityUserId = user.id;
        token.workspaceId = (user as { workspaceId?: string }).workspaceId;
      }
      if (account) {
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
      session.accessToken = token.accessToken as string | undefined;
      session.accessTokenError = token.accessTokenError as string | undefined;
      return session;
    },
  },
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: `authjs.agent-commons.session-token.${AUTH_SESSION_VERSION}`,
    },
  },
});
