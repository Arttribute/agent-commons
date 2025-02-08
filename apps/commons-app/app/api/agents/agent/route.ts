import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET  - Fetch a single agent by ID
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("agentId");

  try {
    const res = await fetch(`${baseUrl}/v1/agents/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch agent: ${res.statusText}`);
    }
    console.log("Agent got called!!!");
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching agent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/agents/[id]/run - Run an agent
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("agentId");

  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/agents/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: id, messages: body.messages }),
    });

    if (!res.ok) {
      throw new Error(`Failed to run agent: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error running agent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT  - Update an agent
 */
export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("agentId");
  console.log("id", id);

  try {
    const body = await request.json();

    const res = await fetch(`${baseUrl}/v1/agents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Failed to update agent: ${res.statusText}`);
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error updating agent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
