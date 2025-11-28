// app/api/tool-permissions/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/tool-permissions - Get tool permissions
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const toolId = searchParams.get("toolId");

  try {
    const params = new URLSearchParams();
    if (toolId) params.append("toolId", toolId);

    const url = params.toString()
      ? `${baseUrl}/v1/tool-permissions?${params}`
      : `${baseUrl}/v1/tool-permissions`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching tool permissions:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
