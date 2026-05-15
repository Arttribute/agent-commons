import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { defaultCourseAgents } from "@/lib/course-agent-defaults";
import { connectDB } from "@/lib/db";
import { buildSearchScope } from "@/lib/search-access";
import {
  findRunnableCourseAgent,
  runCourseAgent,
  type RuntimeCourse,
} from "@/lib/course-agent-runtime";
import { scopedVectorSearch } from "@/lib/vector-search";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { CourseAgentConfig, CourseAgentMessage } from "@/types/course-agent";

type ChatBody = {
  courseSlug?: string;
  agentId?: string;
  role?: "learner" | "educator";
  message?: string;
  messages?: CourseAgentMessage[];
  context?: {
    page: string;
    title?: string;
    moduleIndex?: number;
    lessonIndex?: number;
    visibleText?: string;
  };
};

type CourseAgentDocument = RuntimeCourse & {
  _id: unknown;
  slug: string;
  published: boolean;
  educator?: { userId?: { toString: () => string } | string };
};

type LearnerProgress = {
  completedLessons?: string[];
  progress?: number;
  accessLevel?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as ChatBody;
  if (!body.courseSlug || !body.agentId || !body.message || !body.context) {
    return NextResponse.json(
      { error: "courseSlug, agentId, message, and context are required." },
      { status: 400 }
    );
  }

  const requestedRole = body.role || "learner";
  const sessionRole = session.user.role || "learner";
  const role =
    requestedRole === "educator" &&
    (sessionRole === "educator" || sessionRole === "admin")
      ? "educator"
      : "learner";

  await connectDB();
  const course = (await Course.findOne({
    slug: body.courseSlug,
  }).lean()) as CourseAgentDocument | null;
  if (!course) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  if (role === "learner" && !course.published) {
    return NextResponse.json({ error: "Course not found." }, { status: 404 });
  }

  const ownsCourse =
    course.educator?.userId?.toString() === session.user.id ||
    sessionRole === "admin";
  if (role === "educator" && !ownsCourse) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const agents =
    course.agents && course.agents.length > 0
      ? (course.agents as CourseAgentConfig[])
      : defaultCourseAgents;
  const agent = findRunnableCourseAgent(agents, body.agentId, role);
  if (!agent) {
    return NextResponse.json(
      { error: "This agent is not available in this context." },
      { status: 403 }
    );
  }

  const searchScope = await buildSearchScope({ courseSlug: body.courseSlug, role });
  if (!searchScope.ok) return searchScope.error;

  const learnerProgress =
    role === "learner"
      ? ((await Enrollment.findOne({
          userId: session.user.id,
          courseId: course._id,
        })
          .select("completedLessons progress accessLevel")
          .lean()) as LearnerProgress | null)
      : null;
  const searchResults = await scopedVectorSearch({
    scope: searchScope,
    query: body.message,
    limit: 5,
  });

  const reply = await runCourseAgent({
    course,
    agent,
    role,
    message: body.message,
    messages: body.messages || [],
    context: body.context,
    searchResults,
    learnerProgress,
  });

  return NextResponse.json({ reply });
}
