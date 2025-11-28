// app/api/tools/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/tools - Create a new tool via the Nest server
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/tools`, {
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
    console.error("Error creating tool:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/tools - Get all tools with optional filters
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const ownerType = searchParams.get("ownerType");
  const visibility = searchParams.get("visibility");

  try {
    const params = new URLSearchParams();
    if (owner) params.append("owner", owner);
    if (ownerType) params.append("ownerType", ownerType);
    if (visibility) params.append("visibility", visibility);

    const url = params.toString()
      ? `${baseUrl}/v1/tools?${params}`
      : `${baseUrl}/v1/tools`;

    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching tools:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
