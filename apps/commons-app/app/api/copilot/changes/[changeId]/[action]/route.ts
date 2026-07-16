import { NextRequest, NextResponse } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

const ACTIONS = new Set(["accept", "reject", "revert"]);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ changeId: string; action: string }> },
) {
  const { changeId, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Invalid change action" },
      { status: 400 },
    );
  }
  return proxyBackend(
    `/v1/copilot/changes/${encodeURIComponent(changeId)}/${action}`,
    { method: "POST" },
  );
}
