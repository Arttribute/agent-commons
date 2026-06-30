import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/agents
export async function GET(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const querySuffix = `?owner=${encodeURIComponent(user.userId)}`;
  const url = `${baseUrl}/v1/agents${querySuffix}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: await backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error listing agents", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/agents  (create agent)
export async function POST(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;
    const body = await request.json();
    const ownedBody = {
      ...body,
      owner: user.userId,
      ownerUserId: user.userId,
      workspaceId: user.workspaceId ?? body.workspaceId,
    };
    const res = await fetch(`${baseUrl}/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await backendAuthHeaders() },
      body: JSON.stringify(ownedBody),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error creating agent", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
