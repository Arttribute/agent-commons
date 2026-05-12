import { NextResponse } from "next/server";

// POST /api/seed — deprecated. Courses are now managed directly in MongoDB.
export async function POST() {
  return NextResponse.json(
    { error: "Static course seeding is disabled. Courses are read from MongoDB." },
    { status: 410 },
  );
}
