type AuthEnvironment = Record<string, string | undefined>;

export function commonsIdentityConfigured(values: AuthEnvironment) {
  return Boolean(values.COMMONS_IDENTITY_ISSUER?.trim() && values.COMMONS_IDENTITY_CLIENT_ID?.trim());
}

/** Live-room signups need the same canonical account and credits as every app. */
export function shouldUseDirectGoogle(callbackUrl: string, values: AuthEnvironment) {
  return !commonsIdentityConfigured(values)
    && callbackUrl.startsWith("/live/")
    && Boolean(values.GOOGLE_CLIENT_ID?.trim() && values.GOOGLE_CLIENT_SECRET?.trim());
}

export function linkedIdentityForSession(
  email: unknown,
  profile: { email?: unknown; emailVerifiedAt?: unknown; identityUserId?: unknown; identityWorkspaceId?: unknown } | null,
) {
  if (!profile?.emailVerifiedAt || typeof email !== "string" || typeof profile.email !== "string"
    || email.trim().toLowerCase() !== profile.email.trim().toLowerCase()
    || typeof profile.identityUserId !== "string" || !/^usr_[a-zA-Z0-9_-]+$/.test(profile.identityUserId)) return null;
  return {
    identityUserId: profile.identityUserId,
    ...(typeof profile.identityWorkspaceId === "string" && /^wsp_[a-zA-Z0-9_-]+$/.test(profile.identityWorkspaceId)
      ? { identityWorkspaceId: profile.identityWorkspaceId, workspaceId: profile.identityWorkspaceId } : {}),
  };
}
