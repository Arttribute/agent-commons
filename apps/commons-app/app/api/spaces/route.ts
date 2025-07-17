import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { spaceId, endpoint } = body;

  // Remove spaceId and endpoint from body as they're used for routing
  const { spaceId: _, endpoint: __, ...requestBody } = body;

  const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces/${spaceId}/collaboration/${endpoint}`;

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
      body: JSON.stringify(requestBody),
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

    // For streaming responses
    if (backendResponse.headers.get("content-type")?.includes("text/stream")) {
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
            console.error("Error reading stream:", error);
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // For non-streaming responses
    const responseData = await backendResponse.json();
    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Error in spaces API:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
