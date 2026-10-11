import { NextRequest, NextResponse } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";
import { requireCurrentCommonsUser } from "@/lib/current-user";

// GET /api/agents
export async function GET(request: NextRequest) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  // Match the other signed-in studio routes: the shared proxy remints rejected
  // service credentials and only falls back to the user token when necessary.
  // The browser's owner query must never determine which account is listed.
  return proxyBackend(`/v1/agents?owner=${encodeURIComponent(user.userId)}`);
}

// POST /api/agents (create agent)
export async function POST(request: NextRequest) {
  try {
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;
    const body = await request.json();
    return proxyBackend("/v1/agents", {
      method: "POST",
      body: {
        ...body,
        owner: user.userId,
        ownerUserId: user.userId,
        workspaceId: user.workspaceId ?? body.workspaceId,
      },
    });
  } catch (e: any) {
    console.error("Error creating agent", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
