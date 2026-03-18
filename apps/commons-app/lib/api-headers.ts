/**
 * Returns Authorization header for server-side requests to the backend API.
 * Uses NEST_API_SECRET_KEY — a server-side-only env var (no NEXT_PUBLIC_ prefix).
 * This file must only be imported from Next.js API routes, not client components.
 */
export function backendAuthHeaders(): Record<string, string> {
  const key = process.env.NEST_API_SECRET_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}
