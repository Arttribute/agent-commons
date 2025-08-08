import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spaceId, ...memberData } = body;

    if (!spaceId) {
      return NextResponse.json(
        { error: "spaceId is required" },
        { status: 400 }
      );
    }

    // Call your backend service endpoint
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces/${spaceId}/members`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(memberData),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to add member");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error adding member:", error);

    // Handle known error types from NestJS
    if (error?.response?.message) {
      // NestJS exception format
      return NextResponse.json(
        { error: error.response.message },
        { status: error.status || 400 }
      );
    }

    // Fallback to generic error
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
