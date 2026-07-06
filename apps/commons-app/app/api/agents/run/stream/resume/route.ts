import { NextRequest } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// Vercel hard-caps function duration; the client keeps calling this route to
// re-attach until the run emits a terminal event.
// 300s is the Fluid-compute Hobby max — raise to 800 on Pro if desired.
export const maxDuration = 300;

// POST /api/agents/run/stream/resume — re-attaches to an in-flight backend run.
// Body: { runId: string; after?: number } (after = last seen event seq).
export async function POST(request: NextRequest) {
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "Server base URL not configured" }), { status: 500 });
  }

  const { user } = await requireCurrentCommonsUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const runId = typeof body?.runId === "string" ? body.runId : "";
  if (!runId) {
    return new Response(JSON.stringify({ error: "runId is required" }), { status: 400 });
  }
  const after = Number(body?.after) || 0;

  const upstream = await fetch(`${baseUrl}/v1/agents/runs/${encodeURIComponent(runId)}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...await backendAuthHeaders(),
      "x-initiator": user.userId,
    },
    body: JSON.stringify({ after }),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({ message: upstream.statusText }));
    return new Response(JSON.stringify(err), { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
