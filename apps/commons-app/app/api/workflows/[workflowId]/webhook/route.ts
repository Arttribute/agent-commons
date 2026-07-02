import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { workflowId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });

  try {
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}/webhook`, {
      cache: "no-store",
      headers: await backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { workflowId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });

  try {
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}/webhook-token`, {
      method: "POST",
      headers: await backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { workflowId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });

  try {
    const res = await fetch(`${baseUrl}/v1/workflows/${workflowId}/webhook-token`, {
      method: "DELETE",
      headers: await backendAuthHeaders(),
    });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
