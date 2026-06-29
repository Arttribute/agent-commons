export function safeAuthCallback(
  value: string | string[] | null | undefined,
  fallback = "/dashboard",
) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (raw.startsWith("/auth/signin") || raw.startsWith("/auth/signup")) {
    return fallback;
  }
  return raw;
}
