import { NextRequest, NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// GET /api/spaces - list spaces with filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const params = new URLSearchParams();
  const forwardKeys = [
    "memberId",
    "memberType",
    "agentIds",
    "publicOnly",
    "search",
    "includeMembers",
    "limit",
    "offset",
  ];
  forwardKeys.forEach((k) => {
    const v = searchParams.get(k);
    if (v) params.set(k, v);
  });
  // Forward repeated agentId params
  const agentIdValues = searchParams.getAll("agentId");
  agentIdValues.forEach((v) => params.append("agentId", v));
  if (!baseUrl) {
    return NextResponse.json({ error: "Server base URL not configured" }, { status: 500 });
  }
  const querySuffix = params.toString() ? `?${params.toString()}` : "";
  const url = `${baseUrl}/v1/spaces${querySuffix}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json().catch(() => ({ error: "Bad JSON" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error listing spaces", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/spaces - create space
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const creatorId = request.headers.get("x-creator-id") || body.createdBy;
    const creatorType =
      (request.headers.get("x-creator-type") as "agent" | "human") ||
      body.createdByType ||
      "human";
    if (!creatorId) {
      return NextResponse.json(
        { error: "Creator ID required" },
        { status: 400 }
      );
    }
    const res = await fetch(`${baseUrl}/v1/spaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-creator-id": creatorId,
        "x-creator-type": creatorType,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error creating space", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
