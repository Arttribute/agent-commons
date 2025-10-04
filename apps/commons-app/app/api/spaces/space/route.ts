import { NextRequest, NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// Helper to extract id
function spaceUrl(id: string) {
  return `${baseUrl}/v1/spaces/${id}`;
}

export async function GET(request: NextRequest) {
  const spaceId = request.nextUrl.searchParams.get("spaceId");

  if (!spaceId) {
    return NextResponse.json(
      { error: "spaceId query parameter is required" },
      { status: 400 }
    );
  }

  const full = request.nextUrl.searchParams.get("full");
  const url = full === "true" ? `${spaceUrl(spaceId)}/full` : spaceUrl(spaceId);

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error fetching space", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const spaceId = request.nextUrl.searchParams.get("spaceId");

  if (!spaceId) {
    return NextResponse.json(
      { error: "spaceId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const res = await fetch(spaceUrl(spaceId), {
      method: "PUT", // backend uses PUT for update
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error updating space", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const spaceId = request.nextUrl.searchParams.get("spaceId");

  if (!spaceId) {
    return NextResponse.json(
      { error: "spaceId query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(spaceUrl(spaceId), { method: "DELETE" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error deleting space", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
