import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { indexAssignmentForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
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

  return NextResponse.json({ assignment }, { status: 201 });
}
