export type TrustedAppOriginEnvironment = {
  NEXT_PUBLIC_BASE_URL?: string;
  AUTH_URL?: string;
  NEXTAUTH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
  UI_PLUGIN_TRUSTED_APP_ORIGINS?: string;
};

/** Build an exact allowlist for first-party app origins in every deployment. */
export function configuredTrustedAppOrigins(
  environment: TrustedAppOriginEnvironment,
  fallbackOrigin?: string,
) {
  const candidates = [
    environment.NEXT_PUBLIC_BASE_URL,
    environment.AUTH_URL,
    environment.NEXTAUTH_URL,
    vercelOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL),
    vercelOrigin(environment.VERCEL_BRANCH_URL),
    vercelOrigin(environment.VERCEL_URL),
    fallbackOrigin,
    ...splitOrigins(environment.UI_PLUGIN_TRUSTED_APP_ORIGINS),
  ];
  return new Set(
    candidates
      .map(normalizedHttpOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
}

export function normalizedHttpOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function vercelOrigin(value: string | undefined) {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function splitOrigins(value: string | undefined) {
  return value?.split(",").map((origin) => origin.trim()) ?? [];
}
