import { randomUUID } from "crypto";
import { Types } from "mongoose";
import { getAgentCommonsClient } from "@/lib/agent-commons";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import { EDUCATOR_COPILOT_PEDAGOGY, EDUCATOR_COPILOT_SAFETY } from "@/lib/educator-copilot-policy";
import { indexCourseForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Submission from "@/models/Submission";
import type { MaterialExtract } from "@/lib/copilot-materials";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: "learner" | "educator" | "admin";
};

type CopilotMessageInput = {
  role: "user" | "assistant";
  content: string;
};

type CopilotStreamEvent =
  | { type: "status"; content: string }
  | { type: "token"; content: string }
  | { type: "toolStart"; toolName?: string }
  | { type: "toolEnd"; toolName?: string }
  | { type: "error"; message: string };

type ManagedCourse = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  tagline?: string;
  published?: boolean;
  modules?: Array<{
    title: string;
    description?: string;
    lessons?: Array<{
      title: string;
      duration?: string;
      description?: string;
      isFree?: boolean;
    }>;
  }>;
  skillPack?: {
    slug?: string;
    title?: string;
    challenges?: Array<{ id?: string; title?: string; lesson?: string }>;
  };
  skillPacks?: Array<{
    slug?: string;
    title?: string;
    challenges?: Array<{ id?: string; title?: string; lesson?: string }>;
  }>;
};

type StudentSnapshot = {
  userId?: {
    _id?: unknown;
    name?: string;
    email?: string;
  };
  courseId: Types.ObjectId;
  status?: string;
  progress?: number;
  points?: number;
  streak?: number;
  completedChallenges?: string[];
  lastChallengeCompletedAt?: Date;
  enrolledAt?: Date;
};

export async function buildEducatorCopilotContext({
  user,
  pageContext,
  message,
  materials,
}: {
  user: SessionUser;
  pageContext?: EducatorCopilotPageContext;
  message?: string;
  materials?: MaterialExtract[];
}) {
  const filter =
    user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: user.id,
          email: user.email,
          role: user.role,
        });
  const courses = (await Course.find(filter)
    .select(
      "_id title slug tagline published modules skillPack skillPacks updatedAt currency courseType"
    )
    .sort({ updatedAt: -1 })
    .limit(40)
    .lean()) as unknown as ManagedCourse[];
  const courseIds = courses.map((course) => course._id);
  const [enrollmentRows, assignmentRows, submissionRows, studentRows] =
    await Promise.all([
      Enrollment.aggregate([
        { $match: { courseId: { $in: courseIds } } },
        {
          $group: {
            _id: "$courseId",
            students: { $sum: 1 },
            active: {
              $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
            },
            avgProgress: { $avg: "$progress" },
          },
        },
      ]),
      Assignment.aggregate([
        { $match: { courseId: { $in: courseIds } } },
        {
          $group: {
            _id: "$courseId",
            assignments: { $sum: 1 },
            publishedAssignments: {
              $sum: { $cond: [{ $eq: ["$published", true] }, 1, 0] },
            },
          },
        },
      ]),
      Submission.aggregate([
        { $match: { courseId: { $in: courseIds } } },
        {
          $group: {
            _id: "$courseId",
            submissions: { $sum: 1 },
            pendingReviews: {
              $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] },
            },
          },
        },
      ]),
      Enrollment.find({ courseId: { $in: courseIds } })
        .select(
          "courseId userId status progress points streak completedChallenges lastChallengeCompletedAt enrolledAt updatedAt"
        )
        .populate({ path: "userId", select: "name email" })
        .sort({ updatedAt: -1 })
        .limit(120)
        .lean(),
    ]);

  const metricsByCourse = new Map<string, Record<string, number>>();
  for (const row of [...enrollmentRows, ...assignmentRows, ...submissionRows]) {
    const key = String(row._id);
    metricsByCourse.set(key, {
      ...(metricsByCourse.get(key) || {}),
      ...Object.fromEntries(
        Object.entries(row).filter(([name]) => name !== "_id")
      ),
    } as Record<string, number>);
  }

  const currentSlug = extractCourseSlug(pageContext?.path || "");
  const currentCourse = courses.find((course) => course.slug === currentSlug) || null;
  const navigationMap = buildNavigationMap(courses);
  const studentsByCourse = groupStudentSnapshots(
    studentRows as unknown as StudentSnapshot[]
  );

  return {
    educator: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    currentView: pageContext,
    currentCourse: currentCourse
      ? summarizeCourse(currentCourse, metricsByCourse, studentsByCourse)
      : null,
    courses: courses.map((course) =>
      summarizeCourse(course, metricsByCourse, studentsByCourse, true)
    ),
    navigationMap,
    writableActions: [
      "update_course_lesson",
      "update_skill_challenge",
      "navigate",
      "highlight",
    ],
    blockedActions: [
      "publish_course",
      "delete_course",
      "send_email",
      "modify_payment_settings",
      "modify_payout_settings",
      "modify_collaborators",
      "modify_student_records",
      "grade_or_return_submission",
    ],
    query: message,
    uploadedMaterials: (materials || []).map((item) => ({
      name: item.name,
      type: item.type,
      size: item.size,
      textPreview: truncate(item.text, 1600),
    })),
  };
}

