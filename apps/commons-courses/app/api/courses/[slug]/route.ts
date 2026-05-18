import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getCourseStartStatus } from "@/lib/course-schedule";
import Course from "@/models/Course";

type PublicCourse = {
  startDate?: Date;
  [key: string]: unknown;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    await connectDB();
    const course = (await Course.findOne({
      slug,
      published: true,
    }).lean()) as PublicCourse | null;
    if (!course) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const startStatus = getCourseStartStatus(course.startDate as Date | undefined);
    return NextResponse.json({
      ...course,
      hasStarted: startStatus.started,
      startDateLabel: startStatus.label,
    });
  } catch {
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
