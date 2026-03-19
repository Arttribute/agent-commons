import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/tool-permissions?toolId=<id>
export async function GET(request: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const toolId = new URL(request.url).searchParams.get("toolId");
  const q = toolId ? `?toolId=${toolId}` : "";
  try {
    const res = await fetch(`${baseUrl}/v1/tool-permissions${q}`, { cache: "no-store", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
