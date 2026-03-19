import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/skills?ownerId=<id>&ownerType=<type>&isPublic=<bool>
export async function GET(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  ["ownerId", "ownerType", "isPublic"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) params.set(k, v);
  });
  const url = `${baseUrl}/v1/skills${params.toString() ? `?${params.toString()}` : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error listing skills", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