export async function generateEducatorCopilotTurn({
  user,
  message,
  messages,
  pageContext,
  actionMode,
  materials,
}: {
  user: SessionUser;
  message: string;
  messages: CopilotMessageInput[];
  pageContext?: EducatorCopilotPageContext;
  actionMode: EducatorCopilotActionMode;
  materials?: MaterialExtract[];
}) {
  const context = await buildEducatorCopilotContext({
    user,
    pageContext,
    message,
    materials,
  });
  const draft =
    (await draftStructuredWithAgentCommons({
      message,
      messages,
      context,
      actionMode,
      materials,
    })) ||
    (await draftWithOpenAI({
      message,
      messages,
      context,
      actionMode,
    }));
  const normalized = normalizeDraft(draft, context, message);
  return normalized;
}

export async function streamEducatorCopilotTurn({
  user,
  message,
  messages,
  pageContext,
  actionMode,
  materials,
  agentFileIds,
  sessionId,
  onEvent,
}: {
  user: SessionUser;
  message: string;
  messages: CopilotMessageInput[];
  pageContext?: EducatorCopilotPageContext;
  actionMode: EducatorCopilotActionMode;
  materials?: MaterialExtract[];
  agentFileIds?: string[];
  sessionId?: string;
  onEvent: (event: CopilotStreamEvent) => void | Promise<void>;
}) {
  const context = await buildEducatorCopilotContext({
    user,
    pageContext,
    message,
    materials,
  });
  const streamedReply = await streamReplyWithAgentCommons({
    user,
    message,
    messages,
    context,
    actionMode,
    materials,
    agentFileIds,
    sessionId,
    onEvent,
  });

  const draft =
    (await draftStructuredWithAgentCommons({
      message,
      messages,
      context,
      actionMode,
      materials,
      streamedReply,
    })) ||
    (await draftWithOpenAI({
      message,
      messages,
      context,
      actionMode,
    }));
  const normalized = normalizeDraft(draft, context, message, streamedReply);
  if (!streamedReply.trim()) {
    await streamText(normalized.reply, onEvent);
  }
  return normalized;
}

export async function applyEducatorCopilotAction({
  user,
  action,
  actionMode,
}: {
  user: SessionUser;
  action: EducatorCopilotAction;
  actionMode: EducatorCopilotActionMode;
}) {
  if (action.type === "navigate" || action.type === "highlight") {
    return {
      ...action,
      status: "applied" as const,
      result: "Client-side action ready.",
    };
  }

  if (action.safety === "sensitive_blocked") {
    return {
      ...action,
      status: "blocked" as const,
      result: "This action is outside the copilot's allowed permissions.",
    };
  }

  if (actionMode !== "auto" && action.status !== "proposed") {
    return action;
  }

  if (action.type === "update_course_lesson") {
    return applyLessonUpdate({ user, action });
  }

  if (action.type === "update_skill_challenge") {
    return applySkillChallengeUpdate({ user, action });
  }

  const unsupportedAction = action as unknown as EducatorCopilotAction;
  return {
    ...unsupportedAction,
    status: "blocked" as const,
    result: "Unsupported action type.",
  };
}

