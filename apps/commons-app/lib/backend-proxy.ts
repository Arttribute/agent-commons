import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { auth } from "@/auth";
import { normalizePrincipalId } from "@/lib/principal-id";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function proxyBackend(
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    cache?: RequestCache;
  } = {},
) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  }

  try {
    // This BFF holds service credentials, so every route using it must prove a
    // browser session before any upstream request is made.
    const session = await auth();
    const userId = normalizePrincipalId(session?.user?.id);
    if (!session || !userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const hasBody = options.body !== undefined;
    const body = hasBody ? JSON.stringify(options.body) : undefined;
    const request = async (preferUserToken = false) =>
      fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        cache: options.cache ?? "no-store",
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...await backendAuthHeaders({ session, preferUserToken }),
        },
        body,
      });

    // Service-token caches and upstream key rotation can briefly disagree.
    // Retry one 401 with the signed user's OIDC token before surfacing it.
    let res = await request();
    if (res.status === 401 && session.accessToken && !session.accessTokenError) {
      res = await request(true);
    }
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
