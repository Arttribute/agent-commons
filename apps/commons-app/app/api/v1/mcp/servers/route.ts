// app/api/v1/mcp/servers/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/v1/mcp/servers - Create a new MCP server
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    const ownerType = searchParams.get("ownerType") || "user";

    const body = await request.json();

    const params = new URLSearchParams();
    if (ownerId) params.append("ownerId", ownerId);
    params.append("ownerType", ownerType);

    const res = await fetch(`${baseUrl}/v1/mcp/servers?${params}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error creating MCP server:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/mcp/servers - List MCP servers for an owner
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    const ownerType = searchParams.get("ownerType") || "user";

    const params = new URLSearchParams();
    if (ownerId) params.append("ownerId", ownerId);
    params.append("ownerType", ownerType);

    const res = await fetch(`${baseUrl}/v1/mcp/servers?${params}`, {
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching MCP servers:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
