import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import User from "@/models/User";
import type { ICourse } from "@/models/Course";

export type EducatorSession = {
  userId: string;
  role: "learner" | "educator" | "admin";
};

export async function requireEducator() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      session: null,
    };
  }

  await connectDB();
  const user = (await User.findById(session.user.id)
    .select("role")
    .lean()) as { role?: "learner" | "educator" | "admin" } | null;
  const role = user?.role || session.user.role || "learner";
  if (role !== "educator" && role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Educator access required." },
        { status: 403 }
      ),
      session: null,
    };
  }

  return {
    error: null,
    session: {
      userId: session.user.id,
      role,
    } satisfies EducatorSession,
  };
}

export async function requireEducatorCourse(slug: string) {
  const result = await requireEducator();
  if (result.error) return result;

  await connectDB();
  const course = await Course.findOne({ slug });
  if (!course) {
    return {
      error: NextResponse.json({ error: "Course not found." }, { status: 404 }),
      session: null,
      course: null,
    };
  }

  const ownsCourse = course.educator?.userId?.toString() === result.session.userId;
  if (result.session.role !== "admin" && !ownsCourse) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
      session: null,
      course: null,
    };
  }

  return { error: null, session: result.session, course: course as ICourse };
}

export function slugifyCourseTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
