import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
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
    identityUserId?: string;
    workspaceId?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    accessTokenError?: string;
  }
}