function buildNavigationMap(courses: ManagedCourse[]) {
  const fixed = [
    { label: "Educator dashboard", href: "/educator", page: "educator.dashboard" },
    { label: "Portfolio analytics", href: "/educator/analytics", page: "educator.analytics" },
    { label: "Create with AI", href: "/educator/copilot", page: "educator.copilot.materials" },
    { label: "Educator settings", href: "/educator/settings", page: "educator.settings" },
    { label: "New course", href: "/educator/courses/new", page: "educator.course.new" },
    { label: "Skill badges", href: "/educator/skills", page: "educator.skills" },
  ];
  const courseLinks = courses.flatMap((course) => [
    {
      label: `${course.title} dashboard`,
      href: `/educator/courses/${course.slug}`,
      page: "educator.course.dashboard",
      courseSlug: course.slug,
    },
    {
      label: `${course.title} content`,
      href: `/educator/courses/${course.slug}/content`,
      page: "educator.course.content",
      courseSlug: course.slug,
    },
    {
      label: `${course.title} skill paths`,
      href: `/educator/courses/${course.slug}/skills`,
      page: "educator.course.skills",
      courseSlug: course.slug,
    },
    {
      label: `${course.title} students`,
      href: `/educator/courses/${course.slug}/students`,
      page: "educator.course.students",
      courseSlug: course.slug,
    },
    {
      label: `${course.title} assignments`,
      href: `/educator/courses/${course.slug}/assignments`,
      page: "educator.course.assignments",
      courseSlug: course.slug,
    },
    {
      label: `${course.title} analytics`,
      href: `/educator/courses/${course.slug}/analytics`,
      page: "educator.course.analytics",
      courseSlug: course.slug,
    },
  ]);
  return [...fixed, ...courseLinks];
}

function summarizeCourse(
  course: ManagedCourse,
  metricsByCourse: Map<string, Record<string, number>>,
  studentsByCourse: Map<string, ReturnType<typeof summarizeStudent>[]>,
  compact = false
) {
  const metrics = metricsByCourse.get(String(course._id)) || {};
  const modules = course.modules || [];
  const skillPacks = [
    ...(course.skillPack ? [course.skillPack] : []),
    ...(course.skillPacks || []),
  ].filter(Boolean);
  return {
    title: course.title,
    slug: course.slug,
    tagline: course.tagline,
    published: Boolean(course.published),
    metrics,
    students: (studentsByCourse.get(String(course._id)) || []).slice(
      0,
      compact ? 5 : 20
    ),
    modules: modules.map((module, moduleIndex) => ({
      moduleIndex,
      title: module.title,
      lessons: (module.lessons || []).map((lesson, lessonIndex) => ({
        lessonIndex,
        title: lesson.title,
        duration: lesson.duration,
        description: compact ? undefined : truncate(lesson.description, 500),
        isFree: lesson.isFree,
      })),
    })),
    skillPacks: skillPacks.map((pack) => ({
      slug: pack.slug,
      title: pack.title,
      challenges: (pack.challenges || []).map((challenge) => ({
        id: challenge.id,
        title: challenge.title,
        lesson: compact ? undefined : truncate(challenge.lesson, 500),
      })),
    })),
  };
}

function groupStudentSnapshots(rows: StudentSnapshot[]) {
  const studentsByCourse = new Map<string, ReturnType<typeof summarizeStudent>[]>();
  for (const row of rows) {
    const courseKey = String(row.courseId);
    const current = studentsByCourse.get(courseKey) || [];
    current.push(summarizeStudent(row));
    studentsByCourse.set(courseKey, current);
  }
  return studentsByCourse;
}

function summarizeStudent(row: StudentSnapshot) {
  const learner =
    row.userId && typeof row.userId === "object" && "name" in row.userId
      ? row.userId
      : {};
  return {
    id: row.userId?._id ? String(row.userId._id) : undefined,
    name: learner.name,
    email: learner.email,
    status: row.status,
    progress: row.progress,
    points: row.points,
    streak: row.streak,
    completedChallengeCount: row.completedChallenges?.length || 0,
    lastChallengeCompletedAt: row.lastChallengeCompletedAt,
    enrolledAt: row.enrolledAt,
  };
}

