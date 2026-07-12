import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/credits — the signed-in user's balance + recent ledger.
export async function GET() {
  if (!baseUrl)
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const headers = await backendAuthHeaders();
  try {
    const [balanceRes, ledgerRes] = await Promise.all([
      fetch(`${baseUrl}/v1/credits/balance`, { cache: "no-store", headers }),
      fetch(`${baseUrl}/v1/credits/ledger?limit=25`, { cache: "no-store", headers }),
    ]);
    const balance = await balanceRes.json().catch(() => ({}));
    const ledger = await ledgerRes.json().catch(() => ({}));
    return NextResponse.json({
      balance: balance?.data ?? null,
      ledger: ledger?.data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
