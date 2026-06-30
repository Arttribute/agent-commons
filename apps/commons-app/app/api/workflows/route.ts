import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/workflows  (create workflow)
export async function POST(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;
    const body = await request.json();
    const ownedBody = { ...body, ownerId: user.userId, ownerType: "user" };
    const res = await fetch(`${baseUrl}/v1/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...await backendAuthHeaders() },
      body: JSON.stringify(ownedBody),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error creating workflow", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET /api/workflows?ownerId=<id>&ownerType=<type>
export async function GET(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const params = new URLSearchParams();
  params.set("ownerId", user.userId);
  params.set("ownerType", "user");
  const url = `${baseUrl}/v1/workflows${params.toString() ? `?${params.toString()}` : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: await backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error listing workflows", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
