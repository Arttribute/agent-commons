import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; computerId: string }> },
) {
  const { agentId, computerId } = await params;
  const path = new URL(request.url).searchParams.get("path") ?? "/";
  return proxyBackend(
    `/v1/agents/${agentId}/computers/${computerId}/files/read?path=${encodeURIComponent(path)}`,
  );
}
