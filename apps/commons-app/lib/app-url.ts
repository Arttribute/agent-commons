/**
 * Canonical base URL for the app, used for `metadataBase` and social-embed
 * absolute URLs. Prefers an explicit env override, then the Vercel-provided
 * production/deployment host, and finally the well-known production domain.
 */
export function getAppBaseUrl() {
  const explicitUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL;
  if (explicitUrl) return explicitUrl.replace(/\/+$/, "");

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "https://www.agentcommons.io";
}
