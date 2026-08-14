import { randomUUID } from "crypto";
import { Types } from "mongoose";
import type { CommonsClient } from "@agent-commons/sdk";
import type { CopilotUser } from "@/lib/educator-copilot-agent";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import { resolveEducatorCopilotImageUrl } from "@/lib/educator-copilot-files";
import {
  describeExperienceCopilotImpact,
  EXPERIENCE_COPILOT_WORLD_GUIDE,
} from "@/lib/experience-ai";
import { normalizeExperienceDocument } from "@/lib/experience-schema";
import { uploadCourseMediaToS3 } from "@/lib/media-storage";
import { createJoinCode, normalizeActivities } from "@/lib/live-session-input";
import { indexCourseForSearch } from "@/lib/search-indexers";
import Assignment from "@/models/Assignment";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import ExperienceProject from "@/models/ExperienceProject";
import LiveParticipant from "@/models/LiveParticipant";
import LiveResponse from "@/models/LiveResponse";
import LiveSession from "@/models/LiveSession";
import Submission from "@/models/Submission";
import type { IEducatorCopilotMaterial } from "@/models/EducatorCopilotSession";
import type {
  EducatorCopilotAction,
  EducatorCopilotActionMode,
  EducatorCopilotLessonDraft,
  EducatorCopilotPageContext,
} from "@/types/educator-copilot";
import type { SkillChallenge, SkillPack, SkillQuestion } from "@/types/skills";
import type { LiveActivity } from "@/types/live-session";

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
    description:
      "Full lesson body in markdown. Write complete content, not placeholders.",
  },
  assetUrl: { type: "string" },
  assetAttachmentName: {
    type: "string",
    description:
      "Exact image filename from this chat. The tool persists it to course media and sets assetUrl.",
  },
  assetAlt: { type: "string" },
  isFree: { type: "boolean" },
};

const skillQuestionProperties = {
  id: { type: "string" },
  prompt: { type: "string" },
  options: { type: "array", items: { type: "string" } },
  answerIndex: { type: "number" },
  explanation: { type: "string" },
};

const skillChallengeProperties = {
  id: { type: "string" },
  title: { type: "string" },
  shortTitle: { type: "string" },
  minutes: { type: "number" },
  points: { type: "number" },
  streakBoost: { type: "number" },
  assetUrl: {
    type: "string",
    description:
      "Existing durable course-media URL. Prefer assetAttachmentName for a chat upload.",
  },
  assetAttachmentName: {
    type: "string",
    description:
      "Exact image filename from this chat. The tool persists it to course media and sets assetUrl.",
  },
  assetAlt: { type: "string" },
  accentColor: { type: "string" },
  audioCue: { type: "string", enum: ["spark", "focus", "complete"] },
  hook: { type: "string" },
  lesson: {
    type: "string",
    description: "Full challenge lesson body in markdown or safe HTML.",
  },
  keyIdeas: { type: "array", items: { type: "string" } },
  microTask: { type: "string" },
  questions: {
    type: "array",
    items: {
      type: "object",
      properties: skillQuestionProperties,
      required: ["prompt", "options", "answerIndex"],
    },
  },
};

