import { NextRequest } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/workflows/[workflowId]/executions/[executionId]/stream — proxies SSE
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string; executionId: string }> }
) {
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "Server base URL not configured" }), { status: 500 });
  }

  const { workflowId, executionId } = await params;

  const upstream = await fetch(
    `${baseUrl}/v1/workflows/${workflowId}/executions/${executionId}/stream`,
    {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...backendAuthHeaders(),
      },
    }
  );

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({ message: upstream.statusText }));
    return new Response(JSON.stringify(err), { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
