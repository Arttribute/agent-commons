import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function GET(
  _request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { serverId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}`, {
      cache: "no-store",
      headers: backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { serverId } = await params;
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}`, {
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const { serverId } = await params;
  try {
    const res = await fetch(`${baseUrl}/v1/mcp/servers/${serverId}`, {
      method: "DELETE",
      headers: backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
