import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pluginId: string }> }
) {
  if (!baseUrl) return unavailable();
  const { pluginId } = await params;
  const response = await fetch(
    `${baseUrl}/v1/ui-plugins/${encodeURIComponent(pluginId)}/status`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(await backendAuthHeaders()),
      },
      body: JSON.stringify(await request.json()),
    }
  );
  return forward(response);
}

async function forward(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

function unavailable() {
  return NextResponse.json(
    { error: "Server base URL not configured" },
    { status: 500 }
  );
}
