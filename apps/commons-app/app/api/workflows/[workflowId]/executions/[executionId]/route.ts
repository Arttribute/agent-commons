import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

type Ctx = { params: Promise<{ workflowId: string; executionId: string }> };

// GET /api/workflows/:workflowId/executions/:executionId
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { workflowId, executionId } = await params;
  try {
    const res = await fetch(
      `${baseUrl}/v1/workflows/${workflowId}/executions/${executionId}`,
      { cache: "no-store", headers: backendAuthHeaders() }
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
