import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/sessions/[sessionId]?full=true|false
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const full = new URL(request.url).searchParams.get("full") === "true";
  const path = full ? `/v1/sessions/${sessionId}/full` : `/v1/sessions/${sessionId}`;
  try {
    const res = await fetch(`${baseUrl}${path}`, { cache: "no-store", headers: await backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Verify the signed-in user owns this session before mutating it.
async function assertOwnership(sessionId: string, userId: string) {
  const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
    cache: "no-store",
    headers: await backendAuthHeaders(),
  });
  if (!res.ok) return { ok: false as const, status: res.status };
  const data = await res.json().catch(() => ({}));
  const initiator: string | undefined = data?.data?.initiator;
  if (initiator && initiator.toLowerCase() !== userId.toLowerCase()) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, status: 200 };
}

// PATCH /api/sessions/[sessionId]  { title }  — rename
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;
    const owns = await assertOwnership(sessionId, user.userId);
    if (!owns.ok) {
      return NextResponse.json(
        { error: owns.status === 403 ? "Forbidden" : "Session not found" },
        { status: owns.status },
      );
    }
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await backendAuthHeaders()) },
      body: JSON.stringify({ title: body.title }),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/sessions/[sessionId]
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const { user, response } = await requireCurrentCommonsUser();
    if (!user) return response;
    const owns = await assertOwnership(sessionId, user.userId);
    if (!owns.ok) {
      return NextResponse.json(
        { error: owns.status === 403 ? "Forbidden" : "Session not found" },
        { status: owns.status },
      );
    }
    const res = await fetch(`${baseUrl}/v1/sessions/${sessionId}`, {
      method: "DELETE",
      headers: await backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
