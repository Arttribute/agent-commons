import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import User from "@/models/User";
import type { ICourse } from "@/models/Course";

export type EducatorSession = {
  userId: string;
  email?: string | null;
  role: "learner" | "educator" | "admin";
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase();
}

export function buildManagedCoursesFilter(session: {
  userId: string;
  email?: string | null;
  role?: "learner" | "educator" | "admin";
}) {
  if (session.role === "admin") return {};
  const email = normalizeEmail(session.email);
  return {
    $or: [
      { "educator.userId": session.userId },
      { "collaborators.userId": session.userId },
      ...(email ? [{ "collaborators.email": email }] : []),
    ],
  };
}

export function getCourseCollaboratorRole(
  course: ICourse,
  session: { userId: string; email?: string | null }
) {
  const email = normalizeEmail(session.email);
  const collaborator = course.collaborators?.find((item) => {
    const matchesUser = item.userId?.toString() === session.userId;
    const matchesEmail = email && item.email?.toLowerCase() === email;
    return matchesUser || matchesEmail;
  });
  return collaborator?.role;
}

export function canManageCourseCollaborators(
  course: ICourse,
  session: EducatorSession
) {
  if (session.role === "admin") return true;
  if (course.educator?.userId?.toString() === session.userId) return true;
  return getCourseCollaboratorRole(course, session) === "co_owner";
}

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
      email: session.user.email,
      role,
    } satisfies EducatorSession,
  };
}

export async function requireEducatorCourse(slug: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
      session: null,
      course: null,
    };
  }

  await connectDB();
  const user = (await User.findById(session.user.id)
    .select("role")
    .lean()) as { role?: "learner" | "educator" | "admin" } | null;
  const currentSession = {
    userId: session.user.id,
    email: session.user.email,
    role: user?.role || session.user.role || "learner",
  } satisfies EducatorSession;

  const course = await Course.findOne({ slug });
  if (!course) {
    return {
      error: NextResponse.json({ error: "Course not found." }, { status: 404 }),
      session: null,
      course: null,
    };
  }

  const ownsCourse = course.educator?.userId?.toString() === currentSession.userId;
  const collaboratorRole = getCourseCollaboratorRole(course as ICourse, currentSession);
  if (currentSession.role !== "admin" && !ownsCourse && !collaboratorRole) {
    return {
      error: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
      session: null,
      course: null,
    };
  }

  return { error: null, session: currentSession, course: course as ICourse };
}

export function slugifyCourseTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
