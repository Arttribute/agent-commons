import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  return proxyBackend(`/v1/agents/${agentId}/computer/browser/test`, {
    method: "POST",
    body: await request.json().catch(() => ({})),
  });
}
