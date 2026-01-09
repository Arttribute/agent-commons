// app/api/v1/mcp/servers/[serverId]/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/v1/mcp/servers/[serverId] - Get a specific MCP server
 */
export async function GET(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;

    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}`, {
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching MCP server:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/v1/mcp/servers/[serverId] - Update an MCP server
 */
export async function PUT(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;
    const body = await request.json();

    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}`, {
      method: "PUT",
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
    console.error("Error updating MCP server:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/mcp/servers/[serverId] - Delete an MCP server
 */
export async function DELETE(
  request: Request,
  { params }: { params: { serverId: string } }
) {
  try {
    const { serverId } = params;

    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}`, {
      method: "DELETE",
    });

    if (!res.ok && res.status !== 204) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error("Error deleting MCP server:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
