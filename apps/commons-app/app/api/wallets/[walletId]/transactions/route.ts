import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

import { balanceQuery } from "@/lib/wallet-networks";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/wallets/:walletId/transactions?chainId=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ walletId: string }> },
) {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { walletId } = await params;
  let query: string;
  try {
    query = balanceQuery(req.nextUrl.searchParams.get("chainId"));
  } catch {
    return NextResponse.json(
      { error: "Unsupported wallet network" },
      { status: 400 },
    );
  }
  try {
    const res = await fetch(
      `${baseUrl}/v1/wallets/${encodeURIComponent(walletId)}/transactions${query}`,
      {
        cache: "no-store",
        headers: await backendAuthHeaders(),
      },
    );
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
