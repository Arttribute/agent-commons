import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json(); // Parse JSON body
  const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/agents/run/stream`; // Use the streaming endpoint
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (req.headers.get("authorization")) {
    headers["authorization"] = req.headers.get("authorization")!;
  }
  if (req.headers.get("x-initiator")) {
    headers["x-initiator"] = req.headers.get("x-initiator")!;
  }

  try {
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!backendResponse.ok) {
      // If the backend response is not OK, return an error response
      const errorText = await backendResponse.text();
      return new NextResponse(errorText, {
        status: backendResponse.status,
        headers: {
          "Content-Type":
            backendResponse.headers.get("content-type") || "application/json",
        },
      });
    }

    // Return a new StreamingTextResponse with the backend's stream
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
        "Content-Type": "text/event-stream", // Important for SSE
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in API route:", error);
    return new NextResponse(JSON.stringify({ error }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