async function streamReplyWithAgentCommons({
  user,
  message,
  messages,
  context,
  actionMode,
  materials,
  agentFileIds,
  sessionId,
  onEvent,
}: {
  user: SessionUser;
  message: string;
  messages: CopilotMessageInput[];
  context: unknown;
  actionMode: EducatorCopilotActionMode;
  materials?: MaterialExtract[];
  agentFileIds?: string[];
  sessionId?: string;
  onEvent: (event: CopilotStreamEvent) => void | Promise<void>;
}) {
  const client = getAgentCommonsClient();
  const agentId = process.env.EDUCATOR_COPILOT_AGENT_ID;
  if (!client || !agentId) return "";

  let reply = "";
  try {
    await onEvent({ type: "status", content: "Starting copilot session" });
    for await (const event of client.agents.stream({
      agentId,
      sessionId,
      initiatorId: user.id,
      attachments: (agentFileIds || []).map((fileId) => ({ fileId })),
      messages: [
        {
          role: "system",
          content: buildStreamingSystemPrompt(actionMode),
        },
        {
          role: "user",
          content: buildAgentCommonsUserContent({
            message,
            messages,
            context,
            materials,
          }) as never,
        },
      ],
    } as never)) {
      if (event.type === "token" && event.content) {
        reply += event.content;
        await onEvent({ type: "token", content: event.content });
      } else if (event.type === "toolStart") {
        await onEvent({
          type: "toolStart",
          toolName: event.toolName || (event as { tool?: string }).tool,
        });
      } else if (event.type === "toolEnd") {
        await onEvent({
          type: "toolEnd",
          toolName: event.toolName || (event as { tool?: string }).tool,
        });
      } else if (event.type === "status") {
        await onEvent({
          type: "status",
          content:
            (event as { status?: string }).status ||
            event.content ||
            event.message ||
            "Working...",
        });
      } else if (event.type === "final") {
        const finalText = extractFinalText(event);
        if (finalText && !reply.trim()) {
          reply = finalText;
          await onEvent({ type: "token", content: finalText });
        }
      } else if (event.type === "error") {
        await onEvent({
          type: "error",
          message: event.content || "The Agent Commons run failed.",
        });
      }
    }
  } catch {
    return "";
  }
  return reply.trim();
}

async function draftStructuredWithAgentCommons({
  message,
  messages,
  context,
  actionMode,
  materials,
  streamedReply,
}: {
  message: string;
  messages: CopilotMessageInput[];
  context: unknown;
  actionMode: EducatorCopilotActionMode;
  materials?: MaterialExtract[];
  streamedReply?: string;
}) {
  const client = getAgentCommonsClient();
  const agentId = process.env.EDUCATOR_COPILOT_AGENT_ID;
  if (!client || !agentId) return null;

  try {
    const result = await client.run.once({
      agentId,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(actionMode),
        },
        {
          role: "user",
          content: JSON.stringify({
            educatorContext: context,
            recentMessages: messages.slice(-10),
            currentMessage: message,
            streamedReply,
            uploadedMaterials: summarizeMaterialsForModel(materials),
            outputShape: {
              reply: "string",
              actions:
                "optional array of navigate, highlight, update_course_lesson, or update_skill_challenge actions",
              sessionTitle: "optional short title",
            },
          }),
        },
      ],
    });
    const text = extractText(result);
    return JSON.parse(text || "{}") as unknown;
  } catch {
    return null;
  }
}

function buildAgentCommonsUserContent({
  message,
  messages,
  context,
  materials,
}: {
  message: string;
  messages: CopilotMessageInput[];
  context: unknown;
  materials?: MaterialExtract[];
}) {
  const imageParts = (materials || [])
    .filter((item) => item.imageDataUrl)
    .slice(0, 4)
    .map((item) => ({
      type: "image_url" as const,
      image_url: { url: item.imageDataUrl || "" },
    }));

  const text = JSON.stringify({
    educatorContext: context,
    recentMessages: messages.slice(-10),
    currentMessage: message,
    uploadedMaterials: summarizeMaterialsForModel(materials),
  });

  return imageParts.length
    ? [{ type: "text" as const, text }, ...imageParts]
    : text;
}

function summarizeMaterialsForModel(materials?: MaterialExtract[]) {
  return (materials || []).map((item) => ({
    name: item.name,
    type: item.type,
    size: item.size,
    text: truncate(item.text, 12000),
  }));
}

async function streamText(
  text: string,
  onEvent: (event: CopilotStreamEvent) => void | Promise<void>
) {
  const chunks = text.match(/.{1,80}(\s|$)/g) || [text];
  for (const chunk of chunks) {
    await onEvent({ type: "token", content: chunk });
  }
}

function extractFinalText(event: unknown) {
  const record = event && typeof event === "object" ? (event as Record<string, unknown>) : {};
  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : {};
  return (
    cleanString(record.content) ||
    cleanString(payload.content) ||
    cleanString(payload.text) ||
    cleanString(payload.message) ||
    ""
  );
}

