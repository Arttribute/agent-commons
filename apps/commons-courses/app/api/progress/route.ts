import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Enrollment from "@/models/Enrollment";
import Course from "@/models/Course";
import type mongoose from "mongoose";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { getCourseStartStatus } from "@/lib/course-schedule";
import { isInstallmentOverdue } from "@/lib/installment-enforcement";
import User from "@/models/User";
import { claimCommonLabReward } from "@/lib/credits";

interface EnrollmentProgress {
  _id: mongoose.Types.ObjectId;
  completedLessons?: string[];
  progress?: number;
  status?: string;
  accessLevel?: "full" | "partial";
  paymentStatus?: "free" | "paid" | "partial" | "overdue";
  currentInstallment?: number;
  paidAmount?: number;
  totalAmountDue?: number;
  nextPaymentDueAt?: Date;
  paymentGraceEndsAt?: Date;
}

interface CourseIdOnly {
  _id: mongoose.Types.ObjectId;
  startDate?: Date;
  price?: number;
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
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseSlug = req.nextUrl.searchParams.get("courseSlug");
  if (!courseSlug)
    return NextResponse.json({ error: "courseSlug required" }, { status: 400 });

  await connectDB();

  const course = (await Course.findOne({ slug: courseSlug, published: true })
    .select("_id startDate price")
    .lean()) as unknown as CourseIdOnly | null;
  if (!course) {
    return NextResponse.json({
      enrolled: false,
      completedLessons: [],
      progress: 0,
    });
  }

  const match = (await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  }).lean()) as EnrollmentProgress | null;

  if (!match) {
    return NextResponse.json({
      enrolled: false,
      completedLessons: [],
      progress: 0,
    });
  }

  const paymentStatus = isInstallmentOverdue(match)
    ? "overdue"
    : (match.paymentStatus ?? "free");
  if (paymentStatus === "overdue" && match.paymentStatus !== "overdue") {
    await Enrollment.updateOne(
      { _id: match._id },
      { $set: { paymentStatus: "overdue", accessLevel: "partial" } },
    );
  }

  return NextResponse.json({
    enrolled: true,
    completedLessons: match.completedLessons ?? [],
    progress: match.progress ?? 0,
    status: match.status,
    accessLevel:
      paymentStatus === "overdue" ? "partial" : (match.accessLevel ?? "full"),
    paymentStatus,
    currentInstallment: match.currentInstallment ?? 0,
    nextPaymentDueAt: match.nextPaymentDueAt,
    paymentGraceEndsAt: match.paymentGraceEndsAt,
    hasStarted: getCourseStartStatus(course.startDate).started,
    startDate: course.startDate,
    startDateLabel: getCourseStartStatus(course.startDate).label,
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
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { courseSlug, lessonKey } = await req.json();
  if (!courseSlug || !lessonKey) {
    return NextResponse.json(
      { error: "courseSlug and lessonKey required" },
      { status: 400 },
    );
  }

  await connectDB();

  const course = (await Course.findOne({ slug: courseSlug, published: true })
    .select("_id modules startDate")
    .lean()) as unknown as CourseWithModules | null;
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const match = (await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  }).lean()) as EnrollmentProgress | null;

  if (!match) {
    return NextResponse.json(
      { error: "Not enrolled in this course" },
      { status: 403 },
    );
  }

  if (isInstallmentOverdue(match)) {
    await Enrollment.updateOne(
      { _id: match._id },
      { $set: { paymentStatus: "overdue", accessLevel: "partial" } },
    );
    return NextResponse.json(
      {
        error: "Your next installment is overdue.",
        paymentStatus: "overdue",
        nextPaymentDueAt: match.nextPaymentDueAt,
        paymentGraceEndsAt: match.paymentGraceEndsAt,
      },
      { status: 402 },
    );
  }

  const startStatus = getCourseStartStatus(course.startDate);
  if (!startStatus.started) {
    return NextResponse.json(
      {
        error: "This course has not started yet.",
        startDate: course.startDate,
        startDateLabel: startStatus.label,
      },
      { status: 403 },
    );
  }

  const totalLessons =
    course.modules?.reduce(
      (sum: number, module: { lessons?: unknown[] }) =>
        sum + (module.lessons?.length ?? 0),
      0,
    ) || 1;

  const [moduleIndex, lessonIndex] = lessonKey
    .split(":")
    .map((part: string) => Number.parseInt(part, 10));
  if (
    !Number.isInteger(moduleIndex) ||
    !Number.isInteger(lessonIndex) ||
    moduleIndex < 0 ||
    lessonIndex < 0 ||
    !course.modules?.[moduleIndex]?.lessons?.[lessonIndex]
  ) {
    return NextResponse.json({ error: "Invalid lessonKey." }, { status: 400 });
  }

  // Add lessonKey if not already present
  const existing: string[] = match.completedLessons ?? [];
  const updated = existing.includes(lessonKey)
    ? existing
    : [...existing, lessonKey];
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
  await trackAnalyticsEvent({
    eventType: "lesson_completed",
    userId: session.user.id,
    courseId: course._id,
    courseSlug,
    page: "course.learn",
    moduleIndex: Number.isFinite(moduleIndex) ? moduleIndex : undefined,
    lessonIndex: Number.isFinite(lessonIndex) ? lessonIndex : undefined,
    metadata: { progress, status },
    request: req,
  });

  let creditGrant;
  // Retry the idempotent platform claim on later completion writes if the
  // first cross-service request failed after progress was persisted.
  if (status === "completed") {
    const user = await User.findById(session.user.id)
      .select("identityUserId identityWorkspaceId")
      .lean<{ identityUserId?: string; identityWorkspaceId?: string }>();
    if (user?.identityUserId) {
      creditGrant = await claimCommonLabReward({
        identityUserId: user.identityUserId,
        workspaceId: user.identityWorkspaceId,
        campaignKey: "commonlab-course-completion",
        eventId: course._id.toString(),
        relatedCourseId: course._id.toString(),
        metadata: { courseSlug },
      });
    }
  }

  return NextResponse.json({
    completedLessons: updated,
    progress,
    status,
    creditGrant,
  });
}
