// File: app/api/agents/agent/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;
export const maxDuration = 45;

/**
 * GET /api/agents/agent?agentId=xxxx
 * Fetch a single agent by ID.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("Error fetching agent:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST (run agent) /api/agents/agent?agentId=xxxx
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("agentId");
  if (!id) {
    return NextResponse.json(
      { error: "Missing agentId query param" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/agents/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: id, messages: body.messages }),
    });
    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error running agent:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  try {
    const updates = await request.json();
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error("Error updating agent:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
