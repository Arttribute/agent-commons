import { NextRequest, NextResponse } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

const ACTIONS = new Set(["accept", "reject", "revert"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ changeId: string; action: string }> },
) {
  const { changeId, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json(
      { error: "Invalid change action" },
      { status: 400 },
    );
  }
  const body = await request.json().catch(() => undefined);
  return proxyBackend(
    `/v1/copilot/changes/${encodeURIComponent(changeId)}/${action}`,
    { method: "POST", body },
  );
}
