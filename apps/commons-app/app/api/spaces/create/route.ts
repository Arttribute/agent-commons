import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description } = body;

    // Create a space via the backend API
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-creator-id": "user-" + Date.now(), // FIXME: use actual ID. For now, use a simple user ID
          "x-creator-type": "human",
        },
        body: JSON.stringify({
          name,
          description,
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to create space");
    }

    const result = await response.json();
    const spaceData = result.data;

    return NextResponse.json({
      spaceId: spaceData.spaceId,
      name: spaceData.name,
      description: spaceData.description,
    });
  } catch (error) {
    console.error("Error creating space:", error);
    return NextResponse.json(
      { error: "Failed to create space" },
      { status: 500 }
    );
  }
}
