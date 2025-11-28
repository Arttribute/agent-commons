// app/api/tools/[name]/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/tools/:name - Get a specific tool by name
 */
export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const res = await fetch(`${baseUrl}/v1/tools/${params.name}`, {
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching tool:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/tools/:name - Update a tool by name
 */
export async function PUT(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/tools/${params.name}`, {
      method: "PUT",
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
    console.error("Error updating tool:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/tools/:name - Delete a tool by name
 */
export async function DELETE(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const res = await fetch(`${baseUrl}/v1/tools/${params.name}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error deleting tool:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
