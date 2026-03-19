import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/agents/[agentId]/tools
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}/tools`, { cache: "no-store", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/agents/[agentId]/tools  (assign tool to agent)
export async function POST(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...backendAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
