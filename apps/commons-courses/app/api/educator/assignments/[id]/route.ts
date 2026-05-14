import { NextRequest, NextResponse } from "next/server";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";

async function getOwnedAssignment(id: string) {
  const assignment = await Assignment.findById(id);
  if (!assignment) {
    return {
      error: NextResponse.json(
        { error: "Assignment not found." },
        { status: 404 }
      ),
      assignment: null,
    };
  }
  const course = await Course.findById(assignment.courseId).select("slug");
  if (!course) {
    return {
      error: NextResponse.json({ error: "Course not found." }, { status: 404 }),
      assignment: null,
    };
  }
  const result = await requireEducatorCourse(course.slug);
  if (result.error) return result;
  return { error: null, assignment };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getOwnedAssignment(id);
  if (result.error) return result.error;

  const body = await req.json();
  result.assignment.set({
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
  await result.assignment.save();

  return NextResponse.json({ assignment: result.assignment });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getOwnedAssignment(id);
  if (result.error) return result.error;

  await result.assignment.deleteOne();
  return NextResponse.json({ success: true });
}
