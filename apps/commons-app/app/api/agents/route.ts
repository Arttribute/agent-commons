import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/agents - Create a new agent
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to create agent: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error creating agent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
//get all agents
/**
 * GET /api/agents - Get all agents
 */
export async function GET() {
  try {
    const res = await fetch(`${baseUrl}/v1/agents`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching agents:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
