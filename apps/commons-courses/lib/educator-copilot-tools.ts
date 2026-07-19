import { randomUUID } from "crypto";
import { Types } from "mongoose";
import type { CommonsClient } from "@agent-commons/sdk";
import type { CopilotUser } from "@/lib/educator-copilot-agent";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import { indexCourseForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import Submission from "@/models/Submission";
import type { IEducatorCopilotMaterial } from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotLessonDraft,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";

/** JSON-schema tool catalog handed to the agent run as cliTools. */
export type CopilotToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type CopilotToolContext = {
  user: CopilotUser;
  actionMode: EducatorCopilotActionMode;
  pageContext?: EducatorCopilotPageContext;
  materials: IEducatorCopilotMaterial[];
  client: CommonsClient | null;
  agentId?: string;
  agentSessionId?: string;
  /** Collects proposed/applied actions so the chat route can attach them to the reply. */
  recordAction: (action: EducatorCopilotAction) => void;
};

const lessonPatchProperties = {
  title: { type: "string" },
  duration: { type: "string", description: 'e.g. "12 min"' },
  description: {
    type: "string",
    description: "Full lesson body in markdown. Write complete content, not placeholders.",
  },
  assetUrl: { type: "string" },
  assetAlt: { type: "string" },
  isFree: { type: "boolean" },
};

export const educatorCopilotToolCatalog: CopilotToolDefinition[] = [
  {
    name: "list_courses",
    description:
      "List every course this educator manages, with status, enrollment counts, progress, and structure size. Use this to resolve course names the educator mentions.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_course",
    description:
      "Get one course in detail: overview, modules with lessons, skill packs with challenges, and headline metrics. Always call this before editing so indexes are correct.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string", description: "Course slug from list_courses" },
        detail: {
          type: "string",
          enum: ["structure", "full"],
          description:
            '"structure" (default) returns trimmed lesson/challenge text; "full" returns complete content for close editing.',
        },
      },
      required: ["courseSlug"],
    },
  },
  {
    name: "list_students",
    description:
      "List enrolled students. Scope to one course with courseSlug, or omit it for a per-course breakdown across all managed courses (with totals).",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        limit: { type: "number", description: "Max students per course (default 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_student",
    description:
      "Look up one student by email or name across the educator's courses: enrollments, progress, points, streaks, and submissions.",
    parameters: {
      type: "object",
      properties: {
        student: { type: "string", description: "Email address or (partial) name" },
        courseSlug: { type: "string", description: "Optional: restrict to one course" },
      },
      required: ["student"],
    },
  },
  {
    name: "get_course_analytics",
    description:
      "Aggregated analytics: enrollment status mix, average progress, assignment and submission counts, pending reviews, and recent enrollment momentum. Omit courseSlug for portfolio-wide numbers.",
    parameters: {
      type: "object",
      properties: { courseSlug: { type: "string" } },
      required: [],
    },
  },
  {
    name: "list_assignments",
    description:
      "List assignments across managed courses, including due dates, publication state, submission totals, and pending reviews. Scope with courseSlug when needed.",
    parameters: {
      type: "object",
      properties: { courseSlug: { type: "string" } },
      required: [],
    },
  },
  {
    name: "read_attachment",
    description:
      "Read the full extracted text of a file the educator uploaded in this chat session. Use whenever the educator refers to an uploaded file.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "File name (or part of it). Defaults to the most recent upload." },
        offset: { type: "number", description: "Character offset to continue reading from (default 0)" },
      },
      required: [],
    },
  },
  {
    name: "update_lesson",
    description:
      "Revise an existing lesson (title, duration, body, media, free flag). In manual mode this queues a proposal for the educator to approve; in auto mode it applies immediately.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        moduleIndex: { type: "number" },
        lessonIndex: { type: "number" },
        patch: { type: "object", properties: lessonPatchProperties },
        reason: { type: "string", description: "One line: why this change helps" },
      },
      required: ["courseSlug", "moduleIndex", "lessonIndex", "patch"],
    },
  },
  {
    name: "add_lesson",
    description: "Add a new lesson to an existing module.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        moduleIndex: { type: "number" },
        lesson: {
          type: "object",
          properties: lessonPatchProperties,
          required: ["title", "description"],
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "moduleIndex", "lesson"],
    },
  },
  {
    name: "add_module",
    description:
      "Add a whole new module with its lessons — the building block for creating course content (e.g. from an uploaded document). Propose one module per call so the educator can review each.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        module: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            assignment: { type: "string" },
            lessons: {
              type: "array",
              items: {
                type: "object",
                properties: lessonPatchProperties,
                required: ["title", "description"],
              },
            },
          },
          required: ["title", "lessons"],
        },
        position: { type: "number", description: "Insert index (default: append at end)" },
        reason: { type: "string" },
      },
      required: ["courseSlug", "module"],
    },
  },
  {
    name: "update_module",
    description: "Revise a module's title, description, or assignment brief.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        moduleIndex: { type: "number" },
        patch: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            assignment: { type: "string" },
          },
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "moduleIndex", "patch"],
    },
  },
  {
    name: "update_course_overview",
    description:
      "Revise course marketing/overview copy: tagline, description, long description, level, duration label, tags. Never touches pricing or publish state.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        patch: {
          type: "object",
          properties: {
            tagline: { type: "string" },
            description: { type: "string" },
            longDescription: { type: "string" },
            level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
            duration: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "patch"],
    },
  },
  {
    name: "update_skill_challenge",
    description: "Revise a skill-path challenge (hook, lesson body, key ideas, micro task).",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        challengeId: { type: "string" },
        skillPackSlug: { type: "string" },
        patch: {
          type: "object",
          properties: {
            title: { type: "string" },
            shortTitle: { type: "string" },
            hook: { type: "string" },
            lesson: { type: "string", description: "Full challenge lesson body in markdown" },
            keyIdeas: { type: "array", items: { type: "string" } },
            microTask: { type: "string" },
          },
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "challengeId", "patch"],
    },
  },
  {
    name: "navigate",
    description:
      "Take the educator to a page in the educator console (or a public course/skill page). Use hrefs from the workspace snapshot's navigation map.",
    parameters: {
      type: "object",
      properties: {
        href: { type: "string", description: 'e.g. "/educator/courses/my-course/content"' },
        label: { type: "string", description: 'Short button label, e.g. "Open course content"' },
        reason: { type: "string" },
      },
      required: ["href"],
    },
  },
  {
    name: "highlight",
    description:
      "Point at an element on the educator's current page (scrolls to it and outlines it). Pass the visible label of a UI target from the snapshot's uiMap, or an exact CSS selector.",
    parameters: {
      type: "object",
      properties: {
        target: { type: "string", description: "Visible label of the element (preferred)" },
        selector: { type: "string", description: "Exact CSS selector (alternative)" },
        reason: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "remember",
    description:
      "Save a durable fact or preference about this educator (style, tone, structure preferences, recurring context) to copilot memory so future sessions honor it.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The fact/preference, written to be useful later" },
        kind: {
          type: "string",
          enum: ["semantic", "episodic", "procedural"],
          description: "semantic = fact/preference (default), episodic = event, procedural = how-to",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "recall_memories",
    description: "Search the copilot's saved memories about this educator.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
];

/**
 * Execute one tool call locally (inside commons-courses, with the educator's
 * own authorization). Returns a JSON string handed back to the model.
 */
export async function executeEducatorCopilotTool(
  ctx: CopilotToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const result = await runTool(ctx, name, args || {});
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Tool execution failed.",
    });
  }
}

