import { NextRequest } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/agents/run/stream — proxies SSE to backend, auth via server-side key only
export async function POST(request: NextRequest) {
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "Server base URL not configured" }), { status: 500 });
  }

  const { user, response } = await requireCurrentCommonsUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json();
  const ownedBody = { ...body, initiator: user.userId, initiatorId: user.userId };

  const upstream = await fetch(`${baseUrl}/v1/agents/run/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...await backendAuthHeaders(),
      "x-initiator": user.userId,
    },
    body: JSON.stringify(ownedBody),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({ message: upstream.statusText }));
    return new Response(JSON.stringify(err), { status: upstream.status });
  }

  // Forward the SSE stream directly to the browser
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
