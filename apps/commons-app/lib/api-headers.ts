import { auth } from "@/auth";

/**
 * Returns Authorization header for server-side requests to the backend API.
 * Uses NEST_API_SECRET_KEY — a server-side-only env var (no NEXT_PUBLIC_ prefix).
 * This file must only be imported from Next.js API routes, not client components.
 */
export async function backendAuthHeaders(options: { allowServiceKey?: boolean } = {}): Promise<Record<string, string>> {
  const session = await auth();
  if (session?.accessToken) {
    return { Authorization: `Bearer ${session.accessToken}` };
  }
  if (options.allowServiceKey) {
    const serviceKey =
      process.env.AGENT_COMMONS_API_KEY ||
      process.env.COMMONS_API_KEY ||
      process.env.NEST_API_SECRET_KEY;
    if (serviceKey) return { Authorization: `Bearer ${serviceKey}` };
  }
  if (process.env.ALLOW_LEGACY_MANAGEMENT_AUTH !== "true") return {};
  const key = process.env.NEST_API_SECRET_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}
