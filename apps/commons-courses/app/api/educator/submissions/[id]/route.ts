import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Course from "@/models/Course";
import Submission from "@/models/Submission";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const submission = await Submission.findById(id);
  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  const course = await Course.findById(submission.courseId).select("slug");
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const result = await requireEducatorCourse(course.slug);
  if (result.error) return result.error;

  const body = await req.json();
  submission.set({
    score:
      body.score === "" || body.score === undefined
        ? undefined
        : Number(body.score),
    feedback: body.feedback,
    status: body.status || "reviewed",
    reviewedAt: new Date(),
  });
  await submission.save();

  return NextResponse.json({ submission });
}
