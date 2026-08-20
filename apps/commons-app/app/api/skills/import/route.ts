import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/api-headers";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

export async function POST(request: NextRequest) {
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Server base URL not configured" },
      { status: 500 }
    );
  }
  try {
    const body = await request.formData();
    const response = await fetch(`${baseUrl}/v1/skills/import`, {
      method: "POST",
      headers: await backendAuthHeaders(),
      body,
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not import skill",
      },
      { status: 500 }
    );
  }
}
