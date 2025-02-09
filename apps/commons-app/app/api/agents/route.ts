import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/agents - Create a new agent via the Nest server
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
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
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
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");

  try {
    const url = owner
      ? `${baseUrl}/v1/agents?owner=${owner}`
      : `${baseUrl}/v1/agents`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching agents:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
