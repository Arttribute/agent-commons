import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/wallets/:walletId/balance
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> }
) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { walletId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/wallets/${encodeURIComponent(walletId)}/balance`, {
      cache: "no-store",
      headers: backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
