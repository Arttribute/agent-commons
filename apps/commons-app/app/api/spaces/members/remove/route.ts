import { NextRequest, NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

// DELETE via POST wrapper to keep simple client side form usage
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spaceId, memberId, memberType } = body;
    if (!spaceId || !memberId || !memberType) {
      return NextResponse.json(
        { error: "spaceId, memberId, memberType required" },
        { status: 400 }
      );
    }
    const url = `${baseUrl}/v1/spaces/${spaceId}/members/${memberId}?memberType=${memberType}`;
    const res = await fetch(url, { method: "DELETE" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("Error removing member", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
