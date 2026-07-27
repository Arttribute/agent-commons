import "server-only";
import { auth } from "@/auth";

function identityOrigin() {
  const issuer = process.env.COMMONS_IDENTITY_ISSUER?.trim();
  if (!issuer) return null;
  return issuer.replace(/\/api\/auth\/?$/, "").replace(/\/$/, "");
}

export async function identityPlatformFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const origin = identityOrigin();
  if (!origin) {
    return Response.json(
      { error: "Commons Identity is not configured" },
      { status: 500 },
    );
  }

  const session = await auth();
  if (!session?.user?.id || !session.accessToken || session.accessTokenError) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return fetch(`${origin}/api/platform${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
}