const skillPathProperties = {
  slug: { type: "string" },
  enabled: {
    type: "boolean",
    description:
      "Whether the skill path is published to learners (defaults to true when creating).",
  },
  title: { type: "string" },
  subtitle: { type: "string" },
  coverUrl: {
    type: "string",
    description:
      "Existing durable course-media URL. Prefer coverAttachmentName for a chat upload.",
  },
  coverAttachmentName: {
    type: "string",
    description:
      "Exact banner image filename from this chat. The tool persists it to course media and sets coverUrl.",
  },
  learnerPromise: { type: "string" },
  challenges: {
    type: "array",
    items: {
      type: "object",
      properties: skillChallengeProperties,
      required: ["title", "lesson"],
    },
  },
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
        courseSlug: {
          type: "string",
          description: "Course slug from list_courses",
        },
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
    name: "list_experiences",
    description:
      "List immersive learning experiences the educator owns, including experience IDs, course, status, world title, and scene/location counts. Use this to resolve the experience the educator names before reading or editing it.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: {
          type: "string",
          description: "Optional course slug from list_courses.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_experience",
    description:
      "Read one complete immersive experience and the authoritative world-authoring contract. Always call this before editing a world so you have its current version, stable IDs, asset registry, locations, stage compositions, characters, story routes, and interactions.",
    parameters: {
      type: "object",
      properties: {
        experienceId: {
          type: "string",
          description: "Experience ID from list_experiences.",
        },
      },
      required: ["experienceId"],
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
        limit: {
          type: "number",
          description: "Max students per course (default 30)",
        },
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
        student: {
          type: "string",
          description: "Email address or (partial) name",
        },
        courseSlug: {
          type: "string",
          description: "Optional: restrict to one course",
        },
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
    name: "list_live_sessions",
    description:
      "List live and in-person course sessions with their run of show, room status, join code, participation, and response counts. Use this for facilitation prep, live room checks, and post-session reflection.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: {
          type: "string",
          description: "Optional course slug from list_courses",
        },
        status: {
          type: "string",
          enum: ["draft", "lobby", "live", "ended"],
        },
      },
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
        name: {
          type: "string",
          description:
            "File name (or part of it). Defaults to the most recent upload.",
        },
        offset: {
          type: "number",
          description: "Character offset to continue reading from (default 0)",
        },
      },
      required: [],
    },
  },
  {
    name: "update_lesson",
    description:
      "Revise an existing lesson (title, duration, body, media, free flag). For a chat-uploaded image use its exact filename in assetAttachmentName so it is persisted as durable course media. In manual mode this queues a proposal for the educator to approve; in auto mode it applies immediately.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        moduleIndex: { type: "number" },
        lessonIndex: { type: "number" },
        patch: { type: "object", properties: lessonPatchProperties },
        reason: {
          type: "string",
          description: "One line: why this change helps",
        },
      },
      required: ["courseSlug", "moduleIndex", "lessonIndex", "patch"],
    },
  },
  {
    name: "create_live_session",
    description:
      "Create a complete live or in-person facilitation plan for a managed course. Use after reading source material and the course. Build an intentional run of show from workbook pages, setup checks, polls, quizzes, reflections, practice tasks, and breaks. This is approval-gated in manual mode.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        pace: { type: "string", enum: ["facilitator", "learner"] },
        access: { type: "string", enum: ["enrolled", "invited", "open"] },
        activities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "content",
                  "setup_check",
                  "poll",
                  "quiz",
                  "reflection",
                  "task",
                  "break",
                ],
              },
              title: { type: "string" },
              prompt: { type: "string" },
              instructions: { type: "string" },
              successCriteria: { type: "string" },
              facilitatorNotes: { type: "string" },
              resourceUrl: { type: "string" },
              materialId: {
                type: "string",
                description:
                  "ID of a private course material to present inside this activity.",
              },
              labWorkspaceId: {
                type: "string",
                description:
                  "ID of a private lab workspace to embed in this activity.",
              },
              labEntryPath: {
                type: "string",
                description:
                  "Optional learner-visible file or folder path inside the selected lab workspace. Use this to land learners directly at the materials needed for the activity.",
              },
              estimatedMinutes: { type: "number" },
              required: { type: "boolean" },
              randomizeOptions: { type: "boolean" },
              showResults: { type: "boolean" },
              points: { type: "number" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    isCorrect: { type: "boolean" },
                  },
                  required: ["label"],
                },
              },
            },
            required: ["type", "title"],
          },
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "title", "activities"],
    },
  },
  {
    name: "add_lesson",
    description:
      "Add a new lesson to an existing module. For a chat-uploaded image use its exact filename in assetAttachmentName.",
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
      "Add a whole new module with its lessons — the building block for creating course content (e.g. from an uploaded document). Lesson images can use exact chat filenames in assetAttachmentName. Propose one module per call so the educator can review each.",
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
        position: {
          type: "number",
          description: "Insert index (default: append at end)",
        },
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
            level: {
              type: "string",
              enum: ["beginner", "intermediate", "advanced"],
            },
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
    name: "create_skill_path",
    description:
      "Create a complete new skill path/badge sequence on a managed course, including its banner, daily challenge images, lesson copy, and quiz questions. This is the authorized educator-console route for course skill paths; do not use Agent Commons listCommonsResources or proposeSkillChange. Use exact uploaded filenames in coverAttachmentName and assetAttachmentName; this tool persists those uploads as durable course media. In manual mode it queues one approval card; in auto mode it applies immediately.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        skillPath: {
          type: "object",
          properties: skillPathProperties,
          required: ["title", "challenges"],
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "skillPath"],
    },
  },
  {
    name: "update_skill_path",
    description:
      "Update an existing skill path's metadata, banner, publication state, or (when explicitly requested) replace its complete challenge sequence. Call get_course first and identify it by skillPackSlug. For a single challenge edit use update_skill_challenge so other challenges are preserved.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        skillPackSlug: { type: "string" },
        patch: {
          type: "object",
          properties: skillPathProperties,
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "skillPackSlug", "patch"],
    },
  },
  {
    name: "update_skill_challenge",
    description:
      "Revise an existing skill-path challenge, including its lesson copy, badge image, scoring, and quiz questions. Use assetAttachmentName to persist an image uploaded in this chat.",
    parameters: {
      type: "object",
      properties: {
        courseSlug: { type: "string" },
        challengeId: { type: "string" },
        skillPackSlug: { type: "string" },
        patch: {
          type: "object",
          properties: skillChallengeProperties,
        },
        reason: { type: "string" },
      },
      required: ["courseSlug", "challengeId", "patch"],
    },
  },
  {
    name: "update_experience_world",
    description:
      "Replace an experience draft with a complete revised schemaVersion 2 document after reading it with get_experience. Use for both focused manipulations and broad world redesigns. Preserve stable IDs and untouched data. The server validates every reference and every route before it can become a reviewable action.",
    parameters: {
      type: "object",
      properties: {
        experienceId: { type: "string" },
        baseVersion: {
          type: "number",
          description: "Current draftVersion returned by get_experience.",
        },
        document: {
          type: "object",
          required: [
            "schemaVersion",
            "title",
            "subtitle",
            "description",
            "estimatedMinutes",
            "objectives",
            "startSceneId",
            "theme",
            "world",
            "assets",
            "characters",
            "scenes",
          ],
          properties: {
            schemaVersion: { type: "number", const: 2 },
            title: { type: "string" },
            subtitle: { type: "string" },
            description: { type: "string" },
            estimatedMinutes: { type: "number" },
            objectives: { type: "array", items: { type: "string" } },
            startSceneId: { type: "string" },
            theme: { type: "object" },
            world: { type: "object" },
            assets: { type: "array", items: { type: "object" } },
            characters: { type: "array", items: { type: "object" } },
            scenes: { type: "array", items: { type: "object" } },
          },
          additionalProperties: false,
        },
        reason: {
          type: "string",
          description:
            "Short, concrete summary of what changed and how it satisfies the educator's request.",
        },
      },
      required: ["experienceId", "baseVersion", "document"],
    },
  },
  {
    name: "navigate",
    description:
      "Take the educator to a page in the educator console (or a public course/skill page). Use hrefs from the workspace snapshot's navigation map.",
    parameters: {
      type: "object",
      properties: {
        href: {
          type: "string",
          description: 'e.g. "/educator/courses/my-course/content"',
        },
        label: {
          type: "string",
          description: 'Short button label, e.g. "Open course content"',
        },
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
        target: {
          type: "string",
          description: "Visible label of the element (preferred)",
        },
        selector: {
          type: "string",
          description: "Exact CSS selector (alternative)",
        },
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
        content: {
          type: "string",
          description: "The fact/preference, written to be useful later",
        },
        kind: {
          type: "string",
          enum: ["semantic", "episodic", "procedural"],
          description:
            "semantic = fact/preference (default), episodic = event, procedural = how-to",
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
  args: Record<string, unknown>,
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
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_courses":
      return toolListCourses(ctx);
    case "get_course":
      return toolGetCourse(ctx, args);
    case "list_experiences":
      return toolListExperiences(ctx, args);
    case "get_experience":
      return toolGetExperience(ctx, args);
    case "list_students":
      return toolListStudents(ctx, args);
    case "get_student":
      return toolGetStudent(ctx, args);
    case "get_course_analytics":
      return toolCourseAnalytics(ctx, args);
    case "list_assignments":
      return toolListAssignments(ctx, args);
    case "list_live_sessions":
      return toolListLiveSessions(ctx, args);
    case "read_attachment":
      return toolReadAttachment(ctx, args);
    case "update_lesson":
    case "add_lesson":
    case "add_module":
    case "update_module":
    case "update_course_overview":
    case "create_skill_path":
    case "update_skill_path":
    case "update_skill_challenge":
    case "create_live_session":
      return toolContentWrite(ctx, name, args);
    case "update_experience_world":
      return toolExperienceWrite(ctx, args);
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
    .select(
      "_id title slug tagline published courseType level modules skillPack skillPacks updatedAt",
    )
    .sort({ updatedAt: -1 })
    .limit(60)
    .lean();
  const metrics = await loadCourseMetrics(
    courses.map((c) => c._id as Types.ObjectId),
  );
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
        avgProgressPct:
          m.avgProgress != null ? Math.round(m.avgProgress) : null,
        moduleCount: modules.length,
        lessonCount: modules.reduce(
          (sum, mod) => sum + (mod.lessons?.length || 0),
          0,
        ),
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

async function toolGetCourse(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const slug = cleanString(args.courseSlug);
  if (!slug) return { error: "courseSlug is required." };
  const course = (await Course.findOne({
    slug,
    ...managedFilter(ctx.user),
  }).lean()) as (Record<string, unknown> & { _id: Types.ObjectId }) | null;
  if (!course)
    return {
      error: `No managed course with slug "${slug}". Call list_courses first.`,
    };
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
        }),
      ),
    })),
    skillPacks: packs.map((pack, packIndex) => ({
      skillPackSlug:
        pack.slug ||
        (packIndex === 0 && course.skillPack ? course.slug : undefined),
      storage: packIndex === 0 && course.skillPack ? "primary" : "additional",
      title: pack.title,
      enabled: pack.enabled,
      subtitle: pack.subtitle,
      coverUrl: pack.coverUrl,
      learnerPromise: truncate(pack.learnerPromise as string, textLimit),
      challenges: (
        (pack.challenges as Array<Record<string, unknown>>) || []
      ).map((challenge) => ({
        challengeId: challenge.id,
        day: challenge.day,
        title: challenge.title,
        hook: truncate(challenge.hook as string, full ? 1200 : 200),
        lesson: truncate(challenge.lesson as string, textLimit),
        minutes: challenge.minutes,
        points: challenge.points,
        streakBoost: challenge.streakBoost,
        assetUrl: challenge.assetUrl,
        assetAlt: challenge.assetAlt,
        accentColor: challenge.accentColor,
        audioCue: challenge.audioCue,
        keyIdeas: challenge.keyIdeas,
        microTask: truncate(challenge.microTask as string, full ? 1200 : 200),
        questionCount: Array.isArray(challenge.questions)
          ? challenge.questions.length
          : 0,
      })),
    })),
  };
}

