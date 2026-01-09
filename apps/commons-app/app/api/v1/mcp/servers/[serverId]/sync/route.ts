// app/api/v1/mcp/servers/[serverId]/sync/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/v1/mcp/servers/[serverId]/sync - Sync tools from MCP server
 */
export async function POST(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;
    const body = await request.json().catch(() => ({}));

    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}/sync`, {
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
    console.error("Error syncing MCP server tools:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
