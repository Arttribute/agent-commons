import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; projectId: string }> },
) {
  const { agentId, projectId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/projects/${projectId}/export`, {
    method: "POST",
    body: await request.json().catch(() => ({})),
  });
}
