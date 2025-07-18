// This route for non-streaming collaboration with agents in a space
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { spaceId: string } }
) {
  try {
    const body = await request.json();
    const { task, agentIds, spaceName, enableCollaborationSummary, timeoutMs } =
      body;
    const { spaceId } = await params;

    const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces/${spaceId}/run`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward any authorization headers
    if (request.headers.get("authorization")) {
      headers["authorization"] = request.headers.get("authorization")!;
    }

    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        agentIds,
        initialMessage: task,
        spaceName,
        enableCollaborationSummary,
        timeoutMs,
      }),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      return new NextResponse(errorText, {
        status: backendResponse.status,
        headers: {
          "Content-Type":
            backendResponse.headers.get("content-type") || "application/json",
        },
      });
    }

    const responseData = await backendResponse.json();
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error in space collaboration API route:", error);
    return NextResponse.json(
      { error: "Failed to start space collaboration" },
      { status: 500 }
    );
  }
}
