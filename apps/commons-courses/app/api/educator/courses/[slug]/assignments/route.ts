import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { sendAssignmentNotification } from "@/lib/email/resend";
import { indexAssignmentForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import Enrollment from "@/models/Enrollment";
import Submission from "@/models/Submission";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const assignments = await Assignment.find({ courseId: result.course._id })
    .sort({ moduleIndex: 1, lessonIndex: 1, createdAt: -1 })
    .lean();
  const submissions = await Submission.find({ courseId: result.course._id })
    .populate("userId", "name email")
    .sort({ submittedAt: -1 })
    .lean();

  return NextResponse.json({ assignments, submissions });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const body = await req.json();
  if (!body.title || !body.instructions) {
    return NextResponse.json(
      { error: "title and instructions are required." },
      { status: 400 }
    );
  }

  const assignment = await Assignment.create({
    courseId: result.course._id,
    educatorId: result.session.userId,
    title: body.title,
    instructions: body.instructions,
    moduleIndex:
      body.moduleIndex === "" || body.moduleIndex === undefined
        ? undefined
        : Number(body.moduleIndex),
    lessonIndex:
      body.lessonIndex === "" || body.lessonIndex === undefined
        ? undefined
        : Number(body.lessonIndex),
    dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
    points: Number(body.points || 100),
    acceptsText: body.acceptsText !== false,
    acceptsUrl: body.acceptsUrl !== false,
    published: body.published !== false,
  });
  await indexAssignmentForSearch(assignment);
  if (assignment.published) {
    const enrollments = await Enrollment.find({
      courseId: result.course._id,
      status: "active",
    })
      .populate("userId", "name email")
      .lean();
    await sendAssignmentNotification({
      recipients: enrollments.map((enrollment) => {
        const user = enrollment.userId as unknown as {
          name?: string;
          email?: string;
        };
        return { name: user?.name, email: user?.email };
      }),
      course: {
        title: result.course.title,
        slug: result.course.slug,
        settings: result.course.emailSettings,
      },
      assignment: {
        title: assignment.title,
        dueAt: assignment.dueAt,
        points: assignment.points,
        instructions: assignment.instructions,
      },
      event: "created",
    });
  }

  return NextResponse.json({ assignment }, { status: 201 });
}
