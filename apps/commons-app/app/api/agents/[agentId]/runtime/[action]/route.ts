import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

const actions = new Set(["deploy", "restart", "sleep"]);

export async function POST(_request: NextRequest, { params }: { params: Promise<{ agentId: string; action: string }> }) {
  const { agentId, action } = await params;
  if (!actions.has(action)) return new Response(JSON.stringify({ error: "Unknown runtime action" }), { status: 404 });
  return proxyBackend(`/v1/agents/${agentId}/runtime/${action}`, { method: "POST" });
}
