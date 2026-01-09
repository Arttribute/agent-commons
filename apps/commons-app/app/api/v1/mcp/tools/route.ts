// app/api/v1/mcp/tools/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/v1/mcp/tools - Get all MCP tools for an owner
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    const ownerType = searchParams.get("ownerType") || "user";

    const params = new URLSearchParams();
    if (ownerId) params.append("ownerId", ownerId);
    params.append("ownerType", ownerType);

    const res = await fetch(`${baseUrl}/v1/mcp/tools?${params}`, {
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching MCP tools:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
