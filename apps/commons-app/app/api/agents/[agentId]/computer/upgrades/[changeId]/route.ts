import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string; changeId: string }> },
) {
  const { agentId, changeId } = await params;
  return proxyBackend(
    `/v1/agents/${encodeURIComponent(agentId)}/computer/upgrades/${encodeURIComponent(changeId)}`,
  );
}
