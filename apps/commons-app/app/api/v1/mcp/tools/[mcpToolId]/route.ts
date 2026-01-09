// app/api/v1/mcp/tools/[mcpToolId]/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/v1/mcp/tools/[mcpToolId] - Get a specific MCP tool
 */
export async function GET(
  request: Request,
  { params }: { params: { mcpToolId: string } }
) {
  try {
    const { mcpToolId } = params;

    const res = await fetch(`${baseUrl}/v1/mcp/tools/${mcpToolId}`, {
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching MCP tool:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
