const cache = new Map<string, { value: string; expiresAt: number }>();

export async function platformServiceToken(
  platform: "agent_commons" | "common_os",
): Promise<string | null> {
  const cached = cache.get(platform);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.value;

  const prefix = platform === "agent_commons" ? "AGENT_COMMONS" : "COMMON_OS";
  const issuer = process.env.COMMONS_IDENTITY_ISSUER;
  const clientId =
    process.env[`${prefix}_SERVICE_CLIENT_ID`] ??
    process.env.COURSES_VERIFIER_CLIENT_ID;
  const clientSecret =
    process.env[`${prefix}_SERVICE_CLIENT_SECRET`] ??
    process.env.COURSES_VERIFIER_CLIENT_SECRET;
  if (issuer && clientId && clientSecret) {
    const response = await fetch(`${issuer.replace(/\/$/, "")}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "activity:read",
        resource: "commons-platform",
      }),
    });
    if (!response.ok) return null;
    const token = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };
    cache.set(platform, {
      value: token.access_token,
      expiresAt: Date.now() + (token.expires_in ?? 600) * 1000,
    });
    return token.access_token;
  }

  return (
    process.env[`${prefix}_SERVICE_TOKEN`] ??
    (platform === "agent_commons"
      ? process.env.AGENT_COMMONS_API_KEY
      : null) ??
    null
  );
}
