import { NextResponse } from "next/server";
import {
  backendAuthHeaders,
  backendServiceAuthRetryAfterMs,
  invalidateBackendServiceAuthCache,
} from "@/lib/api-headers";
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
    // A request without a credential can only come back as the gateway's
    // 401, which reads as a sign-in problem. Skip it and say what happened.
    const request = async (preferUserToken = false) => {
      const authHeaders = await backendAuthHeaders({ session, preferUserToken });
      if (!authHeaders.Authorization) return null;
      return fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        cache: options.cache ?? "no-store",
        headers: {
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
          ...authHeaders,
        },
        body,
      });
    };

    // Service-token caches and upstream key rotation can briefly disagree.
    // Remint the service token first, then fall back to the user's OIDC token.
    let res = await request();
    if (res?.status === 401) {
      invalidateBackendServiceAuthCache();
      res = await request();
    }
    if (
      (!res || res.status === 401) &&
      session.accessToken &&
      !session.accessTokenError
    ) {
      res = await request(true);
    }
    if (!res) return credentialUnavailable();
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    const retryAfter = res.headers.get("retry-after");
    return NextResponse.json(data, {
      status: res.status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": retryAfter } : {}),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function credentialUnavailable() {
  const retryAfterMs = backendServiceAuthRetryAfterMs();
  if (retryAfterMs > 0) {
    const retryAfter = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
      {
        error: {
          type: "rate_limit_error",
          message:
            "Agent Commons is receiving a lot of requests. Retrying shortly.",
          retryAfter,
        },
      },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter) },
      },
    );
  }
  return NextResponse.json(
    {
      error: {
        type: "service_unavailable",
        message: "Agent Commons could not authorize this request. Try again in a moment.",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
