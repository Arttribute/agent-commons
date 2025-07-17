// This route is for streaming collaboration with agents in a space
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { spaceId: string } }
) {
  try {
    const body = await request.json();
    const { task, agentIds, spaceName } = body;
    const { spaceId } = await params;

    const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces/${spaceId}/collaboration/agents/stream`;

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

    // Return a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            controller.enqueue(value);
          }
        } catch (error) {
          console.error("Stream reading error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in space streaming API route:", error);
    return NextResponse.json(
      { error: "Failed to start space streaming collaboration" },
      { status: 500 }
    );
  }
}
