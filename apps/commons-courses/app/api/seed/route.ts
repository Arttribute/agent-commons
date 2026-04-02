import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import { coursesData } from "@/data/courses";

// POST /api/seed — run once to populate the DB
// Disabled in production
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production." },
      { status: 403 }
    );
  }

  await connectDB();

  for (const courseData of coursesData) {
    // Replace the whole document so new schema fields are always written
    await Course.findOneAndReplace({ slug: courseData.slug }, courseData, {
      upsert: true,
      new: true,
    });
  }

  return NextResponse.json({ success: true, seeded: coursesData.length });
}
