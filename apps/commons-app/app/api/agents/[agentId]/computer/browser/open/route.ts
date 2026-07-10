import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const body = await request.json();
  return proxyBackend(`/v1/agents/${agentId}/computer/browser/open`, {
    method: "POST",
    body,
  });
}
