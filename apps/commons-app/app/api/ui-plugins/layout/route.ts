import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function GET() {
  return forward("GET");
}

export async function PUT(request: NextRequest) {
  return forward("PUT", "", JSON.stringify(await request.json()));
}

export async function DELETE(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get("scope") ?? "";
  return forward("DELETE", `?scope=${encodeURIComponent(scope)}`);
}

async function forward(method: string, suffix = "", body?: string) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 },
    );
  }
  const response = await fetch(`${baseUrl}/v1/ui-plugins/layout${suffix}`, {
    method,
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(await backendAuthHeaders()),
    },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
