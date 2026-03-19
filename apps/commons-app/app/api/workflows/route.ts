import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/workflows  (create workflow)
export async function POST(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...backendAuthHeaders() },
      body: JSON.stringify(body),
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
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  ["ownerId", "ownerType"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) params.set(k, v);
  });
  const url = `${baseUrl}/v1/workflows${params.toString() ? `?${params.toString()}` : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error listing workflows", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
