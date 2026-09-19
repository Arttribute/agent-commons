import { handlers } from "@/auth";
import type { NextRequest } from "next/server";

async function authResponse(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<Response>,
) {
  const response = await handler(request);
  if (request.nextUrl.pathname !== "/api/auth/session" || !response.ok) {
    return response;
  }

  // auth() uses Auth.js's internal session action, which needs the token for
  // server-to-server calls. The browser session endpoint must only return the
  // identity fields that the UI actually uses. Keep Auth.js's Set-Cookie headers
  // so refresh-token rotation continues to work.
  const session = await response.clone().json().catch(() => null);
  if (!session || typeof session !== "object") {
    return Response.json({ error: "Invalid session response" }, { status: 502 });
  }
  const { user, expires, authSessionVersion } = session as Record<string, unknown>;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "private, no-store");
  return Response.json({ user, expires, authSessionVersion }, {
    status: response.status,
    headers,
  });
}

export function GET(request: NextRequest) {
  return authResponse(request, handlers.GET);
}

export function POST(request: NextRequest) {
  return authResponse(request, handlers.POST);
}
