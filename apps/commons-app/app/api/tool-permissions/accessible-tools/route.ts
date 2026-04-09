import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/tool-permissions/accessible-tools?subjectId=<id>&subjectType=<type>
export async function GET(req: NextRequest) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { searchParams } = new URL(req.url);
  const p = new URLSearchParams();
  ["subjectId", "subjectType"].forEach((k) => {
    const v = searchParams.get(k);
    if (v) p.set(k, v);
  });
  try {
    const res = await fetch(`${baseUrl}/v1/tool-permissions/accessible-tools?${p.toString()}`, {
      cache: "no-store",
      headers: backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
