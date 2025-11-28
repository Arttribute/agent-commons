// app/api/tool-permissions/grant/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/tool-permissions/grant - Grant permission
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/v1/tool-permissions/grant`, {
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
    console.error("Error granting permission:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
