import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// POST /api/sessions/suggestions — ideas for the /new page, written from the
// signed-in person's recent chats.
export async function POST(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const body = await request.json().catch(() => ({}));
  const connectedApps = Array.isArray(body?.connectedApps)
    ? body.connectedApps.filter((name: unknown) => typeof name === "string").slice(0, 20)
    : [];
  try {
    const res = await fetch(`${baseUrl}/v1/sessions/user/${encodeURIComponent(user.userId)}/suggestions`, {
      method: "POST",
      cache: "no-store",
      headers: { ...(await backendAuthHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ connectedApps }),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Suggestions unavailable" }, { status: 502 });
  }
}
