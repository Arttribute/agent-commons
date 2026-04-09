import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/workflows/:workflowId/fork
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { workflowId } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...backendAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
