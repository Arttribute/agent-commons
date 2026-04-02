import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    await connectDB();
    const course = await Course.findOne({ slug, published: true }).lean();
    if (!course) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(course);
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
