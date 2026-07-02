import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string; computerId: string }> },
) {
  const { agentId, computerId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/computers/${computerId}/refresh`, {
    method: "POST",
  });
}
