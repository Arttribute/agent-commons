import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    authSessionVersion?: string;
    accessToken?: string;
    accessTokenError?: string;
    user: {
      id: string;
      workspaceId?: string;
    } & DefaultSession["user"];
  }

  interface User {
    identityUserId?: string;
    workspaceId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authSessionVersion?: string;
    identityUserId?: string;
    workspaceId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    accessTokenError?: string;
  }
}
