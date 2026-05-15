import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { SearchActorRole } from "@/types/vector-search";

type SearchScopeInput = {
  courseSlug: string;
  role?: SearchActorRole;
};

type CourseIdOnly = { _id: mongoose.Types.ObjectId };

export type SearchScope =
  | {
      ok: true;
      userId: string;
      role: SearchActorRole;
      courseId: mongoose.Types.ObjectId;
      courseSlug: string;
      allowedAccessKeys: string[];
    }
  | { ok: false; error: NextResponse };

export function coursePublicKey(courseId: unknown) {
  return `course:${String(courseId)}:public`;
}

export function courseEnrolledKey(courseId: unknown) {
  return `course:${String(courseId)}:enrolled`;
}

export function courseEducatorsKey(courseId: unknown) {
  return `course:${String(courseId)}:educators`;
}

export function learnerPrivateKey(courseId: unknown, userId: unknown) {
  return `course:${String(courseId)}:learner:${String(userId)}`;
}

export async function buildSearchScope({
  courseSlug,
  role = "learner",
}: SearchScopeInput): Promise<SearchScope> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const sessionRole = session.user.role || "learner";
  const requestedRole =
    role === "educator" && (sessionRole === "educator" || sessionRole === "admin")
      ? "educator"
      : "learner";

  if (requestedRole === "educator") {
    const result = await requireEducatorCourse(courseSlug);
    if (result.error) return { ok: false, error: result.error };
    return {
      ok: true,
      userId: session.user.id,
      role: "educator",
      courseId: result.course._id,
      courseSlug,
      allowedAccessKeys: [
        coursePublicKey(result.course._id),
        courseEnrolledKey(result.course._id),
        courseEducatorsKey(result.course._id),
      ],
    };
  }

  await connectDB();
  const course = (await Course.findOne({ slug: courseSlug, published: true })
    .select("_id")
    .lean()) as CourseIdOnly | null;
  if (!course?._id) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Course not found." }, { status: 404 }),
    };
  }

  const enrollment = await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  })
    .select("_id")
    .lean();
  if (!enrollment) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Not enrolled." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: session.user.id,
    role: "learner",
    courseId: course._id as mongoose.Types.ObjectId,
    courseSlug,
    allowedAccessKeys: [
      coursePublicKey(course._id),
      courseEnrolledKey(course._id),
      learnerPrivateKey(course._id, session.user.id),
    ],
  };
}
