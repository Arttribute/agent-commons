import { NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";
import { requireCurrentCommonsUser } from "@/lib/current-user";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST() {
  if (!baseUrl)
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  const { user, response } = await requireCurrentCommonsUser();
  if (!user) return response;
  const res = await fetch(`${baseUrl}/v1/credits/campaigns/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await backendAuthHeaders()),
    },
    body: JSON.stringify({ campaignKey: "daily-check-in" }),
  });
  return NextResponse.json(await res.json().catch(() => ({})), {
    status: res.status,
  });
}
