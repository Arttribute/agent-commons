import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Enrollment from "@/models/Enrollment";
import { coursesData } from "@/data/courses";

/**
 * GET /api/progress?courseSlug=xxx
 * Returns the user's enrollment progress for a course.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseSlug = req.nextUrl.searchParams.get("courseSlug");
  if (!courseSlug) return NextResponse.json({ error: "courseSlug required" }, { status: 400 });

  await connectDB();

  const enrollment = await Enrollment.findOne({ userId: session.user.id })
    .where("courseId")
    .lean();

  // Also try matching by slug via populated course — use a looser find
  const allEnrollments = await Enrollment.find({ userId: session.user.id })
    .populate("courseId", "slug")
    .lean();

  const match = allEnrollments.find((e: any) => e.courseId?.slug === courseSlug);

  if (!match) {
    return NextResponse.json({ enrolled: false, completedLessons: [], progress: 0 });
  }

  return NextResponse.json({
    enrolled: true,
    completedLessons: (match as any).completedLessons ?? [],
    progress: (match as any).progress ?? 0,
    status: (match as any).status,
  });
}

/**
 * POST /api/progress
 * Mark a lesson as complete and update enrollment progress.
 *
 * Body: { courseSlug: string; lessonKey: string }
 * lessonKey format: "moduleIndex:lessonIndex" e.g. "0:2"
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { courseSlug, lessonKey } = await req.json();
  if (!courseSlug || !lessonKey) {
    return NextResponse.json({ error: "courseSlug and lessonKey required" }, { status: 400 });
  }

  await connectDB();

  // Find enrollment via populated slug
  const allEnrollments = await Enrollment.find({ userId: session.user.id })
    .populate("courseId", "slug")
    .lean();

  const match = allEnrollments.find((e: any) => e.courseId?.slug === courseSlug);

  if (!match) {
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
  }

  // Calculate total lessons from static data (fallback when DB course isn't fully populated)
  const courseData = coursesData.find((c) => c.slug === courseSlug);
  const totalLessons = courseData?.modules.reduce((sum, m) => sum + m.lessons.length, 0) ?? 1;

  // Add lessonKey if not already present
  const existing: string[] = (match as any).completedLessons ?? [];
  const updated = existing.includes(lessonKey) ? existing : [...existing, lessonKey];
  const progress = Math.round((updated.length / totalLessons) * 100);
  const status = progress >= 100 ? "completed" : "active";

  await Enrollment.updateOne(
    { _id: (match as any)._id },
    {
      $set: {
        completedLessons: updated,
        progress,
        status,
        ...(status === "completed" ? { completedAt: new Date() } : {}),
      },
    },
  );

  return NextResponse.json({ completedLessons: updated, progress, status });
}