async function toolListExperiences(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  if (!courses.length) {
    return {
      error: slug
        ? `No managed course with slug "${slug}".`
        : "No managed courses were found.",
    };
  }
  const courseById = new Map(
    courses.map((course) => [String(course._id), course]),
  );
  const projects = await ExperienceProject.find({
    courseId: { $in: courses.map((course) => course._id) },
  })
    .select(
      "_id courseId title description status draftVersion draft updatedAt",
    )
    .sort({ updatedAt: -1 })
    .limit(80)
    .lean();

  return {
    totalExperiences: projects.length,
    experiences: projects.map((project) => {
      const document = normalizeExperienceDocument(project.draft);
      const course = courseById.get(String(project.courseId));
      return {
        experienceId: String(project._id),
        title: project.title,
        description: project.description,
        courseTitle: course?.title,
        courseSlug: course?.slug,
        status: project.status,
        draftVersion: project.draftVersion,
        worldTitle: document.world.title,
        sceneCount: document.scenes.length,
        locationCount: document.world.locations.length,
        characterCount: document.characters.length,
        assetCount: document.assets.length,
        studioHref: `/educator/experience-studio/${String(project._id)}`,
        updatedAt: project.updatedAt,
      };
    }),
  };
}

async function toolListLiveSessions(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const courseSlug = cleanString(args.courseSlug);
  const status = cleanString(args.status);
  const courses = await Course.find({
    ...(courseSlug ? { slug: courseSlug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  if (!courses.length) {
    return {
      error: courseSlug
        ? `No managed course with slug "${courseSlug}".`
        : "No managed courses were found.",
    };
  }
  const courseById = new Map(
    courses.map((course) => [String(course._id), course]),
  );
  const sessions = await LiveSession.find({
    courseId: { $in: courses.map((course) => course._id) },
    ...(status && ["draft", "lobby", "live", "ended"].includes(status)
      ? { status }
      : {}),
  })
    .sort({ updatedAt: -1 })
    .limit(80)
    .lean();
  const sessionIds = sessions.map((session) => session._id);
  const [participantRows, responseRows] = await Promise.all([
    LiveParticipant.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      { $group: { _id: "$sessionId", count: { $sum: 1 } } },
    ]),
    LiveResponse.aggregate([
      { $match: { sessionId: { $in: sessionIds } } },
      {
        $group: {
          _id: { sessionId: "$sessionId", activityId: "$activityId" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);
  const participantsBySession = new Map(
    participantRows.map((row: { _id: Types.ObjectId; count: number }) => [
      String(row._id),
      row.count,
    ]),
  );
  const responsesBySession = new Map<string, Map<string, number>>();
  for (const row of responseRows as Array<{
    _id: { sessionId: Types.ObjectId; activityId: string };
    count: number;
  }>) {
    const key = String(row._id.sessionId);
    const counts = responsesBySession.get(key) || new Map<string, number>();
    counts.set(row._id.activityId, row.count);
    responsesBySession.set(key, counts);
  }
  return {
    totalSessions: sessions.length,
    sessions: sessions.map((session) => {
      const course = courseById.get(String(session.courseId));
      const responseCounts = responsesBySession.get(String(session._id));
      return {
        sessionId: String(session._id),
        title: session.title,
        courseTitle: course?.title,
        courseSlug: course?.slug,
        status: session.status,
        pace: session.pace,
        access: session.access,
        joinCode: session.joinCode,
        participants: participantsBySession.get(String(session._id)) || 0,
        scheduledStart: session.scheduledStart,
        currentActivityId: session.currentActivityId,
        activities: session.activities.map(
          (activity: LiveActivity, index: number) => ({
            index,
            id: activity.id,
            type: activity.type,
            title: activity.title,
            status: activity.status,
            estimatedMinutes: activity.estimatedMinutes,
            required: activity.required,
            responses: responseCounts?.get(activity.id) || 0,
          }),
        ),
        facilitatorHref: `/educator/courses/${course?.slug}/live/${String(session._id)}`,
        updatedAt: session.updatedAt,
      };
    }),
  };
}

async function toolGetExperience(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const experienceId = cleanString(args.experienceId);
  if (!experienceId || !Types.ObjectId.isValid(experienceId)) {
    return {
      error: "A valid experienceId from list_experiences is required.",
    };
  }
  const project = await findManagedExperience(ctx.user, experienceId);
  if (!project) {
    return {
      error:
        "Experience not found or it does not belong to a course this educator manages.",
    };
  }
  const document = normalizeExperienceDocument(project.draft);
  return {
    experienceId: String(project._id),
    courseSlug: project.courseSlug,
    status: project.status,
    draftVersion: project.draftVersion,
    studioHref: `/educator/experience-studio/${String(project._id)}`,
    authoringContract: EXPERIENCE_COPILOT_WORLD_GUIDE,
    document,
  };
}

async function toolListStudents(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const slug = cleanString(args.courseSlug);
  const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  if (!courses.length) {
    return {
      error: slug ? `No managed course "${slug}".` : "No managed courses.",
    };
  }
  const rows = await Enrollment.find({
    courseId: { $in: courses.map((c) => c._id) },
  })
    .select(
      "courseId userId status progress points streak completedChallenges lastChallengeCompletedAt enrolledAt updatedAt",
    )
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
    const total = rows.filter(
      (r) => String(r.courseId) === String(course._id),
    ).length;
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

async function toolGetStudent(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const query = cleanString(args.student)?.toLowerCase();
  if (!query) return { error: "student (email or name) is required." };
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  const rows = await Enrollment.find({
    courseId: { $in: courses.map((c) => c._id) },
  })
    .select(
      "courseId userId status progress points streak completedChallenges lastChallengeCompletedAt enrolledAt",
    )
    .populate({ path: "userId", select: "name email" })
    .lean();
  const matches = rows.filter((row) => {
    const u = row.userId as { name?: string; email?: string } | null;
    return (
      u?.email?.toLowerCase().includes(query) ||
      u?.name?.toLowerCase().includes(query)
    );
  });
  if (!matches.length)
    return {
      found: false,
      message: `No enrolled student matching "${args.student}".`,
    };

  const userIds = [
    ...new Set(
      matches.map((m) => String((m.userId as { _id?: unknown })?._id)),
    ),
  ];
  const submissions = await Submission.find({
    courseId: { $in: courses.map((c) => c._id) },
    userId: { $in: userIds },
  })
    .select("courseId userId status grade submittedAt assignmentId")
    .sort({ submittedAt: -1 })
    .limit(40)
    .lean();

  const courseTitle = (id: unknown) =>
    courses.find((c) => String(c._id) === String(id))?.title ||
    "Unknown course";

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

async function toolCourseAnalytics(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug published")
    .lean();
  if (!courses.length) {
    return {
      error: slug ? `No managed course "${slug}".` : "No managed courses.",
    };
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
    enrollmentStatusMix: Object.fromEntries(
      statusMix.map((row) => [row._id || "unknown", row.count]),
    ),
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
  args: Record<string, unknown>,
) {
  const slug = cleanString(args.courseSlug);
  const courses = await Course.find({
    ...(slug ? { slug } : {}),
    ...managedFilter(ctx.user),
  })
    .select("_id title slug")
    .lean();
  if (!courses.length) {
    return {
      error: slug ? `No managed course "${slug}".` : "No managed courses.",
    };
  }
  const courseById = new Map(
    courses.map((course) => [
      String(course._id),
      { title: course.title, slug: course.slug },
    ]),
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
    submissionCounts.map((item) => [String(item._id), item]),
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

function toolReadAttachment(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
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
  args: Record<string, unknown>,
) {
  const requestedCourseSlug = cleanString(args.courseSlug);
  if (!requestedCourseSlug) {
    return { error: "courseSlug is required." };
  }
  // Authorize the educator before persisting any uploaded images or recording
  // an action against the course.
  const course = await findManagedCourse(ctx.user, requestedCourseSlug);
  if (!course) {
    return { error: `No managed course with slug "${requestedCourseSlug}".` };
  }

  const preparedArgs = await persistContentAttachments(ctx, name, args);
  const action = buildContentAction(name, preparedArgs);
  if (!action) {
    return {
      error:
        "Invalid or empty change. Check required fields (courseSlug, indexes, and a non-empty patch/draft).",
    };
  }

  if (ctx.actionMode === "auto") {
    const applied = await applyEducatorCopilotAction({
      user: ctx.user,
      action,
    });
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

async function persistContentAttachments(
  ctx: CopilotToolContext,
  name: string,
  args: Record<string, unknown>,
) {
  if (
    name !== "update_lesson" &&
    name !== "add_lesson" &&
    name !== "add_module" &&
    name !== "create_skill_path" &&
    name !== "update_skill_path" &&
    name !== "update_skill_challenge"
  ) {
    return args;
  }

  const prepared = { ...args };
  const attachmentNames = new Set<string>();
  const uploadedImageName = (value: unknown) => {
    const candidate = cleanString(value)?.toLowerCase();
    if (!candidate) return undefined;
    return ctx.materials.find(
      (material) =>
        material.type.startsWith("image/") &&
        material.name.toLowerCase() === candidate,
    )?.name;
  };
  const collect = (value: unknown): void => {
    const input = asRecord(value);
    const coverName =
      cleanString(input.coverAttachmentName) ||
      uploadedImageName(input.coverUrl);
    const assetName =
      cleanString(input.assetAttachmentName) ||
      uploadedImageName(input.assetUrl);
    if (coverName) attachmentNames.add(coverName);
    if (assetName) attachmentNames.add(assetName);
    for (const key of ["challenges", "lessons"] as const) {
      for (const child of Array.isArray(input[key]) ? input[key] : []) {
        collect(child);
      }
    }
  };

  if (name === "create_skill_path") collect(args.skillPath);
  else if (name === "add_lesson") collect(args.lesson);
  else if (name === "add_module") collect(args.module);
  else collect(args.patch);

  if (!attachmentNames.size) return prepared;
  const persisted = new Map(
    await Promise.all(
      [...attachmentNames].map(
        async (attachmentName) =>
          [
            attachmentName,
            await persistUploadedCopilotImage(ctx, attachmentName),
          ] as const,
      ),
    ),
  );

  const replace = (value: unknown): Record<string, unknown> => {
    const input = { ...asRecord(value) };
    const coverName =
      cleanString(input.coverAttachmentName) ||
      uploadedImageName(input.coverUrl);
    if (coverName) input.coverUrl = persisted.get(coverName);
    delete input.coverAttachmentName;
    const assetName =
      cleanString(input.assetAttachmentName) ||
      uploadedImageName(input.assetUrl);
    if (assetName) input.assetUrl = persisted.get(assetName);
    delete input.assetAttachmentName;
    for (const key of ["challenges", "lessons"] as const) {
      if (Array.isArray(input[key])) {
        input[key] = input[key].map((child) => replace(child));
      }
    }
    return input;
  };

  if (name === "create_skill_path")
    prepared.skillPath = replace(args.skillPath);
  else if (name === "add_lesson") prepared.lesson = replace(args.lesson);
  else if (name === "add_module") prepared.module = replace(args.module);
  else prepared.patch = replace(args.patch);
  return prepared;
}

async function persistUploadedCopilotImage(
  ctx: CopilotToolContext,
  attachmentName: string,
) {
  const query = attachmentName.toLowerCase();
  const exact = ctx.materials.find(
    (material) => material.name.toLowerCase() === query,
  );
  const partial = ctx.materials.filter((material) =>
    material.name.toLowerCase().includes(query),
  );
  const material = exact || (partial.length === 1 ? partial[0] : undefined);
  if (!material) {
    const detail =
      partial.length > 1 ? "matches more than one upload" : "was not uploaded";
    throw new Error(
      `Image attachment “${attachmentName}” ${detail}. Use an exact filename from read_attachment.`,
    );
  }
  if (!material.type.startsWith("image/")) {
    throw new Error(`Attachment “${material.name}” is not an image.`);
  }
  if (!material.fileId || !ctx.client || !ctx.agentId) {
    throw new Error(
      `Attachment “${material.name}” is not available from durable file storage. Upload it again and retry.`,
    );
  }

  const content = await ctx.client.files.content(material.fileId, {
    agentId: ctx.agentId,
    sessionId: ctx.agentSessionId,
    includeImageUrls: true,
    includeDownloadUrl: true,
    maxChars: 1,
  });
  const sourceUrl = resolveEducatorCopilotImageUrl(content.data);
  if (!sourceUrl) {
    throw new Error(
      `Attachment “${material.name}” has no downloadable image source.`,
    );
  }
  const source = await fetch(sourceUrl);
  if (!source.ok) {
    throw new Error(
      `Could not download attachment “${material.name}” (${source.status}).`,
    );
  }
  const responseType = source.headers.get("content-type") || "";
  const mimeType = responseType.startsWith("image/")
    ? responseType
    : material.type;
  if (!mimeType.startsWith("image/")) {
    throw new Error(
      `Attachment “${material.name}” did not resolve to an image.`,
    );
  }
  const data = Buffer.from(await source.arrayBuffer());
  if (!data.length || data.length > 20 * 1024 * 1024) {
    throw new Error(
      `Attachment “${material.name}” has an unsupported image size.`,
    );
  }
  return uploadCourseMediaToS3({
    file: { name: material.name, type: mimeType },
    data,
    keyPrefix: "course-media/copilot-content",
  });
}

async function toolExperienceWrite(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const experienceId = cleanString(args.experienceId);
  const baseVersion = toIndex(args.baseVersion);
  if (
    !experienceId ||
    !Types.ObjectId.isValid(experienceId) ||
    baseVersion === null
  ) {
    return {
      error:
        "experienceId and the current baseVersion from get_experience are required.",
    };
  }
  const project = await findManagedExperience(ctx.user, experienceId);
  if (!project) {
    return {
      error: "Experience not found or it does not belong to a managed course.",
    };
  }
  if (project.draftVersion !== baseVersion) {
    return {
      error: `The experience changed after it was read (current draftVersion ${project.draftVersion}). Call get_experience again before editing.`,
    };
  }

  let document;
  try {
    document = normalizeExperienceDocument(args.document, { publish: true });
  } catch (error) {
    return {
      error: `The proposed world failed deterministic validation: ${
        error instanceof Error ? error.message : "invalid experience document"
      }. Repair the complete document and call update_experience_world again.`,
    };
  }
  const before = normalizeExperienceDocument(project.draft);
  const impact = describeExperienceCopilotImpact(before, document);
  const action: Extract<
    EducatorCopilotAction,
    { type: "update_experience_world" }
  > = {
    id: randomUUID(),
    type: "update_experience_world",
    label: `Update immersive world “${document.world.title}”`,
    courseSlug: project.courseSlug,
    experienceId,
    baseVersion,
    document,
    reason:
      cleanString(args.reason) ||
      "Validated world, stage, story, and interaction update.",
    preview: formatExperienceImpact(impact),
    status: "proposed",
    safety: "content_write",
  };

  if (ctx.actionMode === "auto") {
    const applied = await applyEducatorCopilotAction({
      user: ctx.user,
      action,
    });
    ctx.recordAction(applied);
    return {
      status: applied.status,
      detail: applied.result,
      studioHref: `/educator/experience-studio/${experienceId}`,
      note:
        applied.status === "applied"
          ? "The validated world edit was applied in auto mode."
          : "The world edit could not be applied.",
    };
  }

  ctx.recordAction(action);
  return {
    status: "proposed",
    actionLabel: action.label,
    impact: action.preview,
    studioHref: `/educator/experience-studio/${experienceId}`,
    note: "Manual mode: the complete validated world edit is queued for educator approval. Do not claim it is already applied.",
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
      | "create_skill_path"
      | "update_skill_path"
      | "update_skill_challenge"
      | "create_live_session";
  }
>;

function buildContentAction(
  name: string,
  args: Record<string, unknown>,
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

  if (name === "create_live_session") {
    const title = cleanString(args.title);
    const activities = normalizeActivities(args.activities);
    if (!title || !activities.length) return null;
    const pace = args.pace === "learner" ? "learner" : "facilitator";
    const access =
      args.access === "open" || args.access === "invited"
        ? args.access
        : "enrolled";
    return {
      ...base,
      type: "create_live_session",
      label: `Create live session “${title}”`,
      courseSlug,
      session: {
        title,
        description: cleanString(args.description),
        pace,
        access,
        activities,
      },
      preview: activities
        .map(
          (activity, index) =>
            `${index + 1}. ${activity.title} · ${activity.type}${
              activity.estimatedMinutes
                ? ` · ${activity.estimatedMinutes} min`
                : ""
            }`,
        )
        .join("\n"),
    };
  }

  if (name === "update_lesson") {
    const patch = sanitizeLessonPatch(args.patch);
    const moduleIndex = toIndex(args.moduleIndex);
    const lessonIndex = toIndex(args.lessonIndex);
    if (
      moduleIndex === null ||
      lessonIndex === null ||
      !Object.keys(patch).length
    )
      return null;
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
    const lessons = (
      Array.isArray(moduleInput.lessons) ? moduleInput.lessons : []
    )
      .map(sanitizeLessonDraft)
      .filter((lesson): lesson is EducatorCopilotLessonDraft =>
        Boolean(lesson),
      );
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
      preview: lessons
        .map((lesson, i) => `${i + 1}. ${lesson.title}`)
        .join("\n"),
    };
  }

  if (name === "update_module") {
    const input =
      args.patch && typeof args.patch === "object"
        ? (args.patch as Record<string, unknown>)
        : {};
    const patch: { title?: string; description?: string; assignment?: string } =
      {};
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
    const patch: Extract<
      EducatorCopilotAction,
      { type: "update_course_overview" }
    >["patch"] = {};
    for (const key of [
      "tagline",
      "description",
      "longDescription",
      "duration",
    ] as const) {
      const value = cleanString(input[key]);
      if (value !== undefined) patch[key] = value;
    }
    const level = cleanString(input.level);
    if (
      level === "beginner" ||
      level === "intermediate" ||
      level === "advanced"
    ) {
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

  if (name === "create_skill_path") {
    const skillPath = sanitizeSkillPathDraft(args.skillPath, {
      requireChallenges: true,
    });
    if (!skillPath) return null;
    return {
      ...base,
      type: "create_skill_path",
      label: `Create skill path “${skillPath.title}” (${skillPath.challenges.length} challenge${skillPath.challenges.length === 1 ? "" : "s"})`,
      courseSlug,
      skillPath,
      preview: [
        skillPath.enabled ? "Published to learners" : "Saved as unpublished",
        skillPath.coverUrl ? "Banner image included" : "No banner image",
        ...skillPath.challenges.map(
          (challenge, index) =>
            `${index + 1}. ${challenge.title}${challenge.assetUrl ? " · image included" : ""}`,
        ),
      ]
        .join("\n")
        .slice(0, 1200),
    };
  }

  if (name === "update_skill_path") {
    const skillPackSlug = cleanString(args.skillPackSlug);
    const patch = sanitizeSkillPathPatch(args.patch);
    if (!skillPackSlug || !Object.keys(patch).length) return null;
    return {
      ...base,
      type: "update_skill_path",
      label: `Update skill path${patch.title ? `: ${patch.title}` : ` ${skillPackSlug}`}`,
      courseSlug,
      skillPackSlug,
      patch,
      preview: previewSkillPathPatch(patch),
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
    return {
      error:
        "href must be an in-app path (e.g. /educator/courses/<slug>/content).",
    };
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
      item.label.toLowerCase().includes(target),
    );
    selector = match?.selector;
    if (!selector) {
      return {
        error: `No element labeled like "${args.target}" on the current page.`,
        visibleTargets: (ctx.pageContext?.uiMap || [])
          .slice(0, 40)
          .map((item) => item.label),
      };
    }
  }
  if (!selector)
    return { error: "Provide target (visible label) or selector." };
  const action: EducatorCopilotAction = {
    id: randomUUID(),
    type: "highlight",
    label: cleanString(args.target)
      ? `Highlight "${args.target}"`
      : "Highlight on page",
    selector,
    reason: cleanString(args.reason),
    status: "proposed",
    safety: "client_safe",
  };
  ctx.recordAction(action);
  return { status: ctx.actionMode === "auto" ? "highlighting" : "proposed" };
}

async function toolRemember(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  const content = cleanString(args.content);
  if (!content) return { error: "content is required." };
  if (!ctx.client || !ctx.agentId)
    return { error: "Memory is unavailable right now." };
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

async function toolRecallMemories(
  ctx: CopilotToolContext,
  args: Record<string, unknown>,
) {
  if (!ctx.client || !ctx.agentId)
    return { error: "Memory is unavailable right now." };
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
    return {
      ...action,
      status: "applied",
      result: "Client-side action ready.",
    };
  }
  if (action.safety === "sensitive_blocked") {
    return {
      ...action,
      status: "blocked",
      result: "This action is outside the copilot's allowed permissions.",
    };
  }

  if (action.type === "update_experience_world") {
    try {
      const project = await findManagedExperience(user, action.experienceId);
      if (!project) {
        return {
          ...action,
          status: "failed",
          result: "Experience not found.",
        };
      }
      if (project.draftVersion !== action.baseVersion) {
        return {
          ...action,
          status: "failed",
          result:
            "The experience changed after this proposal was created. Ask the copilot to reread it and prepare a fresh edit.",
        };
      }
      const document = normalizeExperienceDocument(action.document, {
        publish: true,
      });
      project.draft = document;
      project.title = document.title;
      project.description = document.description;
      project.draftVersion += 1;
      project.updatedBy = new Types.ObjectId(user.id);
      project.markModified("draft");
      await project.save();
      return {
        ...action,
        status: "applied",
        result: `Updated “${document.world.title}” as draft v${project.draftVersion}.`,
      };
    } catch (error) {
      return {
        ...action,
        status: "failed",
        result:
          error instanceof Error
            ? error.message
            : "The world edit could not be saved.",
      };
    }
  }

  const course = await findManagedCourse(user, action.courseSlug);
  if (!course) {
    return { ...action, status: "failed", result: "Course not found." };
  }

  try {
    if (action.type === "create_live_session") {
      let joinCode = createJoinCode();
      while (await LiveSession.exists({ joinCode }))
        joinCode = createJoinCode();
      const liveSession = await LiveSession.create({
        ...action.session,
        courseId: course._id,
        courseSlug: course.slug,
        joinCode,
        settings: {
          allowLateJoin: true,
          showParticipantNames: false,
          showLeaderboard: false,
          learnerCopilot: {
            enabled: true,
            explainCurrentActivity: true,
            coachResponses: true,
            useCourseMaterials: true,
            giveDirectExplanations: false,
          },
        },
        createdBy: user.id,
      });
      return {
        ...action,
        status: "applied",
        result: `Created the live session. Review and facilitate it at /educator/courses/${course.slug}/live/${String(liveSession._id)}.`,
      };
    }
    switch (action.type) {
      case "update_course_lesson": {
        const modules = Array.isArray(course.modules) ? course.modules : [];
        const lesson =
          modules[action.moduleIndex]?.lessons?.[action.lessonIndex];
        if (!lesson)
          return { ...action, status: "failed", result: "Lesson not found." };
        Object.assign(lesson, action.patch);
        course.modules = modules;
        recountCourse(course);
        break;
      }
      case "add_lesson": {
        const modules = Array.isArray(course.modules) ? course.modules : [];
        const courseModule = modules[action.moduleIndex];
        if (!courseModule)
          return { ...action, status: "failed", result: "Module not found." };
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
          action.position != null &&
          action.position >= 0 &&
          action.position <= modules.length
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
        if (!courseModule)
          return { ...action, status: "failed", result: "Module not found." };
        Object.assign(courseModule, action.patch);
        course.modules = modules;
        break;
      }
      case "update_course_overview": {
        Object.assign(course, action.patch);
        break;
      }
      case "create_skill_path": {
        const existingPacks = [
          ...(course.skillPack ? [course.skillPack] : []),
          ...((course.skillPacks as SkillPack[]) || []),
        ];
        if (
          existingPacks.some(
            (pack) =>
              pack.slug === action.skillPath.slug ||
              pack.title?.toLowerCase() ===
                action.skillPath.title.toLowerCase(),
          )
        ) {
          return {
            ...action,
            status: "failed",
            result:
              "A skill path with this slug or title already exists in the course. Read the course again and update that path instead.",
          };
        }
        if (
          action.skillPath.slug &&
          (await skillPathSlugExists(action.skillPath.slug, course._id))
        ) {
          return {
            ...action,
            status: "failed",
            result:
              "That skill-path slug is already used by another course. Choose a distinct slug and retry.",
          };
        }
        course.skillPacks = [
          ...((course.skillPacks as SkillPack[]) || []),
          action.skillPath,
        ];
        course.markModified("skillPacks");
        break;
      }
      case "update_skill_path": {
        const primary = course.skillPack as SkillPack | undefined;
        const additional = (course.skillPacks as SkillPack[]) || [];
        const pack =
          (primary &&
          (primary.slug === action.skillPackSlug ||
            (!primary.slug && action.skillPackSlug === course.slug))
            ? primary
            : undefined) ||
          additional.find(
            (candidate) => candidate.slug === action.skillPackSlug,
          );
        if (!pack) {
          return {
            ...action,
            status: "failed",
            result: "Skill path not found.",
          };
        }
        if (
          action.patch.slug &&
          action.patch.slug !== pack.slug &&
          ([primary, ...additional].some(
            (candidate) =>
              candidate &&
              candidate !== pack &&
              candidate.slug === action.patch.slug,
          ) ||
            (await skillPathSlugExists(action.patch.slug, course._id)))
        ) {
          return {
            ...action,
            status: "failed",
            result:
              "That skill-path slug is already used by another course. Choose a distinct slug and retry.",
          };
        }
        Object.assign(pack, action.patch);
        course.markModified("skillPack");
        course.markModified("skillPacks");
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
          packs.find((p) =>
            p.challenges?.some((c) => c.id === action.challengeId),
          );
        const challenge = pack?.challenges?.find(
          (c) => c.id === action.challengeId,
        );
        if (!pack || !challenge) {
          return {
            ...action,
            status: "failed",
            result: "Challenge not found.",
          };
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
      result:
        error instanceof Error
          ? error.message
          : "The change could not be saved.",
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
    case "create_skill_path":
      return `Created skill path “${action.skillPath.title}” with ${action.skillPath.challenges.length} challenge(s).`;
    case "update_skill_path":
      return "Skill path updated.";
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

async function skillPathSlugExists(slug: string, currentCourseId: unknown) {
  return Boolean(
    await Course.exists({
      _id: { $ne: currentCourseId },
      $or: [{ slug }, { "skillPack.slug": slug }, { "skillPacks.slug": slug }],
    }),
  );
}

async function findManagedExperience(user: CopilotUser, experienceId: string) {
  const project = await ExperienceProject.findById(experienceId);
  if (!project) return null;
  const course = await Course.exists({
    _id: project.courseId,
    ...managedFilter(user),
  });
  return course ? project : null;
}

function recountCourse(course: {
  modules?: Array<{ lessons?: unknown[] }>;
  lessonsCount?: number;
  modulesCount?: number;
}) {
  const modules = course.modules || [];
  course.modulesCount = modules.length;
  course.lessonsCount = modules.reduce(
    (sum, mod) => sum + (mod.lessons?.length || 0),
    0,
  );
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
    (prefix) =>
      href === prefix ||
      href.startsWith(`${prefix}/`) ||
      href.startsWith(`${prefix}?`),
  );
}

function sanitizeLessonPatch(value: unknown) {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const patch: Partial<EducatorCopilotLessonDraft> = {};
  for (const key of [
    "title",
    "duration",
    "description",
    "assetUrl",
    "assetAlt",
  ] as const) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  if (typeof input.isFree === "boolean") patch.isFree = input.isFree;
  return patch;
}

function sanitizeLessonDraft(
  value: unknown,
): EducatorCopilotLessonDraft | null {
  const patch = sanitizeLessonPatch(value);
  if (!patch.title) return null;
  return { ...patch, title: patch.title };
}

function sanitizeSkillChallengePatch(value: unknown) {
  const input = asRecord(value);
  const patch: Partial<Omit<SkillChallenge, "id" | "day">> = {};
  for (const key of [
    "title",
    "shortTitle",
    "assetUrl",
    "assetAlt",
    "accentColor",
    "hook",
    "lesson",
    "microTask",
  ] as const) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  for (const key of ["minutes", "points", "streakBoost"] as const) {
    const next = nonNegativeInteger(input[key]);
    if (next !== undefined && (key !== "minutes" || next > 0))
      patch[key] = next;
  }
  const audioCue = cleanString(input.audioCue);
  if (audioCue === "spark" || audioCue === "focus" || audioCue === "complete") {
    patch.audioCue = audioCue;
  }
  if (Array.isArray(input.keyIdeas)) {
    patch.keyIdeas = input.keyIdeas
      .map((idea) => cleanString(idea))
      .filter((idea): idea is string => Boolean(idea))
      .slice(0, 8);
  }
  if (Array.isArray(input.questions)) {
    patch.questions = input.questions
      .map(sanitizeSkillQuestion)
      .filter((question): question is SkillQuestion => Boolean(question));
  }
  return patch;
}

function sanitizeSkillQuestion(
  value: unknown,
  index = 0,
): SkillQuestion | null {
  const input = asRecord(value);
  const prompt = cleanString(input.prompt);
  const options = Array.isArray(input.options)
    ? input.options
        .map((option) => cleanString(option))
        .filter((option): option is string => Boolean(option))
        .slice(0, 8)
    : [];
  const answerIndex = toIndex(input.answerIndex);
  if (
    !prompt ||
    options.length < 2 ||
    answerIndex === null ||
    answerIndex >= options.length
  ) {
    return null;
  }
  return {
    id: cleanString(input.id) || `q${index + 1}`,
    prompt,
    options,
    answerIndex,
    explanation: cleanString(input.explanation),
  };
}

function sanitizeSkillChallengeDraft(
  value: unknown,
  index: number,
): SkillChallenge | null {
  const input = asRecord(value);
  const title = cleanString(input.title);
  const lesson = cleanString(input.lesson);
  if (!title || !lesson) return null;
  const patch = sanitizeSkillChallengePatch(input);
  return {
    id: cleanString(input.id) || `day-${index + 1}`,
    day: index + 1,
    title,
    minutes: patch.minutes || 6,
    points: patch.points ?? 60,
    streakBoost: patch.streakBoost ?? 1,
    shortTitle: patch.shortTitle,
    assetUrl: patch.assetUrl,
    assetAlt: patch.assetAlt,
    accentColor: patch.accentColor || "#B8F56D",
    audioCue: patch.audioCue || "focus",
    hook: patch.hook,
    lesson,
    keyIdeas: patch.keyIdeas || [],
    microTask: patch.microTask,
    questions: patch.questions || [],
  };
}

function sanitizeSkillPathDraft(
  value: unknown,
  options: { requireChallenges: boolean },
): SkillPack | null {
  const input = asRecord(value);
  const title = cleanString(input.title);
  if (!title) return null;
  const challenges = (Array.isArray(input.challenges) ? input.challenges : [])
    .map(sanitizeSkillChallengeDraft)
    .filter((challenge): challenge is SkillChallenge => Boolean(challenge));
  if (options.requireChallenges && !challenges.length) return null;
  const usedIds = new Set<string>();
  for (const [index, challenge] of challenges.entries()) {
    const baseId = safeSlug(challenge.id) || `day-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    challenge.id = id;
    challenge.day = index + 1;
    usedIds.add(id);
  }
  return {
    slug: safeSlug(cleanString(input.slug) || title),
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    title,
    subtitle: cleanString(input.subtitle),
    coverUrl: cleanString(input.coverUrl),
    learnerPromise: cleanString(input.learnerPromise),
    challenges,
  };
}

function sanitizeSkillPathPatch(value: unknown) {
  const input = asRecord(value);
  const patch: Extract<
    EducatorCopilotAction,
    { type: "update_skill_path" }
  >["patch"] = {};
  for (const key of [
    "title",
    "subtitle",
    "coverUrl",
    "learnerPromise",
  ] as const) {
    const next = cleanString(input[key]);
    if (next !== undefined) patch[key] = next;
  }
  const slug = cleanString(input.slug);
  if (slug) patch.slug = safeSlug(slug);
  if (typeof input.enabled === "boolean") patch.enabled = input.enabled;
  if (Array.isArray(input.challenges)) {
    patch.challenges = input.challenges
      .map(sanitizeSkillChallengeDraft)
      .filter((challenge): challenge is SkillChallenge => Boolean(challenge));
  }
  return patch;
}

function previewSkillPathPatch(
  patch: Extract<EducatorCopilotAction, { type: "update_skill_path" }>["patch"],
) {
  const metadata = Object.entries(patch)
    .filter(([key]) => key !== "challenges")
    .map(([key, value]) => `${key}: ${String(value)}`);
  if (patch.challenges) {
    metadata.push(
      `Challenges (${patch.challenges.length}):`,
      ...patch.challenges.map(
        (challenge, index) => `${index + 1}. ${challenge.title}`,
      ),
    );
  }
  return metadata.join("\n").slice(0, 1200);
}

function previewFromPatch(patch: Record<string, unknown>) {
  return Object.entries(patch)
    .map(([key, value]) => {
      const text = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
      return `${key}: ${text.length > 220 ? `${text.slice(0, 220)}…` : text}`;
    })
    .join("\n")
    .slice(0, 900);
}

function formatExperienceImpact(
  impact: ReturnType<typeof describeExperienceCopilotImpact>,
) {
  const rows: string[] = [];
  for (const [key, value] of Object.entries(impact)) {
    const label = key.slice(0, 1).toUpperCase() + key.slice(1);
    if (value.added.length) {
      rows.push(`${label} added: ${value.added.join(", ")}`);
    }
    if (value.modified.length) {
      rows.push(`${label} changed: ${value.modified.join(", ")}`);
    }
    if (value.removed.length) {
      rows.push(`${label} removed: ${value.removed.join(", ")}`);
    }
  }
  return rows.join("\n").slice(0, 1200) || "World metadata updated.";
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function nonNegativeInteger(value: unknown) {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0)
    return undefined;
  return Math.floor(num);
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
