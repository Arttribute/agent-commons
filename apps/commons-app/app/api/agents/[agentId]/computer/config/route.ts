import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/computer/config`);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const body = await request.json();
  return proxyBackend(`/v1/agents/${agentId}/computer/config`, {
    method: "PUT",
    body,
  });
}
