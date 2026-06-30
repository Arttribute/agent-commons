import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/sessions/list?agentId=<id>&initiatorId=<address>
export async function GET(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(request.url);
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const agentId = searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json(
      { error: "agentId is required" },
      { status: 400 }
    );
  }
  const initiatorId = user.userId;
  const url = `${baseUrl}/v1/sessions/list/${encodeURIComponent(agentId)}/${encodeURIComponent(initiatorId)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: await backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error listing sessions", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
