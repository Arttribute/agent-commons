import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ capability: string }> }
) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 }
    );
  }
  const { capability } = await params;
  const body = await request.json();
  const response = await fetch(
    `${baseUrl}/v1/providers/${encodeURIComponent(capability)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(await backendAuthHeaders()),
      },
      body: JSON.stringify(body),
    }
  );
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ capability: string }> }
) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 }
    );
  }
  const { capability } = await params;
  const response = await fetch(
    `${baseUrl}/v1/providers/${encodeURIComponent(capability)}`,
    { method: "DELETE", headers: await backendAuthHeaders() }
  );
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
