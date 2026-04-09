import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

type Ctx = { params: Promise<{ walletId: string }> };

// GET /api/wallets/:walletId
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { walletId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/wallets/${encodeURIComponent(walletId)}`, {
      cache: "no-store",
      headers: backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/wallets/:walletId — deactivate wallet
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { walletId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/wallets/${encodeURIComponent(walletId)}`, {
      method: "DELETE",
      headers: backendAuthHeaders(),
    });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
