import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/billing/checkout/subscription { planKey }
export async function POST(request: NextRequest) {
  if (!baseUrl)
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/billing/checkout/subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await backendAuthHeaders()) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
