import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Enrollment from "@/models/Enrollment";
import Course from "@/models/Course";
import type mongoose from "mongoose";

interface EnrollmentProgress {
  _id: mongoose.Types.ObjectId;
  completedLessons?: string[];
  progress?: number;
  status?: string;
  accessLevel?: "full" | "partial";
  paymentStatus?: "free" | "paid" | "partial" | "overdue";
  currentInstallment?: number;
}

interface CourseIdOnly {
  _id: mongoose.Types.ObjectId;
}

interface CourseWithModules extends CourseIdOnly {
  modules?: { lessons?: unknown[] }[];
}

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

  const course = (await Course.findOne({ slug: courseSlug, published: true })
    .select("_id")
    .lean()) as unknown as CourseIdOnly | null;
  if (!course) {
    return NextResponse.json({ enrolled: false, completedLessons: [], progress: 0 });
  }

  const match = (await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  }).lean()) as EnrollmentProgress | null;

  if (!match) {
    return NextResponse.json({ enrolled: false, completedLessons: [], progress: 0 });
  }

  return NextResponse.json({
    enrolled: true,
    completedLessons: match.completedLessons ?? [],
    progress: match.progress ?? 0,
    status: match.status,
    accessLevel: match.accessLevel ?? "full",
    paymentStatus: match.paymentStatus ?? "free",
    currentInstallment: match.currentInstallment ?? 0,
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

  const course = (await Course.findOne({ slug: courseSlug, published: true })
    .select("_id modules")
    .lean()) as unknown as CourseWithModules | null;
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const match = (await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  }).lean()) as EnrollmentProgress | null;

  if (!match) {
    return NextResponse.json({ error: "Not enrolled in this course" }, { status: 403 });
  }

  const totalLessons =
    course.modules?.reduce(
      (sum: number, module: { lessons?: unknown[] }) =>
        sum + (module.lessons?.length ?? 0),
      0,
    ) || 1;

  // Add lessonKey if not already present
  const existing: string[] = match.completedLessons ?? [];
  const updated = existing.includes(lessonKey) ? existing : [...existing, lessonKey];
  const progress = Math.round((updated.length / totalLessons) * 100);
  const status = progress >= 100 ? "completed" : "active";

  await Enrollment.updateOne(
    { _id: match._id },
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
