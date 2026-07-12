import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/spaces/:spaceId/rtc-ticket
// Mints a short-lived capability ticket for joining the space RTC stream.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  }
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const { spaceId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/spaces/${spaceId}/rtc-ticket`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(await backendAuthHeaders()) },
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
