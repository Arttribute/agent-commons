import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

type Ctx = { params: Promise<{ agentId: string }> };

// GET /api/agents/:agentId/knowledgebase
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { agentId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}/knowledgebase`, {
      cache: "no-store",
      headers: backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/agents/:agentId/knowledgebase
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  const { agentId } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}/knowledgebase`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...backendAuthHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
