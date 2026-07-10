import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/runtime`);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/runtime`, { method: "PUT", body: await request.json() });
}
