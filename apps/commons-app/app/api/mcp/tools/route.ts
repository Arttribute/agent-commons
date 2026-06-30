import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/mcp/tools?ownerId=<id>&ownerType=<type>
export async function GET(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const params = new URLSearchParams();
  const ownerType = searchParams.get("ownerType") === "agent" ? "agent" : "user";
  params.set("ownerId", ownerType === "user" ? user.userId : searchParams.get("ownerId") || "");
  params.set("ownerType", ownerType);
  try {
    const res = await fetch(`${baseUrl}/v1/mcp/tools?${params.toString()}`, {
      cache: "no-store",
      headers: await backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
