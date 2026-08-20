import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  return proxyBackend(`/v1/skills/agents/${encodeURIComponent(agentId)}`);
}
