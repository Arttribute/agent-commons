const RETURN_URL_BASE = "https://agentcommons.local";

export function safeInternalReturnUrl(
  value: string | null | undefined,
  fallback = "/studio",
) {
  if (!value) return fallback;
  try {
    const parsed = new URL(value, RETURN_URL_BASE);
    if (parsed.origin !== RETURN_URL_BASE) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
