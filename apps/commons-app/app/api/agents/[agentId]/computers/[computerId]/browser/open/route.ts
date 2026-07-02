import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; computerId: string }> },
) {
  const { agentId, computerId } = await params;
  const body = await request.json();
  return proxyBackend(
    `/v1/agents/${agentId}/computers/${computerId}/browser/open`,
    {
      method: "POST",
      body,
    },
  );
}
