import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

type Params = { agentId: string };

// POST /api/agents/:agentId/autonomy/trigger
export async function POST(_req: NextRequest, { params }: { params: Promise<Params> }) {
  const { agentId } = await params;
  if (!baseUrl) return NextResponse.json({ error: "Base URL not configured" }, { status: 500 });
  try {
    const res = await fetch(`${baseUrl}/v1/agents/${agentId}/autonomy/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...backendAuthHeaders() },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