async function runTool(
  ctx: CopilotToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "list_courses":
      return toolListCourses(ctx);
    case "get_course":
      return toolGetCourse(ctx, args);
    case "list_students":
      return toolListStudents(ctx, args);
    case "get_student":
      return toolGetStudent(ctx, args);
    case "get_course_analytics":
      return toolCourseAnalytics(ctx, args);
    case "list_assignments":
      return toolListAssignments(ctx, args);
    case "read_attachment":
      return toolReadAttachment(ctx, args);
    case "update_lesson":
    case "add_lesson":
    case "add_module":
    case "update_module":
    case "update_course_overview":
    case "update_skill_challenge":
      return toolContentWrite(ctx, name, args);
    case "navigate":
      return toolNavigate(ctx, args);
    case "highlight":
      return toolHighlight(ctx, args);
    case "remember":
      return toolRemember(ctx, args);
    case "recall_memories":
      return toolRecallMemories(ctx, args);
    default:
      return { error: `Unknown tool "${name}".` };
  }
}

// ── Read tools ───────────────────────────────────────────────────────────────

function managedFilter(user: CopilotUser) {
  return user.role === "admin"
    ? {}
    : buildManagedCoursesFilter({
        userId: user.id,
        email: user.email,
        role: user.role,
      });
}

