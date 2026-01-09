import { NextResponse } from "next/server";

const baseUrl = process.env.NEXT_PUBLIC_NEST_API_BASE_URL;

/**
 * GET /api/workflows/:workflowId - Get workflow with nodes and edges
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const resolvedParams = await params;
    const res = await fetch(`${baseUrl}/v1/workflows/${resolvedParams.workflowId}`, {
      method: "GET",
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    // Wrap response in expected format
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching workflow:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/workflows/:workflowId - Update workflow
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();

    const res = await fetch(`${baseUrl}/v1/workflows/${resolvedParams.workflowId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    // Wrap response in expected format
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    console.error("Error updating workflow:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/workflows/:workflowId - Delete workflow
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const resolvedParams = await params;
    const res = await fetch(`${baseUrl}/v1/workflows/${resolvedParams.workflowId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const errData = await res.json();
      return NextResponse.json(errData, { status: res.status });
    }

    const data = await res.json();
    // Wrap response in expected format
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    console.error("Error deleting workflow:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
