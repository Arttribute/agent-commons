import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params;
  const query = new URL(request.url).searchParams.toString();
  return proxyBackend(
    `/v1/agents/${agentId}/computer/events${query ? `?${query}` : ""}`,
  );
}
