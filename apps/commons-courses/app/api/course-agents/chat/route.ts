import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/lib/auth";
import { defaultCourseAgents } from "@/lib/course-agent-defaults";
import { connectDB } from "@/lib/db";
import { buildSearchScope } from "@/lib/search-access";
import { buildCourseAnalyticsForAgent } from "@/lib/analytics";
import {
  findRunnableCourseAgent,
  runCourseAgent,
  type RuntimeCourse,
} from "@/lib/course-agent-runtime";
import { scopedVectorSearch } from "@/lib/vector-search";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import LearnerProfile from "@/models/LearnerProfile";
import LiveSession from "@/models/LiveSession";
import { normalizeLiveLearnerCopilotPolicy } from "@/lib/live-copilot-policy";
import type {
  CourseAgentConfig,
  CourseAgentMessage,
} from "@/types/course-agent";
import type { LearnerProfileData } from "@/types/learner-profile";
import type { LiveLearnerCopilotPolicy } from "@/types/live-session";

type ChatBody = {
  courseSlug?: string;
  agentId?: string;
  role?: "learner" | "educator";
  message?: string;
  messages?: CourseAgentMessage[];
  context?: {
    page: string;
    liveSessionId?: string;
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
      { status: 400 },
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

  let liveCopilotPolicy = null;
  if (role === "learner" && body.context.page === "live_session") {
    if (
      !body.context.liveSessionId ||
      !Types.ObjectId.isValid(body.context.liveSessionId)
    ) {
      return NextResponse.json(
        { error: "A valid live session is required for copilot access." },
        { status: 403 },
      );
    }
    const liveSession = (await LiveSession.findOne({
      _id: body.context.liveSessionId,
      courseSlug: body.courseSlug,
    })
      .select("settings.learnerCopilot")
      .lean()) as {
      settings?: { learnerCopilot?: Partial<LiveLearnerCopilotPolicy> };
    } | null;
    if (!liveSession) {
      return NextResponse.json(
        { error: "Live session not found." },
        { status: 404 },
      );
    }
    liveCopilotPolicy = normalizeLiveLearnerCopilotPolicy(
      liveSession.settings?.learnerCopilot,
    );
  }
  if (liveCopilotPolicy && !liveCopilotPolicy.enabled) {
    return NextResponse.json(
      { error: "The learner copilot is disabled for this live session." },
      { status: 403 },
    );
  }

  const agents =
    course.agents && course.agents.length > 0
      ? (course.agents as CourseAgentConfig[])
      : defaultCourseAgents;
  const agent = findRunnableCourseAgent(agents, body.agentId, role);
  if (!agent) {
    return NextResponse.json(
      { error: "This agent is not available in this context." },
      { status: 403 },
    );
  }

  const searchScope = await buildSearchScope({
    courseSlug: body.courseSlug,
    role,
  });
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
  const learnerProfile =
    role === "learner"
      ? ((await LearnerProfile.findOne({ userId: session.user.id })
          .select(
            "personalizationEnabled roleOrContext domain interests goals preferredFormats guidanceStyle customContext allowUsageLearning usageSignals",
          )
          .lean()) as Partial<LearnerProfileData> | null)
      : null;
  const searchResults =
    liveCopilotPolicy?.useCourseMaterials === false
      ? []
      : await scopedVectorSearch({
          scope: searchScope,
          query: body.message,
          limit: 5,
        });
  const educatorAnalytics =
    role === "educator"
      ? await buildCourseAnalyticsForAgent(course._id as never)
      : null;
  const agentContext =
    liveCopilotPolicy?.explainCurrentActivity === false
      ? { ...body.context, visibleText: undefined }
      : body.context;

  const reply = await runCourseAgent({
    course,
    agent,
    role,
    message: body.message,
    messages: body.messages || [],
    context: agentContext,
    liveCopilotPolicy,
    searchResults,
    learnerProgress,
    learnerProfile,
    educatorAnalytics,
  });

  return NextResponse.json({ reply });
}
