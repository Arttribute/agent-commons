import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; projectId: string }> },
) {
  const { agentId, projectId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/projects/${projectId}/files`, {
    method: "PUT",
    body: await request.json(),
  });
}
