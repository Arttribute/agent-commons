import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/workflows/executions/:executionId - Get execution status and results
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ executionId: string }> }
) {
  try {
    const resolvedParams = await params;
    const res = await fetch(
      `${baseUrl}/v1/workflows/executions/${resolvedParams.executionId}`,
      {
        method: "GET",
      }
    );

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error("Error fetching execution:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
