import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ scopeType: string; scopeId: string }> },
) {
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );

  const { scopeType, scopeId } = await params;
  const result = await fetch(
    `${baseUrl}/v1/provenance/scopes/${encodeURIComponent(scopeType)}/${encodeURIComponent(scopeId)}`,
    {
      cache: "no-store",
      headers: await backendAuthHeaders(),
    },
  );
  return NextResponse.json(await result.json().catch(() => ({})), {
    status: result.status,
  });
}
