import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { sessionId } = await params;
  const headers = await backendAuthHeaders();
  const session = await fetch(
    `${baseUrl}/v1/sessions/${encodeURIComponent(sessionId)}`,
    {
      cache: "no-store",
      headers,
    },
  );
  const sessionBody = await session.json().catch(() => ({}));
  if (!session.ok)
    return NextResponse.json(sessionBody, { status: session.status });
  const owner = sessionBody?.data?.initiator;
  if (owner && owner.toLowerCase() !== user.userId.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const since = new URL(request.url).searchParams.get("since");
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  const result = await fetch(
    `${baseUrl}/v1/provenance/sessions/${encodeURIComponent(sessionId)}${query}`,
    {
      cache: "no-store",
      headers,
    },
  );
  return NextResponse.json(await result.json().catch(() => ({})), {
    status: result.status,
  });
}
