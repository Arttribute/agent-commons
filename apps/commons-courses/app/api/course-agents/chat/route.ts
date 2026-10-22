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
import LiveParticipant from "@/models/LiveParticipant";
import { buildLiveLearnerContext } from "@/lib/course-agent-live-context";
import type { CopilotLiveSession } from "@/lib/live-copilot-context";
import { normalizeLiveLearnerCopilotPolicy } from "@/lib/live-copilot-policy";
import type {
  CourseAgentConfig,
  CourseAgentMessage,
  CourseAgentViewContext,
} from "@/types/course-agent";
import type { LearnerProfileData } from "@/types/learner-profile";
import type { LiveLearnerCopilotPolicy } from "@/types/live-session";

type ChatBody = {
  courseSlug?: string;
  agentId?: string;
  role?: "learner" | "educator";
  message?: string;
  messages?: CourseAgentMessage[];
  context?: CourseAgentViewContext;
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

type LiveContextSession = CopilotLiveSession & {
  settings?: { learnerCopilot?: Partial<LiveLearnerCopilotPolicy> };
  access?: string;
  invitedEmails?: string[];
};

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as ChatBody;
  if (
    !body.courseSlug ||
    !body.agentId ||
    typeof body.message !== "string" ||
    !body.message.trim() ||
    !body.context
  ) {
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
  let liveSession: LiveContextSession | null = null;
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
    liveSession = (await LiveSession.findOne({
      _id: body.context.liveSessionId,
      courseSlug: body.courseSlug,
    })
      .select(
        "_id courseId title status pace parts currentActivityId currentPartId activities access invitedEmails settings.learnerCopilot",
      )
      .lean()) as LiveContextSession | null;
    if (!liveSession) {
      return NextResponse.json(
        { error: "Live session not found." },
        { status: 404 },
      );
    }
    if (
      liveSession.status === "draft" ||
      (!ownsCourse &&
        liveSession.access === "invited" &&
        !liveSession.invitedEmails?.includes(
          session.user.email?.trim().toLowerCase() || "",
        )) ||
      !(await LiveParticipant.exists({
        sessionId: liveSession._id,
        userId: session.user.id,
      }))
    ) {
      return NextResponse.json(
        { error: "Open the live room to use its learning copilot." },
        { status: 403 },
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
  const liveContext =
    liveSession && liveCopilotPolicy
      ? await buildLiveLearnerContext({
          session: liveSession,
          userId: session.user.id,
          courseId: String(course._id),
          view: body.context,
          policy: {
            ...liveCopilotPolicy,
            useCourseMaterials:
              liveCopilotPolicy.useCourseMaterials &&
              agent.dataScope !== "course_overview",
          },
        })
      : null;
  const currentActivity = liveContext?.activity as
    | { id: string; title?: string }
    | undefined;
  const currentSlide = liveContext?.slide as { text?: string } | undefined;
  const searchResults =
    liveCopilotPolicy?.useCourseMaterials === false
      ? []
      : await scopedVectorSearch({
          scope: searchScope,
          query: [
            body.message,
            currentActivity?.title,
            currentSlide?.text?.slice(0, 300),
          ]
            .filter(Boolean)
            .join("\n"),
          limit: 5,
        });
  const educatorAnalytics =
    role === "educator"
      ? await buildCourseAnalyticsForAgent(course._id as never)
      : null;
  const agentContext = liveSession
    ? {
        page: "live_session",
        liveSessionId: String(liveSession._id),
        activityId: currentActivity?.id,
        title: currentActivity?.title || liveSession.title,
      }
    : body.context;

  try {
    const reply = await runCourseAgent({
      course,
      courseId: String(course._id),
      actor: {
        userId: session.user.id,
        principalId: session.user.identityUserId,
        workspaceId: session.user.identityWorkspaceId,
      },
      agent,
      role,
      message: body.message,
      messages: body.messages || [],
      context: agentContext,
      liveCopilotPolicy,
      liveContext,
      searchResults,
      learnerProgress,
      learnerProfile,
      educatorAnalytics,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[course-copilot] run failed", error);
    return NextResponse.json(
      {
        error:
          "Your learning copilot could not connect. Sign in with Commons, then retry.",
      },
      { status: 503 },
    );
  }
}
