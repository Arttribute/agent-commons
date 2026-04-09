import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/workflows/:workflowId/executions/:executionId/cancel
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workflowId: string; executionId: string }> }
) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { workflowId, executionId } = await params;
  try {
    const res = await fetch(
      `${baseUrl}/v1/workflows/${workflowId}/executions/${executionId}/cancel`,
      { method: "POST", headers: backendAuthHeaders() }
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
