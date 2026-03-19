import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/workflows/[workflowId]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}`, { cache: "no-store", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/workflows/[workflowId]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}`, {
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

// DELETE /api/workflows/[workflowId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  try {
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}`, { method: "DELETE", headers: backendAuthHeaders() });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
