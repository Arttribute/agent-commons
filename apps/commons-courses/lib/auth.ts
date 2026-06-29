import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { consumeAccountToken } from "@/lib/account-tokens";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

const googleEnabled =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET);
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
const commonsIdentityEnabled =
  Boolean(process.env.COMMONS_IDENTITY_ISSUER) &&
  Boolean(process.env.COMMONS_IDENTITY_CLIENT_ID);

type AuthToken = {
  [key: string]: unknown;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  accessTokenError?: string;
};

async function refreshAccessToken(token: AuthToken) {
  const issuer = process.env.COMMONS_IDENTITY_ISSUER;
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
    if (!response.ok) {
      return { ...token, accessTokenError: "RefreshAccessTokenError" };
    }
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

async function activateProduct(accessToken: unknown) {
  const issuer = process.env.COMMONS_IDENTITY_ISSUER;
  if (!issuer || typeof accessToken !== "string") return null;
  const response = await fetch(
    `${issuer.replace(/\/api\/auth\/?$/, "")}/api/identity/apps/commonlabs/activate`,
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

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authSecret,
  trustHost: true,
  providers: [
    ...(commonsIdentityEnabled
      ? [
          {
            id: "commons",
            name: "Commons",
            type: "oidc" as const,
            issuer: process.env.COMMONS_IDENTITY_ISSUER,
            clientId: process.env.COMMONS_IDENTITY_CLIENT_ID,
            clientSecret: process.env.COMMONS_IDENTITY_CLIENT_SECRET,
            authorization: {
              params: {
                scope:
                  "openid email profile offline_access activity:read agents:read agents:write agents:run",
                resource: "commons-platform",
              },
            },
            checks: ["pkce" as const, "state" as const],
            profile(profile: {
              sub: string;
              email?: string;
              name?: string;
              picture?: string;
              email_verified?: boolean;
              workspace_id?: string;
            }) {
              return {
                id: profile.sub,
                identityUserId: profile.sub,
                identityWorkspaceId: profile.workspace_id,
                workspaceId: profile.workspace_id,
                email: profile.email,
                name: profile.name ?? profile.email?.split("@")[0],
                image: profile.picture,
                emailVerifiedAt: profile.email_verified ? new Date() : undefined,
              };
            },
          },
        ]
      : []),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      id: "checkout",
      name: "checkout",
      credentials: {
        token: { label: "Checkout token", type: "text" },
      },
      async authorize(credentials) {
        const token = credentials?.token;
        if (!token || typeof token !== "string") return null;

        await connectDB();
        const record = await consumeAccountToken({
          token,
          purpose: "checkout_signin",
        });
        if (!record) return null;

        const user = await User.findById(record.userId);
        if (!user) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
        };
      },
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        await connectDB();
        const user = await User.findOne({ email: credentials.email }).select(
          "+password"
        );
        if (!user) return null;
        if (!user.password) return null;
        if (!user.emailVerifiedAt) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "commons") {
        const email = user.email || profile?.email;
        const identityUserId =
          (user as { identityUserId?: string }).identityUserId ??
          (profile as { sub?: string } | undefined)?.sub;
        const identityWorkspaceId =
          (user as { identityWorkspaceId?: string; workspaceId?: string })
            .identityWorkspaceId ??
          (user as { identityWorkspaceId?: string; workspaceId?: string })
            .workspaceId ??
          (profile as { workspace_id?: string } | undefined)?.workspace_id;
        if (!email || !identityUserId) return false;

        await connectDB();
        const existing = await User.findOne({
          $or: [{ identityUserId }, { email: email.toLowerCase() }],
        });
        if (existing) {
          existing.identityUserId = identityUserId;
          if (!existing.emailVerifiedAt) existing.emailVerifiedAt = new Date();
          if (!existing.name && user.name) existing.name = user.name;
          if (user.image) existing.image = user.image;
          if (identityWorkspaceId) existing.identityWorkspaceId = identityWorkspaceId;
          await existing.save();
          user.id = existing._id.toString();
          user.role = existing.role;
          user.identityUserId = identityUserId;
          user.identityWorkspaceId = existing.identityWorkspaceId;
          user.workspaceId = existing.identityWorkspaceId;
          return true;
        }

        const created = await User.create({
          name: user.name || email.split("@")[0],
          email,
          image: user.image,
          role: "learner",
          authProvider: "commons",
          emailVerifiedAt: new Date(),
          identityUserId,
          identityWorkspaceId,
        });
        user.id = created._id.toString();
        user.role = created.role;
        user.identityUserId = identityUserId;
        user.identityWorkspaceId = created.identityWorkspaceId;
        user.workspaceId = created.identityWorkspaceId;
        return true;
      }

      if (account?.provider !== "google") return true;

      const email = user.email || profile?.email;
      if (!email) return false;

      try {
        await connectDB();
        const existing = await User.findOne({ email });
        if (existing) {
          if (!existing.emailVerifiedAt) existing.emailVerifiedAt = new Date();
          existing.authProvider = "google";
          if (!existing.name && user.name) existing.name = user.name;
          if (user.image) existing.image = user.image;
          await existing.save();
          user.id = existing._id.toString();
          user.role = existing.role;
          return true;
        }

        const created = await User.create({
          name: user.name || email.split("@")[0],
          email,
          image: user.image,
          role: "learner",
          authProvider: "google",
          emailVerifiedAt: new Date(),
        });
        user.id = created._id.toString();
        user.role = created.role;
        return true;
      } catch (error) {
        console.error("[auth] google sign-in failed", {
          email,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    },
    async jwt({ token, user, trigger, session, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.identityUserId = user.identityUserId;
        token.identityWorkspaceId =
          (user as { identityWorkspaceId?: string; workspaceId?: string })
            .identityWorkspaceId ??
          (user as { identityWorkspaceId?: string; workspaceId?: string })
            .workspaceId;
        token.workspaceId = token.identityWorkspaceId;
        if (user.image) token.picture = user.image;
        token.emailVerifiedAt = (user as { emailVerifiedAt?: Date }).emailVerifiedAt;
      }
      const updatedRole = (
        session as
          | { user?: { role?: "learner" | "educator" | "admin" } }
          | undefined
      )?.user?.role;
      if (trigger === "update" && updatedRole) {
        token.role = updatedRole;
      }
      if (account?.provider === "commons") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpiresAt = account.expires_at
          ? account.expires_at * 1000
          : undefined;
        const identity = await activateProduct(account.access_token);
        if (identity?.userId) {
          token.identityUserId = identity.userId;
          if (identity.workspaceId) {
            token.identityWorkspaceId = identity.workspaceId;
            token.workspaceId = identity.workspaceId;
          }
          if (token.email) {
            await connectDB();
            await User.updateOne(
              { email: String(token.email).toLowerCase() },
              {
                $set: {
                  identityUserId: identity.userId,
                  ...(identity.workspaceId
                    ? { identityWorkspaceId: identity.workspaceId }
                    : {}),
                  ...(identity.image ? { image: identity.image } : {}),
                },
              },
            );
          }
        }
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
      if (token?.id) session.user.id = token.id as string;
      if (token?.role) {
        session.user.role = token.role as "learner" | "educator" | "admin";
      }
      if (token?.emailVerifiedAt) {
        session.user.emailVerifiedAt = token.emailVerifiedAt as string;
      }
      if (token?.picture) {
        session.user.image = token.picture as string;
      }
      if (token?.identityUserId) {
        session.user.identityUserId = token.identityUserId as string;
      }
      if (token?.identityWorkspaceId || token?.workspaceId) {
        session.user.identityWorkspaceId = (token.identityWorkspaceId ||
          token.workspaceId) as string;
        session.user.workspaceId = session.user.identityWorkspaceId;
      }
      if (token?.accessToken) {
        session.accessToken = token.accessToken as string;
      }
      if (token?.accessTokenError) {
        session.accessTokenError = token.accessTokenError as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: { strategy: "jwt" },
});
