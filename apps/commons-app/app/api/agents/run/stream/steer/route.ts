import { NextRequest } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!baseUrl) return Response.json({ error: "Server base URL not configured" }, { status: 500 });
  const { user } = await requireCurrentCommonsUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { runId, prompt } = await request.json().catch(() => ({}));
  if (typeof runId !== "string" || !/^[0-9a-f-]{36}$/i.test(runId) || typeof prompt !== "string") {
    return Response.json({ error: "Run and prompt are required" }, { status: 400 });
  }
  const upstream = await fetch(`${baseUrl}/v1/agents/runs/${runId}/steer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...await backendAuthHeaders(), "x-initiator": user.userId },
    body: JSON.stringify({ prompt }),
  });
  return new Response(await upstream.text(), { status: upstream.status, headers: { "Content-Type": "application/json" } });
}
