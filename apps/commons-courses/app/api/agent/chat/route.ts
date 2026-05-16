import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { runGeneralAgent } from "@/lib/general-agent-runtime";
import {
  courseEducatorsKey,
  courseEnrolledKey,
  coursePublicKey,
  learnerPrivateKey,
} from "@/lib/search-access";
import { scopedVectorSearch } from "@/lib/vector-search";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { CourseAgentMessage, CourseAgentViewContext } from "@/types/course-agent";

type Body = {
  message?: string;
  messages?: CourseAgentMessage[];
  context?: CourseAgentViewContext;
};

type EnrollmentWithCourse = {
  courseId?: {
    _id: unknown;
    title?: string;
    slug?: string;
  };
  progress?: number;
};

type EducatorCourse = {
  _id: unknown;
  title: string;
  slug: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  if (!body.message || !body.context) {
    return NextResponse.json(
      { error: "message and context are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const enrollments = (await Enrollment.find({ userId: session.user.id })
    .populate("courseId", "title slug")
    .sort({ enrolledAt: -1 })
    .lean()) as unknown as EnrollmentWithCourse[];
  const educatorCourses = (await Course.find(
    session.user.role === "admin"
      ? {}
      : { "educator.userId": session.user.id }
  )
    .select("_id title slug")
    .sort({ updatedAt: -1 })
    .lean()) as unknown as EducatorCourse[];

  const learnerCourses = enrollments
    .map((enrollment) => {
      const course = enrollment.courseId;
      if (!course?.slug || !course.title) return null;
      return {
        title: course.title,
        slug: course.slug,
        progress: enrollment.progress,
        href: `/courses/${course.slug}/learn`,
        courseId: course._id,
      };
    })
    .filter(Boolean) as Array<{
    title: string;
    slug: string;
    progress?: number;
    href: string;
    courseId: unknown;
  }>;

  const searchResults = [];
  for (const course of learnerCourses) {
    const results = await scopedVectorSearch({
      scope: {
        ok: true,
        userId: session.user.id,
        role: "learner",
        courseId: course.courseId as never,
        courseSlug: course.slug,
        allowedAccessKeys: [
          coursePublicKey(course.courseId),
          courseEnrolledKey(course.courseId),
          learnerPrivateKey(course.courseId, session.user.id),
        ],
      },
      query: body.message,
      limit: 3,
    });
    searchResults.push(
      ...results.map((result) => ({
        ...result,
        courseTitle: course.title,
        courseSlug: course.slug,
      }))
    );
  }

  for (const course of educatorCourses) {
    const results = await scopedVectorSearch({
      scope: {
        ok: true,
        userId: session.user.id,
        role: "educator",
        courseId: course._id as never,
        courseSlug: course.slug,
        allowedAccessKeys: [
          coursePublicKey(course._id),
          courseEnrolledKey(course._id),
          courseEducatorsKey(course._id),
        ],
      },
      query: body.message,
      limit: 3,
    });
    searchResults.push(
      ...results.map((result) => ({
        ...result,
        courseTitle: course.title,
        courseSlug: course.slug,
      }))
    );
  }

  const reply = await runGeneralAgent({
    message: body.message,
    messages: body.messages || [],
    context: body.context,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    },
    accessible: {
      learnerCourses: learnerCourses.map((course) => ({
        title: course.title,
        slug: course.slug,
        progress: course.progress,
        href: course.href,
      })),
      educatorCourses: educatorCourses.map((course) => ({
        title: course.title,
        slug: course.slug,
        href: `/educator/courses/${course.slug}/edit`,
        studentsHref: `/educator/courses/${course.slug}/students`,
        assignmentsHref: `/educator/courses/${course.slug}/assignments`,
        paymentsHref: `/educator/courses/${course.slug}/payments`,
      })),
    },
    searchResults: searchResults.slice(0, 10),
  });

  return NextResponse.json({ reply });
}
