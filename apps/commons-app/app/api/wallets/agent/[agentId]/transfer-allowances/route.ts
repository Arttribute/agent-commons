import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// Spending limits must be set with the signed-in user's own credential; the
// API refuses service credentials for them.
const userHeaders = () => backendAuthHeaders({ preferUserToken: true });

// GET /api/wallets/agent/:agentId/transfer-allowances
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { agentId } = await params;
  try {
    const res = await fetch(
      `${baseUrl}/v1/wallets/agent/${encodeURIComponent(agentId)}/transfer-allowances`,
      { cache: "no-store", headers: await userHeaders() },
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/wallets/agent/:agentId/transfer-allowances
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { agentId } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(
      `${baseUrl}/v1/wallets/agent/${encodeURIComponent(agentId)}/transfer-allowances`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await userHeaders()),
        },
        body: JSON.stringify(body),
      },
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
