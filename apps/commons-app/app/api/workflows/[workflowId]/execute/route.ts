import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * POST /api/workflows/:workflowId/execute - Execute workflow
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();

    const res = await fetch(
      `${baseUrl}/v1/workflows/${resolvedParams.workflowId}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    // Wrap response in expected format
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    console.error("Error executing workflow:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
