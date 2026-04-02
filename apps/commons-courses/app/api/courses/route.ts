import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";

export async function GET() {
  try {
    await connectDB();
    const courses = await Course.find({ published: true })
      .select("-modules")
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json(courses);
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
