import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/workflows - List workflows
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    const ownerType = searchParams.get("ownerType");

    const params = new URLSearchParams();
    if (ownerId) params.append("ownerId", ownerId);
    if (ownerType) params.append("ownerType", ownerType);

    const res = await fetch(`${baseUrl}/v1/workflows?${params}`, {
      method: "GET",
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    // Wrap response in expected format
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching workflows:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/workflows - Create workflow
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const res = await fetch(`${baseUrl}/v1/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    // Wrap response in expected format
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating workflow:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
