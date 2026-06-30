import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/tool-keys?ownerId=<id>&ownerType=<type>&toolId=<id>
export async function GET(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const params = new URLSearchParams();
  ["toolId"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) params.set(k, v);
  });
  params.set("ownerId", user.userId);
  params.set("ownerType", "user");
  try {
    const res = await fetch(`${baseUrl}/v1/tool-keys?${params.toString()}`, { cache: "no-store", headers: await backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/tool-keys
export async function POST(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;
    const body = await request.json();
    const ownedBody = { ...body, ownerId: user.userId, ownerType: "user" };
    const res = await fetch(`${baseUrl}/v1/tool-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await backendAuthHeaders() },
      body: JSON.stringify(ownedBody),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