function extractText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["content", "message", "text", "output", "response", "final"]) {
      const text = extractText(record[key]);
      if (text) return text;
    }
  }
  return "";
}

async function draftWithOpenAI({
  message,
  messages,
  context,
  actionMode,
}: {
  message: string;
  messages: CopilotMessageInput[];
  context: unknown;
  actionMode: EducatorCopilotActionMode;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.EDUCATOR_COPILOT_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(actionMode),
          },
          {
            role: "user",
            content: JSON.stringify({
              educatorContext: context,
              recentMessages: messages.slice(-10),
              currentMessage: message,
              outputShape: {
                reply: "string",
                actions:
                  "optional array of navigate, highlight, update_course_lesson, or update_skill_challenge actions",
                sessionTitle: "optional short title",
              },
            }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return JSON.parse(payload.choices?.[0]?.message?.content || "{}") as unknown;
  } catch {
    return null;
  }
}

function buildSystemPrompt(actionMode: EducatorCopilotActionMode) {
  return [
    "You are the CommonLab educator copilot.",
    "You are embedded across the educator console. Use the supplied educatorContext, currentView, navigationMap, courses, materials, and student/course summaries.",
    "Be concrete, organized, and concise. Prefer short sections and direct next actions.",
    "Never answer a concrete question with a generic capability statement. If the educator asks how many students they have, calculate from context. If they ask which courses they have, list the courses. If they ask to open a course, return a navigate action. If they ask to edit a course, identify the course and navigate them to the strongest editing view.",
    "Handle typos and casual phrasing. Match course names fuzzily against the supplied course list.",
    "You can help create and edit course material, improve lessons, inspect course structure, navigate the educator UI, and explain analytics or student/course summaries that are present in context.",
    "When a user asks to go somewhere, return a navigate action with an href from the navigationMap.",
    "When a user asks where something is on the page, use currentView.uiMap selectors for highlight actions when possible.",
    "When editing a course lesson, return update_course_lesson with courseSlug, moduleIndex, lessonIndex, and a patch. For skill paths, return update_skill_challenge.",
    `Current action mode: ${actionMode}. In manual mode, actions are proposals. In auto mode, only client_safe and content_write actions that pass safety checks may be applied.`,
    EDUCATOR_COPILOT_PEDAGOGY,
    EDUCATOR_COPILOT_SAFETY,
    "Return only JSON. Do not include markdown fences.",
  ].join("\n\n");
}

function buildStreamingSystemPrompt(actionMode: EducatorCopilotActionMode) {
  return [
    "You are the CommonLab educator copilot, embedded in the educator side panel.",
    "Respond naturally and professionally. Do not expose raw JSON.",
    "Use uploaded files, current page context, course context, learner summaries, and recent messages when relevant.",
    "Never answer a concrete question with a generic capability statement. If the educator asks how many students they have, calculate from context. If they ask which courses they have, list them. If they ask to open or edit a course, identify the course and say what you are doing.",
    "When files are attached, read them closely and synthesize what is useful for the educator's current request.",
    "You may suggest edits, navigation, and page guidance in normal language. The app will turn safe actions into action cards separately.",
    `Current action mode: ${actionMode}. Sensitive operations remain blocked even in auto mode.`,
    EDUCATOR_COPILOT_PEDAGOGY,
    EDUCATOR_COPILOT_SAFETY,
  ].join("\n\n");
}

function normalizeDraft(
  draft: unknown,
  context: unknown,
  message: string,
  streamedReply?: string
) {
  const record = draft && typeof draft === "object" ? (draft as Record<string, unknown>) : {};
  const deterministicReply = fallbackReply(context, message);
  const modelReply =
    typeof record.reply === "string" && record.reply.trim()
      ? record.reply.trim()
      : streamedReply?.trim() || "";
  const reply =
    modelReply && !shouldReplaceGenericReply(modelReply, message)
      ? modelReply
      : deterministicReply;
  const normalizedActions = Array.isArray(record.actions)
    ? record.actions.map(normalizeAction).filter(Boolean)
    : [];
  const actions = normalizedActions.length
    ? normalizedActions
    : fallbackActions(context, message);
  const sessionTitle =
    typeof record.sessionTitle === "string" && record.sessionTitle.trim()
      ? record.sessionTitle.trim().slice(0, 80)
      : summarizeSessionTitle(message);
  return { reply, actions: actions as EducatorCopilotAction[], sessionTitle };
}

function shouldReplaceGenericReply(reply: string, message: string) {
  const text = normalizeForMatch(message);
  const answer = normalizeForMatch(reply);
  const isConcrete =
    isStudentCountQuestion(text) ||
    isCourseListQuestion(text) ||
    isOpenRequest(text) ||
    isEditRequest(text);
  if (!isConcrete) return false;
  return (
    answer.includes("i can help with") ||
    answer.includes("i can help edit") ||
    answer.includes("tell me which course") ||
    answer.includes("i can see") ||
    answer.includes("available in your context")
  );
}

function normalizeAction(input: unknown): EducatorCopilotAction | null {
  if (!input || typeof input !== "object") return null;
  const action = input as Record<string, unknown>;
  const type = String(action.type || "");
  const label = cleanString(action.label) || defaultActionLabel(type);
  const reason = cleanString(action.reason);

  if (type === "navigate") {
    const href = cleanString(action.href);
    if (!href || !href.startsWith("/educator")) return null;
    return {
      id: cleanString(action.id) || randomUUID(),
      type,
      label,
      href,
      reason,
      status: "proposed",
      safety: "client_safe",
    };
  }

  if (type === "highlight") {
    const selector = cleanString(action.selector);
    if (!selector) return null;
    return {
      id: cleanString(action.id) || randomUUID(),
      type,
      label,
      selector,
      reason,
      status: "proposed",
      safety: "client_safe",
    };
  }

  if (type === "update_course_lesson") {
    const patch = sanitizeLessonPatch(action.patch);
    const moduleIndex = toNonNegativeInteger(action.moduleIndex);
    const lessonIndex = toNonNegativeInteger(action.lessonIndex);
    const courseSlug = cleanString(action.courseSlug);
    if (!courseSlug || moduleIndex === null || lessonIndex === null || !Object.keys(patch).length) {
      return null;
    }
    return {
      id: cleanString(action.id) || randomUUID(),
      type,
      label,
      courseSlug,
      moduleIndex,
      lessonIndex,
      patch,
      preview: cleanString(action.preview),
      reason,
      status: "proposed",
      safety: "content_write",
    };
  }

  if (type === "update_skill_challenge") {
    const patch = sanitizeSkillChallengePatch(action.patch);
    const courseSlug = cleanString(action.courseSlug);
    const challengeId = cleanString(action.challengeId);
    if (!courseSlug || !challengeId || !Object.keys(patch).length) return null;
    return {
      id: cleanString(action.id) || randomUUID(),
      type,
      label,
      courseSlug,
      skillPackSlug: cleanString(action.skillPackSlug),
      challengeId,
      patch,
      preview: cleanString(action.preview),
      reason,
      status: "proposed",
      safety: "content_write",
    };
  }

  return null;
}

async function applyLessonUpdate({
  user,
  action,
}: {
  user: SessionUser;
  action: Extract<EducatorCopilotAction, { type: "update_course_lesson" }>;
}) {
  const course = await findManagedCourse(user, action.courseSlug);
  if (!course) {
    return { ...action, status: "failed" as const, result: "Course not found." };
  }
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const courseModule = modules[action.moduleIndex];
  const lesson = courseModule?.lessons?.[action.lessonIndex];
  if (!lesson) {
    return { ...action, status: "failed" as const, result: "Lesson not found." };
  }

  Object.assign(lesson, action.patch);
  course.modules = modules;
  course.lessonsCount = modules.reduce(
    (sum: number, item: { lessons?: unknown[] }) => sum + (item.lessons?.length || 0),
    0
  );
  course.modulesCount = modules.length;
  await course.save();
  await indexCourseForSearch(course);
  return {
    ...action,
    status: "applied" as const,
    result: `Updated "${lesson.title}".`,
  };
}

async function applySkillChallengeUpdate({
  user,
  action,
}: {
  user: SessionUser;
  action: Extract<EducatorCopilotAction, { type: "update_skill_challenge" }>;
}) {
  const course = await findManagedCourse(user, action.courseSlug);
  if (!course) {
    return { ...action, status: "failed" as const, result: "Course not found." };
  }
  const packs = [
    ...(course.skillPack ? [course.skillPack] : []),
    ...((course.skillPacks as unknown[]) || []),
  ].filter(Boolean) as Array<{
    slug?: string;
    challenges?: Array<{ id?: string; [key: string]: unknown }>;
  }>;
  const pack =
    packs.find((item) => item.slug === action.skillPackSlug) ||
    packs.find((item) =>
      item.challenges?.some((challenge) => challenge.id === action.challengeId)
    );
  const challenge = pack?.challenges?.find(
    (item) => item.id === action.challengeId
  );
  if (!pack || !challenge) {
    return { ...action, status: "failed" as const, result: "Challenge not found." };
  }
  Object.assign(challenge, action.patch);
  await course.save();
  await indexCourseForSearch(course);
  return {
    ...action,
    status: "applied" as const,
    result: `Updated "${challenge.title || action.challengeId}".`,
  };
}

async function findManagedCourse(user: SessionUser, slug: string) {
  const filter =
    user.role === "admin"
      ? { slug }
      : {
          slug,
          ...buildManagedCoursesFilter({
            userId: user.id,
            email: user.email,
            role: user.role,
          }),
        };
  return Course.findOne(filter);
}

function fallbackReply(context: unknown, message: string) {
  const text = normalizeForMatch(message);
  const ctx = context as CopilotContextView;
  const courses = ctx.courses || [];
  const courseMatch = findCourseMatch(message, courses);
  const totalStudents = courses.reduce(
    (sum, course) => sum + Number(course.metrics?.students || 0),
    0
  );

  if (isStudentCountQuestion(text)) {
    if (!courses.length) return "You do not have any managed courses in this workspace yet.";
    const courseLines = courses.map(
      (course) => `${course.title}: ${Number(course.metrics?.students || 0)} students`
    );
    return [`You have ${totalStudents} students across ${courses.length} courses.`, ...courseLines]
      .join("\n");
  }

  if (isCourseListQuestion(text)) {
    if (!courses.length) return "You do not have any managed courses yet.";
    return [
      `You have ${courses.length} managed courses:`,
      ...courses.map((course) => {
        const students = Number(course.metrics?.students || 0);
        const status = course.published ? "published" : "draft";
        return `${course.title} (${status}, ${students} students)`;
      }),
    ].join("\n");
  }

  if (isOpenRequest(text) && courseMatch) {
    return `Opening ${courseMatch.title}.`;
  }

  if (isEditRequest(text)) {
    if (courseMatch) {
      return [
        `I found ${courseMatch.title}.`,
        "I can help edit its lessons and skill challenges from the course content view.",
      ].join(" ");
    }
    if (ctx.currentCourse?.title) {
      return `I can help edit ${ctx.currentCourse.title}. Tell me the lesson or skill challenge you want to change, or describe the change you want.`;
    }
    return [
      "Which course should we edit?",
      courses.length ? `I can see: ${courses.map((course) => course.title).join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (ctx.uploadedMaterials?.length) {
    const names = ctx.uploadedMaterials.map((item) => item.name).join(", ");
    return `I read the attached material: ${names}. Tell me whether you want a summary, lesson edits, quiz improvements, or a new skill path draft from it.`;
  }

  if (courseMatch) {
    return [
      `${courseMatch.title} is one of your managed courses.`,
      `${Number(courseMatch.metrics?.students || 0)} students are enrolled.`,
      courseMatch.modules?.length
        ? `It has ${courseMatch.modules.length} module(s).`
        : "It does not have modules in the current context.",
    ].join(" ");
  }

  return courses.length
    ? `I can see ${courses.length} managed courses: ${courses
        .map((course) => course.title)
        .join(", ")}.`
    : "I do not see any managed courses in your educator context yet.";
}

function fallbackActions(context: unknown, message: string): EducatorCopilotAction[] {
  const text = normalizeForMatch(message);
  const ctx = context as CopilotContextView;
  const courses = ctx.courses || [];
  const courseMatch = findCourseMatch(message, courses);
  if (!courseMatch) return [];

  if (isOpenRequest(text)) {
    return [
      {
        id: randomUUID(),
        type: "navigate",
        label: `Open ${courseMatch.title}`,
        href: `/educator/courses/${courseMatch.slug}`,
        reason: "The educator asked to open this course.",
        status: "proposed",
        safety: "client_safe",
      },
    ];
  }

  if (isEditRequest(text)) {
    return [
      {
        id: randomUUID(),
        type: "navigate",
        label: `Edit ${courseMatch.title}`,
        href: `/educator/courses/${courseMatch.slug}/content`,
        reason: "The educator asked to edit this course.",
        status: "proposed",
        safety: "client_safe",
      },
    ];
  }

  return [];
}

type CopilotContextView = {
  currentCourse?: CopilotCourseView | null;
  courses?: CopilotCourseView[];
  uploadedMaterials?: Array<{ name: string }>;
};

type CopilotCourseView = {
  title: string;
  slug: string;
  published?: boolean;
  metrics?: Record<string, number>;
  modules?: Array<{ title: string }>;
};

function isStudentCountQuestion(text: string) {
  return (
    /\bhow many\b/.test(text) &&
    /\b(student|students|stident|stidents|learner|learners)\b/.test(text)
  );
}

function isCourseListQuestion(text: string) {
  return (
    /\b(what|which|list|show)\b/.test(text) &&
    /\b(course|courses)\b/.test(text)
  );
}

function isOpenRequest(text: string) {
  return /\b(open|go to|take me|show me|view)\b/.test(text);
}

function isEditRequest(text: string) {
  return /\b(edit|revise|improve|update|change|fix)\b/.test(text);
}

function findCourseMatch(message: string, courses: CopilotCourseView[]) {
  const query = normalizeForMatch(message)
    .replace(/\b(open|go to|take me|show me|view|edit|revise|improve|update|change|fix|course|couse|the|up)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query) return null;
  let best: { course: CopilotCourseView; score: number } | null = null;
  for (const course of courses) {
    const title = normalizeForMatch(course.title);
    const slug = normalizeForMatch(course.slug.replace(/-/g, " "));
    const score = Math.max(matchScore(query, title), matchScore(query, slug));
    if (!best || score > best.score) best = { course, score };
  }
  return best && best.score >= 0.38 ? best.course : null;
}

function matchScore(query: string, target: string) {
  if (!query || !target) return 0;
  if (target.includes(query) || query.includes(target)) return 1;
  const queryTerms = new Set(query.split(/\s+/).filter((term) => term.length > 1));
  const targetTerms = new Set(target.split(/\s+/).filter((term) => term.length > 1));
  if (!queryTerms.size || !targetTerms.size) return 0;
  let hits = 0;
  for (const term of queryTerms) {
    for (const targetTerm of targetTerms) {
      if (
        targetTerm === term ||
        targetTerm.includes(term) ||
        term.includes(targetTerm) ||
        levenshtein(term, targetTerm) <= 2
      ) {
        hits += 1;
        break;
      }
    }
  }
  return hits / Math.max(queryTerms.size, targetTerms.size);
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bai\b/g, "ai")
    .trim();
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let index = 1; index <= b.length; index += 1) matrix[0][index] = index;
  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      matrix[row][col] =
        a[row - 1] === b[col - 1]
          ? matrix[row - 1][col - 1]
          : Math.min(
              matrix[row - 1][col - 1] + 1,
              matrix[row][col - 1] + 1,
              matrix[row - 1][col] + 1
            );
    }
  }
  return matrix[a.length][b.length];
}

function extractCourseSlug(path: string) {
  const match = path.match(/\/educator\/courses\/([^/?#]+)/);
  return match?.[1] || null;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function truncate(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function toNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const next = Math.floor(value);
  return next >= 0 ? next : null;
}

function sanitizeLessonPatch(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "duration", "description", "assetUrl", "assetAlt"]) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  if (typeof input.isFree === "boolean") patch.isFree = input.isFree;
  return patch as Extract<EducatorCopilotAction, { type: "update_course_lesson" }>["patch"];
}

function sanitizeSkillChallengePatch(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "shortTitle", "hook", "lesson", "microTask"]) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  if (Array.isArray(input.keyIdeas)) {
    patch.keyIdeas = input.keyIdeas.map(cleanString).filter(Boolean).slice(0, 5);
  }
  return patch as Extract<EducatorCopilotAction, { type: "update_skill_challenge" }>["patch"];
}

function defaultActionLabel(type: string) {
  switch (type) {
    case "navigate":
      return "Open page";
    case "highlight":
      return "Highlight on page";
    case "update_course_lesson":
      return "Update lesson";
    case "update_skill_challenge":
      return "Update skill challenge";
    default:
      return "Review action";
  }
}

function summarizeSessionTitle(message: string) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 50 ? `${cleaned.slice(0, 50)}...` : cleaned || "Copilot session";
}
