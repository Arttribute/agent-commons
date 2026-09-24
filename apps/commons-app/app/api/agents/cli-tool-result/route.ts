import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.requestId !== "string" || typeof body.result !== "string") {
    return Response.json({ error: "Invalid local tool result" }, { status: 400 });
  }
  return proxyBackend("/v1/agents/cli-tool-result", {
    method: "POST",
    body: { requestId: body.requestId, result: body.result },
  });
}
