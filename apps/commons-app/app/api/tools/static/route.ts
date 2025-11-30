// app/api/tools/static/route.ts
import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/tools/static - Get static/common tools available to all agents
 */
export async function GET() {
  try {
    const res = await fetch(`${baseUrl}/v1/tools/static`, {
      cache: "no-store",
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching static tools:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
