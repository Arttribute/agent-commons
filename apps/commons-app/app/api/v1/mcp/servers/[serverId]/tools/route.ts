// app/api/v1/mcp/servers/[serverId]/tools/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/v1/mcp/servers/[serverId]/tools - Get tools for a server
 */
export async function GET(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;

    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}/tools`, {
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching MCP server tools:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
