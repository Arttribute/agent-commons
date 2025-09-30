import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json(); // Parse JSON body
  const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces/${body.spaceId}/messages`; // Use the streaming endpoint
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-sender-id": body.senderId || body.currentUserId, // fallback to currentUserId if senderId not present
    "x-sender-type": body.senderType || "human",
  };
  if (req.headers.get("authorization")) {
    headers["authorization"] = req.headers.get("authorization")!;
  }

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in API route:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new NextResponse(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
