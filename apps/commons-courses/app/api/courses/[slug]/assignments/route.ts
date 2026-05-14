import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Submission from "@/models/Submission";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { slug } = await params;
  await connectDB();
  const course = await Course.findOne({ slug, published: true }).select("_id");
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const enrollment = await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Not enrolled." }, { status: 403 });
  }

  const assignments = await Assignment.find({
    courseId: course._id,
    published: true,
  })
    .sort({ moduleIndex: 1, lessonIndex: 1, createdAt: -1 })
    .lean();
  const submissions = await Submission.find({
    courseId: course._id,
    userId: session.user.id,
  }).lean();

  return NextResponse.json({ assignments, submissions });
}