async function loadCourseMetrics(courseIds: Types.ObjectId[]) {
  const [enrollments, assignments, submissions] = await Promise.all([
    Enrollment.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      {
        $group: {
          _id: "$courseId",
          students: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
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
          publishedAssignments: { $sum: { $cond: [{ $eq: ["$published", true] }, 1, 0] } },
        },
      },
    ]),
    Submission.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      {
        $group: {
          _id: "$courseId",
          submissions: { $sum: 1 },
          pendingReviews: { $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const byCourse = new Map<string, Record<string, number>>();
  for (const row of [...enrollments, ...assignments, ...submissions]) {
    const key = String(row._id);
    byCourse.set(key, {
      ...(byCourse.get(key) || {}),
      ...Object.fromEntries(Object.entries(row).filter(([k]) => k !== "_id")),
    } as Record<string, number>);
  }
  return byCourse;
}

async function toolListCourses(ctx: CopilotToolContext) {
  const courses = await Course.find(managedFilter(ctx.user))
    .select("_id title slug tagline published courseType level modules skillPack skillPacks updatedAt")
    .sort({ updatedAt: -1 })
    .limit(60)
    .lean();
  const metrics = await loadCourseMetrics(courses.map((c) => c._id as Types.ObjectId));
  return {
    totalCourses: courses.length,
    courses: courses.map((course) => {
      const m = metrics.get(String(course._id)) || {};
      const modules = (course.modules as Array<{ lessons?: unknown[] }>) || [];
      const packs = [
        ...(course.skillPack ? [course.skillPack] : []),
        ...((course.skillPacks as unknown[]) || []),
      ].filter(Boolean);
      return {
        title: course.title,
        courseSlug: course.slug,
        tagline: course.tagline,
        status: course.published ? "published" : "draft",
        courseType: course.courseType,
        level: course.level,
        students: m.students || 0,
        activeStudents: m.active || 0,
        avgProgressPct: m.avgProgress != null ? Math.round(m.avgProgress) : null,
        moduleCount: modules.length,
        lessonCount: modules.reduce((sum, mod) => sum + (mod.lessons?.length || 0), 0),
        skillPackCount: packs.length,
        pendingReviews: m.pendingReviews || 0,
        updatedAt: course.updatedAt,
        editHrefs: {
          dashboard: `/educator/courses/${course.slug}`,
          content: `/educator/courses/${course.slug}/content`,
          skills: `/educator/courses/${course.slug}/skills`,
          students: `/educator/courses/${course.slug}/students`,
          analytics: `/educator/courses/${course.slug}/analytics`,
        },
      };
    }),
  };
}

async function toolGetCourse(ctx: CopilotToolContext, args: Record<string, unknown>) {
  const slug = cleanString(args.courseSlug);
  if (!slug) return { error: "courseSlug is required." };
  const course = (await Course.findOne({ slug, ...managedFilter(ctx.user) }).lean()) as
    | (Record<string, unknown> & { _id: Types.ObjectId })
    | null;
  if (!course) return { error: `No managed course with slug "${slug}". Call list_courses first.` };
  const full = args.detail === "full";
  const textLimit = full ? 6000 : 500;
  const metrics = await loadCourseMetrics([course._id as Types.ObjectId]);
  const modules = (course.modules as Array<Record<string, unknown>>) || [];
  const packs = [
    ...(course.skillPack ? [course.skillPack] : []),
    ...((course.skillPacks as unknown[]) || []),
  ].filter(Boolean) as Array<Record<string, unknown>>;
  return {
    title: course.title,
    courseSlug: course.slug,
    status: course.published ? "published" : "draft",
    courseType: course.courseType,
    level: course.level,
    duration: course.duration,
    tagline: course.tagline,
    description: truncate(course.description as string, textLimit),
    longDescription: truncate(course.longDescription as string, textLimit),
    tags: course.tags,
    metrics: metrics.get(String(course._id)) || {},
    modules: modules.map((mod, moduleIndex) => ({
      moduleIndex,
      title: mod.title,
      description: truncate(mod.description as string, textLimit),
      assignment: truncate(mod.assignment as string, textLimit),
      lessons: ((mod.lessons as Array<Record<string, unknown>>) || []).map(
        (lesson, lessonIndex) => ({
          lessonIndex,
          title: lesson.title,
          duration: lesson.duration,
          isFree: lesson.isFree,
          description: truncate(lesson.description as string, textLimit),
        })
      ),
    })),
    skillPacks: packs.map((pack) => ({
      skillPackSlug: pack.slug,
      title: pack.title,
      enabled: pack.enabled,
      challenges: ((pack.challenges as Array<Record<string, unknown>>) || []).map(
        (challenge) => ({
          challengeId: challenge.id,
          day: challenge.day,
          title: challenge.title,
          hook: truncate(challenge.hook as string, full ? 1200 : 200),
          lesson: truncate(challenge.lesson as string, textLimit),
          keyIdeas: challenge.keyIdeas,
          microTask: truncate(challenge.microTask as string, full ? 1200 : 200),
          questionCount: Array.isArray(challenge.questions)
            ? challenge.questions.length
            : 0,
        })
      ),
    })),
  };
}

async function toolListStudents(ctx: CopilotToolContext, args: Record<string, unknown>) {
  const slug = cleanString(args.courseSlug);
  const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  if (!courses.length) {
    return { error: slug ? `No managed course "${slug}".` : "No managed courses." };
  }
  const rows = await Enrollment.find({ courseId: { $in: courses.map((c) => c._id) } })
    .select("courseId userId status progress points streak completedChallenges lastChallengeCompletedAt enrolledAt updatedAt")
    .populate({ path: "userId", select: "name email" })
    .sort({ updatedAt: -1 })
    .limit(600)
    .lean();

  const byCourse = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = String(row.courseId);
    const list = byCourse.get(key) || [];
    if (list.length < limit) list.push(summarizeEnrollment(row));
    byCourse.set(key, list);
  }
  const perCourse = courses.map((course) => {
    const students = byCourse.get(String(course._id)) || [];
    const total = rows.filter((r) => String(r.courseId) === String(course._id)).length;
    return {
      course: course.title,
      courseSlug: course.slug,
      totalStudents: total,
      students,
    };
  });
  return {
    totalStudents: rows.length,
    courses: perCourse,
  };
}

async function toolGetStudent(ctx: CopilotToolContext, args: Record<string, unknown>) {
  const query = cleanString(args.student)?.toLowerCase();
  if (!query) return { error: "student (email or name) is required." };
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  const rows = await Enrollment.find({ courseId: { $in: courses.map((c) => c._id) } })
    .select("courseId userId status progress points streak completedChallenges lastChallengeCompletedAt enrolledAt")
    .populate({ path: "userId", select: "name email" })
    .lean();
  const matches = rows.filter((row) => {
    const u = row.userId as { name?: string; email?: string } | null;
    return (
      u?.email?.toLowerCase().includes(query) ||
      u?.name?.toLowerCase().includes(query)
    );
  });
  if (!matches.length) return { found: false, message: `No enrolled student matching "${args.student}".` };

  const userIds = [...new Set(matches.map((m) => String((m.userId as { _id?: unknown })?._id)))];
  const submissions = await Submission.find({
    courseId: { $in: courses.map((c) => c._id) },
    userId: { $in: userIds },
  })
    .select("courseId userId status grade submittedAt assignmentId")
    .sort({ submittedAt: -1 })
    .limit(40)
    .lean();

  const courseTitle = (id: unknown) =>
    courses.find((c) => String(c._id) === String(id))?.title || "Unknown course";

  return {
    found: true,
    enrollments: matches.map((row) => ({
      course: courseTitle(row.courseId),
      ...summarizeEnrollment(row),
    })),
    recentSubmissions: submissions.map((sub) => ({
      course: courseTitle(sub.courseId),
      status: sub.status,
      grade: sub.grade,
      submittedAt: sub.submittedAt,
    })),
  };
}

async function toolCourseAnalytics(ctx: CopilotToolContext, args: Record<string, unknown>) {
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug published")
    .lean();
  if (!courses.length) {
    return { error: slug ? `No managed course "${slug}".` : "No managed courses." };
  }
  const courseIds = courses.map((c) => c._id);
  const now = Date.now();
  const [metrics, recent7, recent30, statusMix] = await Promise.all([
    loadCourseMetrics(courseIds as Types.ObjectId[]),
    Enrollment.countDocuments({
      courseId: { $in: courseIds },
      enrolledAt: { $gte: new Date(now - 7 * 86400000) },
    }),
    Enrollment.countDocuments({
      courseId: { $in: courseIds },
      enrolledAt: { $gte: new Date(now - 30 * 86400000) },
    }),
    Enrollment.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  return {
    scope: slug ? courses[0].title : `All ${courses.length} managed courses`,
    newEnrollmentsLast7Days: recent7,
    newEnrollmentsLast30Days: recent30,
    enrollmentStatusMix: Object.fromEntries(statusMix.map((row) => [row._id || "unknown", row.count])),
    perCourse: courses.map((course) => ({
      course: course.title,
      courseSlug: course.slug,
      status: course.published ? "published" : "draft",
      ...(metrics.get(String(course._id)) || {}),
    })),
  };
}

async function toolListAssignments(
  ctx: CopilotToolContext,
  args: Record<string, unknown>
) {
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  if (!courses.length) {
    return { error: slug ? `No managed course "${slug}".` : "No managed courses." };
  }
  const courseById = new Map(
    courses.map((course) => [String(course._id), { title: course.title, slug: course.slug }])
  );
  const assignments = await Assignment.find({
    courseId: { $in: courses.map((course) => course._id) },
  })
    .sort({ dueAt: 1, updatedAt: -1 })
    .limit(100)
    .lean();
  const submissionCounts = await Submission.aggregate([
    { $match: { assignmentId: { $in: assignments.map((item) => item._id) } } },
    {
      $group: {
        _id: "$assignmentId",
        submissions: { $sum: 1 },
        pendingReview: {
          $sum: { $cond: [{ $eq: ["$status", "submitted"] }, 1, 0] },
        },
      },
    },
  ]);
  const counts = new Map(
    submissionCounts.map((item) => [String(item._id), item])
  );
  return {
    total: assignments.length,
    assignments: assignments.map((assignment) => ({
      id: String(assignment._id),
      course: courseById.get(String(assignment.courseId)),
      title: assignment.title,
      instructions: truncate(assignment.instructions, 600),
      moduleIndex: assignment.moduleIndex,
      lessonIndex: assignment.lessonIndex,
      dueAt: assignment.dueAt,
      points: assignment.points,
      published: assignment.published,
      acceptsText: assignment.acceptsText,
      acceptsUrl: assignment.acceptsUrl,
      submissions: counts.get(String(assignment._id))?.submissions || 0,
      pendingReview: counts.get(String(assignment._id))?.pendingReview || 0,
    })),
  };
}

function toolReadAttachment(ctx: CopilotToolContext, args: Record<string, unknown>) {
  if (!ctx.materials.length) {
    return { error: "No files have been uploaded in this session." };
  }
  const query = cleanString(args.name)?.toLowerCase();
  const material = query
    ? ctx.materials.find((m) => m.name.toLowerCase().includes(query)) ||
      ctx.materials[ctx.materials.length - 1]
    : ctx.materials[ctx.materials.length - 1];
  const offset = Math.max(Number(args.offset) || 0, 0);
  const window = 24000;
  const text = material.text || "";
  return {
    name: material.name,
    type: material.type,
    totalChars: text.length,
    offset,
    text: text.slice(offset, offset + window),
    hasMore: offset + window < text.length,
    availableFiles: ctx.materials.map((m) => m.name),
  };
}

// ── Write tools (become approval-gated actions) ─────────────────────────────

async function toolContentWrite(
  ctx: CopilotToolContext,
  name: string,
  args: Record<string, unknown>
) {
  const action = buildContentAction(name, args);
  if (!action) {
    return {
      error:
        "Invalid or empty change. Check required fields (courseSlug, indexes, and a non-empty patch/draft).",
    };
  }

  // Verify the course really belongs to this educator before recording anything.
  const course = await findManagedCourse(ctx.user, action.courseSlug);
  if (!course) {
    return { error: `No managed course with slug "${action.courseSlug}".` };
  }

  if (ctx.actionMode === "auto") {
    const applied = await applyEducatorCopilotAction({ user: ctx.user, action });
    ctx.recordAction(applied);
    return {
      status: applied.status,
      detail: applied.result,
      note:
        applied.status === "applied"
          ? "Change applied immediately (auto mode). Tell the educator it is done."
          : "The change could not be applied.",
    };
  }

  ctx.recordAction(action);
  return {
    status: "proposed",
    note: "Manual mode: the change is queued as an action card the educator must approve. Tell them it is ready for review — do not claim it is applied.",
    actionLabel: action.label,
  };
}

type ContentWriteAction = Extract<
  EducatorCopilotAction,
  {
    type:
      | "update_course_lesson"
      | "add_lesson"
      | "add_module"
      | "update_module"
      | "update_course_overview"
      | "update_skill_challenge";
  }
>;

function buildContentAction(
  name: string,
  args: Record<string, unknown>
): ContentWriteAction | null {
  const courseSlug = cleanString(args.courseSlug);
  if (!courseSlug) return null;
  const reason = cleanString(args.reason);
  const base = {
    id: randomUUID(),
    reason,
    status: "proposed" as const,
    safety: "content_write" as const,
  };

  if (name === "update_lesson") {
    const patch = sanitizeLessonPatch(args.patch);
    const moduleIndex = toIndex(args.moduleIndex);
    const lessonIndex = toIndex(args.lessonIndex);
    if (moduleIndex === null || lessonIndex === null || !Object.keys(patch).length) return null;
    return {
      ...base,
      type: "update_course_lesson",
      label: `Update lesson ${moduleIndex + 1}.${lessonIndex + 1}${patch.title ? `: ${patch.title}` : ""}`,
      courseSlug,
      moduleIndex,
      lessonIndex,
      patch,
      preview: previewFromPatch(patch),
    };
  }

  if (name === "add_lesson") {
    const lesson = sanitizeLessonDraft(args.lesson);
    const moduleIndex = toIndex(args.moduleIndex);
    if (moduleIndex === null || !lesson) return null;
    return {
      ...base,
      type: "add_lesson",
      label: `Add lesson "${lesson.title}"`,
      courseSlug,
      moduleIndex,
      lesson,
      preview: truncate(lesson.description, 280),
    };
  }

  if (name === "add_module") {
    const moduleInput =
      args.module && typeof args.module === "object"
        ? (args.module as Record<string, unknown>)
        : null;
    const title = cleanString(moduleInput?.title);
    if (!moduleInput || !title) return null;
    const lessons = (Array.isArray(moduleInput.lessons) ? moduleInput.lessons : [])
      .map(sanitizeLessonDraft)
      .filter((lesson): lesson is EducatorCopilotLessonDraft => Boolean(lesson));
    return {
      ...base,
      type: "add_module",
      label: `Add module "${title}" (${lessons.length} lesson${lessons.length === 1 ? "" : "s"})`,
      courseSlug,
      module: {
        title,
        description: cleanString(moduleInput.description),
        assignment: cleanString(moduleInput.assignment),
        lessons,
      },
      position: toIndex(args.position) ?? undefined,
      preview: lessons.map((lesson, i) => `${i + 1}. ${lesson.title}`).join("\n"),
    };
  }

  if (name === "update_module") {
    const input =
      args.patch && typeof args.patch === "object"
        ? (args.patch as Record<string, unknown>)
        : {};
    const patch: { title?: string; description?: string; assignment?: string } = {};
    for (const key of ["title", "description", "assignment"] as const) {
      const value = cleanString(input[key]);
      if (value !== undefined) patch[key] = value;
    }
    const moduleIndex = toIndex(args.moduleIndex);
    if (moduleIndex === null || !Object.keys(patch).length) return null;
    return {
      ...base,
      type: "update_module",
      label: `Update module ${moduleIndex + 1}${patch.title ? `: ${patch.title}` : ""}`,
      courseSlug,
      moduleIndex,
      patch,
      preview: previewFromPatch(patch),
    };
  }

  if (name === "update_course_overview") {
    const input =
      args.patch && typeof args.patch === "object"
        ? (args.patch as Record<string, unknown>)
        : {};
    const patch: Extract<EducatorCopilotAction, { type: "update_course_overview" }>["patch"] = {};
    for (const key of ["tagline", "description", "longDescription", "duration"] as const) {
      const value = cleanString(input[key]);
      if (value !== undefined) patch[key] = value;
    }
    const level = cleanString(input.level);
    if (level === "beginner" || level === "intermediate" || level === "advanced") {
      patch.level = level;
    }
    if (Array.isArray(input.tags)) {
      patch.tags = input.tags
        .map((tag) => cleanString(tag))
        .filter((tag): tag is string => Boolean(tag))
        .slice(0, 12);
    }
    if (!Object.keys(patch).length) return null;
    return {
      ...base,
      type: "update_course_overview",
      label: "Update course overview",
      courseSlug,
      patch,
      preview: previewFromPatch(patch),
    };
  }

  if (name === "update_skill_challenge") {
    const patch = sanitizeSkillChallengePatch(args.patch);
    const challengeId = cleanString(args.challengeId);
    if (!challengeId || !Object.keys(patch).length) return null;
    return {
      ...base,
      type: "update_skill_challenge",
      label: `Update skill challenge${patch.title ? `: ${patch.title}` : ` ${challengeId}`}`,
      courseSlug,
      skillPackSlug: cleanString(args.skillPackSlug),
      challengeId,
      patch,
      preview: previewFromPatch(patch),
    };
  }

  return null;
}

function toolNavigate(ctx: CopilotToolContext, args: Record<string, unknown>) {
  const href = cleanString(args.href);
  if (!href || !isAllowedHref(href)) {
    return { error: "href must be an in-app path (e.g. /educator/courses/<slug>/content)." };
  }
  const action: EducatorCopilotAction = {
    id: randomUUID(),
    type: "navigate",
    label: cleanString(args.label) || `Open ${href}`,
    href,
    reason: cleanString(args.reason),
    status: "proposed",
    safety: "client_safe",
  };
  ctx.recordAction(action);
  return {
    status: ctx.actionMode === "auto" ? "navigating" : "proposed",
    note:
      ctx.actionMode === "auto"
        ? "The app will navigate there now."
        : "A navigation card is shown for the educator to run.",
  };
}

function toolHighlight(ctx: CopilotToolContext, args: Record<string, unknown>) {
  let selector = cleanString(args.selector);
  const target = cleanString(args.target)?.toLowerCase();
  if (!selector && target) {
    const match = ctx.pageContext?.uiMap?.find((item) =>
      item.label.toLowerCase().includes(target)
    );
    selector = match?.selector;
    if (!selector) {
      return {
        error: `No element labeled like "${args.target}" on the current page.`,
        visibleTargets: (ctx.pageContext?.uiMap || []).slice(0, 40).map((item) => item.label),
      };
    }
  }
  if (!selector) return { error: "Provide target (visible label) or selector." };
  const action: EducatorCopilotAction = {
    id: randomUUID(),
    type: "highlight",
    label: cleanString(args.target) ? `Highlight "${args.target}"` : "Highlight on page",
    selector,
    reason: cleanString(args.reason),
    status: "proposed",
    safety: "client_safe",
  };
  ctx.recordAction(action);
  return { status: ctx.actionMode === "auto" ? "highlighting" : "proposed" };
}

async function toolRemember(ctx: CopilotToolContext, args: Record<string, unknown>) {
  const content = cleanString(args.content);
  if (!content) return { error: "content is required." };
  if (!ctx.client || !ctx.agentId) return { error: "Memory is unavailable right now." };
  const kind = cleanString(args.kind);
  const memoryType =
    kind === "episodic" || kind === "procedural" ? kind : "semantic";
  await ctx.client.memory.create({
    agentId: ctx.agentId,
    sessionId: ctx.agentSessionId,
    memoryType,
    content,
    summary: content.slice(0, 180),
    importanceScore: 0.8,
    tags: ["educator-preference"],
  });
  return { saved: true, content };
}

async function toolRecallMemories(ctx: CopilotToolContext, args: Record<string, unknown>) {
  if (!ctx.client || !ctx.agentId) return { error: "Memory is unavailable right now." };
  const query = cleanString(args.query) || "educator preferences";
  const result = await ctx.client.memory.retrieve(ctx.agentId, query, 8);
  return {
    memories: (result.data || []).map((memory) => ({
      content: memory.content,
      type: memory.memoryType,
      savedAt: memory.createdAt,
    })),
  };
}

// ── Applying content-write actions ──────────────────────────────────────────

export async function applyEducatorCopilotAction({
  user,
  action,
}: {
  user: CopilotUser;
  action: EducatorCopilotAction;
}): Promise<EducatorCopilotAction> {
  if (action.type === "navigate" || action.type === "highlight") {
    return { ...action, status: "applied", result: "Client-side action ready." };
  }
  if (action.safety === "sensitive_blocked") {
    return {
      ...action,
      status: "blocked",
      result: "This action is outside the copilot's allowed permissions.",
    };
  }

  const course = await findManagedCourse(user, action.courseSlug);
  if (!course) {
    return { ...action, status: "failed", result: "Course not found." };
  }

  try {
    switch (action.type) {
      case "update_course_lesson": {
        const modules = Array.isArray(course.modules) ? course.modules : [];
        const lesson = modules[action.moduleIndex]?.lessons?.[action.lessonIndex];
        if (!lesson) return { ...action, status: "failed", result: "Lesson not found." };
        Object.assign(lesson, action.patch);
        course.modules = modules;
        recountCourse(course);
        break;
      }
      case "add_lesson": {
        const modules = Array.isArray(course.modules) ? course.modules : [];
        const courseModule = modules[action.moduleIndex];
        if (!courseModule) return { ...action, status: "failed", result: "Module not found." };
        courseModule.lessons = courseModule.lessons || [];
        courseModule.lessons.push(normalizeLessonForSave(action.lesson));
        course.modules = modules;
        recountCourse(course);
        break;
      }
      case "add_module": {
        const modules = Array.isArray(course.modules) ? course.modules : [];
        const newModule = {
          title: action.module.title,
          description: action.module.description,
          assignment: action.module.assignment,
          lessons: action.module.lessons.map(normalizeLessonForSave),
        };
        const position =
          action.position != null && action.position >= 0 && action.position <= modules.length
            ? action.position
            : modules.length;
        modules.splice(position, 0, newModule as never);
        course.modules = modules;
        recountCourse(course);
        break;
      }
      case "update_module": {
        const modules = Array.isArray(course.modules) ? course.modules : [];
        const courseModule = modules[action.moduleIndex];
        if (!courseModule) return { ...action, status: "failed", result: "Module not found." };
        Object.assign(courseModule, action.patch);
        course.modules = modules;
        break;
      }
      case "update_course_overview": {
        Object.assign(course, action.patch);
        break;
      }
      case "update_skill_challenge": {
        const packs = [
          ...(course.skillPack ? [course.skillPack] : []),
          ...((course.skillPacks as unknown[]) || []),
        ].filter(Boolean) as Array<{
          slug?: string;
          challenges?: Array<{ id?: string; title?: string }>;
        }>;
        const pack =
          packs.find((p) => p.slug === action.skillPackSlug) ||
          packs.find((p) => p.challenges?.some((c) => c.id === action.challengeId));
        const challenge = pack?.challenges?.find((c) => c.id === action.challengeId);
        if (!pack || !challenge) {
          return { ...action, status: "failed", result: "Challenge not found." };
        }
        Object.assign(challenge, action.patch);
        course.markModified("skillPack");
        course.markModified("skillPacks");
        break;
      }
      default:
        return {
          ...(action as EducatorCopilotAction),
          status: "blocked",
          result: "Unsupported action type.",
        };
    }

    course.markModified("modules");
    await course.save();
    await indexCourseForSearch(course);
    return { ...action, status: "applied", result: appliedSummary(action) };
  } catch (error) {
    return {
      ...action,
      status: "failed",
      result: error instanceof Error ? error.message : "The change could not be saved.",
    };
  }
}

function appliedSummary(action: EducatorCopilotAction) {
  switch (action.type) {
    case "add_module":
      return `Added module "${action.module.title}" with ${action.module.lessons.length} lesson(s).`;
    case "add_lesson":
      return `Added lesson "${action.lesson.title}".`;
    case "update_course_lesson":
      return "Lesson updated.";
    case "update_module":
      return "Module updated.";
    case "update_course_overview":
      return "Course overview updated.";
    case "update_skill_challenge":
      return "Skill challenge updated.";
    default:
      return "Applied.";
  }
}

async function findManagedCourse(user: CopilotUser, slug: string) {
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

function recountCourse(course: {
  modules?: Array<{ lessons?: unknown[] }>;
  lessonsCount?: number;
  modulesCount?: number;
}) {
  const modules = course.modules || [];
  course.modulesCount = modules.length;
  course.lessonsCount = modules.reduce((sum, mod) => sum + (mod.lessons?.length || 0), 0);
}

function normalizeLessonForSave(lesson: EducatorCopilotLessonDraft) {
  return {
    title: lesson.title,
    duration: lesson.duration || "10 min",
    description: lesson.description,
    assetUrl: lesson.assetUrl,
    assetAlt: lesson.assetAlt,
    isFree: Boolean(lesson.isFree),
  };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function summarizeEnrollment(row: Record<string, unknown>) {
  const user = row.userId as { name?: string; email?: string } | null;
  return {
    name: user?.name,
    email: user?.email,
    status: row.status,
    progressPct: row.progress,
    points: row.points,
    streak: row.streak,
    completedChallenges: Array.isArray(row.completedChallenges)
      ? row.completedChallenges.length
      : 0,
    lastActiveAt: row.lastChallengeCompletedAt || row.updatedAt,
    enrolledAt: row.enrolledAt,
  };
}

function isAllowedHref(href: string) {
  if (!href.startsWith("/")) return false;
  return ["/educator", "/courses", "/skills", "/dashboard"].some(
    (prefix) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`)
  );
}

function sanitizeLessonPatch(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const patch: Partial<EducatorCopilotLessonDraft> = {};
  for (const key of ["title", "duration", "description", "assetUrl", "assetAlt"] as const) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  if (typeof input.isFree === "boolean") patch.isFree = input.isFree;
  return patch;
}

function sanitizeLessonDraft(value: unknown): EducatorCopilotLessonDraft | null {
  const patch = sanitizeLessonPatch(value);
  if (!patch.title) return null;
  return { ...patch, title: patch.title };
}

function sanitizeSkillChallengePatch(value: unknown) {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "shortTitle", "hook", "lesson", "microTask"]) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  if (Array.isArray(input.keyIdeas)) {
    patch.keyIdeas = input.keyIdeas
      .map((idea) => cleanString(idea))
      .filter(Boolean)
      .slice(0, 6);
  }
  return patch as Extract<
    EducatorCopilotAction,
    { type: "update_skill_challenge" }
  >["patch"];
}

function previewFromPatch(patch: Record<string, unknown>) {
  return Object.entries(patch)
    .map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
      return `${key}: ${text.length > 220 ? `${text.slice(0, 220)}…` : text}`;
    })
    .join("\n")
    .slice(0, 900);
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function toIndex(value: unknown) {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return null;
  const int = Math.floor(num);
  return int >= 0 ? int : null;
}
