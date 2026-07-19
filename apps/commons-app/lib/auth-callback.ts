export const DEFAULT_AUTH_CALLBACK = "/studio/agents";

/**
 * Keep post-auth navigation on this application. Legacy links that still ask
 * for the retired /agents index are canonicalized to the Studio agent list.
 */
export function safeAuthCallback(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return DEFAULT_AUTH_CALLBACK;
  }

  try {
    const parsed = new URL(value, "https://agentcommons.local");
    if (parsed.origin !== "https://agentcommons.local") {
      return DEFAULT_AUTH_CALLBACK;
    }
    if (parsed.pathname === "/agents") {
      return `${DEFAULT_AUTH_CALLBACK}${parsed.search}${parsed.hash}`;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_CALLBACK;
  }
}
