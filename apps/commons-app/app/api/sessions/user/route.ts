import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/sessions/user?initiatorId=<address>
export async function GET(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 }
    );
  }
  const { searchParams } = new URL(request.url);
  const initiatorId = searchParams.get("initiatorId");
  if (!initiatorId) {
    return NextResponse.json(
      { error: "initiatorId is required" },
      { status: 400 }
    );
  }
  const url = `${baseUrl}/v1/sessions/user/${encodeURIComponent(initiatorId)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error fetching user sessions", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
