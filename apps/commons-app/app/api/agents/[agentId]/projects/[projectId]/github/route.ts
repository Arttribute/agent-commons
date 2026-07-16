import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string; projectId: string }> },
) {
  const { agentId, projectId } = await params;
  const body = await request.json().catch(() => ({}));
  return proxyBackend(`/v1/agents/${agentId}/projects/${projectId}/github`, { method: "POST", body });
}
