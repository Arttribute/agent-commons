import { NextRequest, NextResponse } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function POST(
  _request: NextRequest,
  {
    params,
  }: { params: Promise<{ agentId: string; changeId: string; action: string }> },
) {
  const { agentId, changeId, action } = await params;
  if (!["accept", "reject"].includes(action))
    return NextResponse.json(
      { message: "Unknown resource review action" },
      { status: 400 },
    );
  return proxyBackend(
    `/v1/agents/${encodeURIComponent(agentId)}/computer/upgrades/${encodeURIComponent(changeId)}/${action}`,
    { method: "POST" },
  );
}
