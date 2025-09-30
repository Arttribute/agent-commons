import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get("spaceId");
    console.log("space id:", spaceId);

    if (!spaceId) {
      return NextResponse.json(
        { error: "space ID is required" },
        { status: 400 }
      );
    }

    const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/spaces/${spaceId}/full`;
    const response = await fetch(backendUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch space details");
    }

    const data = await response.json();
    console.log("Sesion data", data);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching space details:", error);
    return NextResponse.json(
      { error: "Failed to fetch space details" },
      { status: 500 }
    );
  }
}
