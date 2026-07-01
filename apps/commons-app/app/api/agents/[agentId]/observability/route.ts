import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/agents/:agentId/observability?from=<iso>&to=<iso>&limit=<n>
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const upstreamParams = new URLSearchParams();
  ["from", "to", "limit"].forEach((key) => {
    const value = searchParams.get(key);
    if (value) upstreamParams.set(key, value);
  });

  try {
    const res = await fetch(
      `${baseUrl}/v1/logs/agents/${encodeURIComponent(agentId)}/observability${
        upstreamParams.toString() ? `?${upstreamParams}` : ""
      }`,
      { cache: "no-store", headers: await backendAuthHeaders() }
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
