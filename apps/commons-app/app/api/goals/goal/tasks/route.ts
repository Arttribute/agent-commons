import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get("goalId");

    if (!goalId) {
      return NextResponse.json(
        { error: "Goal ID is required" },
        { status: 400 }
      );
    }

    const backendUrl = `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/goals/${goalId}/tasks`;
    const response = await fetch(backendUrl);

    if (!response.ok) {
      throw new Error("Failed to fetch tasks");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
