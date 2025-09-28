import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    console.log("Session id:", sessionId);

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/sessions/${sessionId}/full`;
    const response = await fetch(backendUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch session details");
    }

    const data = await response.json();
    console.log("Sesion data", data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching session details:", error);
    return NextResponse.json(
      { error: "Failed to fetch session details" },
      { status: 500 }
    );
  }
}
