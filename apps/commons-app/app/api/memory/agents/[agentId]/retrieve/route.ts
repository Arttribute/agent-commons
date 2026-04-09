import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/memory/agents/:agentId/retrieve?query=<text>&limit=<n>&type=<type>
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const p = new URLSearchParams();
  ["query", "limit", "type"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) p.set(k, v);
  });
  try {
    const res = await fetch(
      `${baseUrl}/v1/memory/agents/${agentId}/retrieve?${p.toString()}`,
      { cache: "no-store", headers: backendAuthHeaders() }
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
