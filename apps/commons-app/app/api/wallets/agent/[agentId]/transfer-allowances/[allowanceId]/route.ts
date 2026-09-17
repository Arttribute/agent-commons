import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// DELETE /api/wallets/agent/:agentId/transfer-allowances/:allowanceId
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string; allowanceId: string }> },
) {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { agentId, allowanceId } = await params;
  try {
    const res = await fetch(
      `${baseUrl}/v1/wallets/agent/${encodeURIComponent(agentId)}/transfer-allowances/${encodeURIComponent(allowanceId)}`,
      {
        method: "DELETE",
        headers: await backendAuthHeaders({ preferUserToken: true }),
      },
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
