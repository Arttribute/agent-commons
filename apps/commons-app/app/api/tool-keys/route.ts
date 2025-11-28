// app/api/tool-keys/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/tool-keys - Create a new tool key
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/tool-keys`, {
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
    console.error("Error creating tool key:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/tool-keys - Get tool keys with filters
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ownerId = searchParams.get("ownerId");
  const ownerType = searchParams.get("ownerType");
  const toolId = searchParams.get("toolId");

  try {
    const params = new URLSearchParams();
    if (ownerId) params.append("ownerId", ownerId);
    if (ownerType) params.append("ownerType", ownerType);
    if (toolId) params.append("toolId", toolId);

    const url = params.toString()
      ? `${baseUrl}/v1/tool-keys?${params}`
      : `${baseUrl}/v1/tool-keys`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching tool keys:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
