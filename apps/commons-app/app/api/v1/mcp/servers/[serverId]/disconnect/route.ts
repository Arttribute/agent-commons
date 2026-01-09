// app/api/v1/mcp/servers/[serverId]/disconnect/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/v1/mcp/servers/[serverId]/disconnect - Disconnect from an MCP server
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { serverId } = resolvedParams;

    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}/disconnect`, {
      method: "POST",
    });

    if (!res.ok && res.status !== 204) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error("Error disconnecting from MCP server:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
