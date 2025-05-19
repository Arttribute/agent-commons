import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { goalId: string } }
) {
  try {
    const { goalId } = params;
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_NEST_API_BASE_URL}/v1/goals/${goalId}/tasks`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

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
