import { getAgentCommonsClient } from "@/lib/agent-commons";
import { agentSupportsRole } from "@/lib/course-agent-defaults";
import type { ScopedSearchResult } from "@/types/vector-search";
import type {
  CourseAgentConfig,
  CourseAgentMessage,
  CourseAgentViewContext,
} from "@/types/course-agent";

export type RuntimeCourse = {
  title: string;
  tagline?: string;
  modules?: Array<{
    title: string;
    assignment?: string;
    lessons?: Array<{ title: string; description?: string; isFree?: boolean }>;
  }>;
  agents?: CourseAgentConfig[];
};

type RuntimeInput = {
  course: RuntimeCourse;
  agent: CourseAgentConfig;
  role: "learner" | "educator";
  message: string;
  messages: CourseAgentMessage[];
  context: CourseAgentViewContext;
  searchResults?: ScopedSearchResult[];
  learnerProgress?: {
    completedLessons?: string[];
    progress?: number;
    accessLevel?: string;
  } | null;
};

export function findRunnableCourseAgent(
  agents: CourseAgentConfig[] | undefined,
  agentId: string,
  role: "learner" | "educator"
) {
  return agents?.find(
    (agent) => agent.id === agentId && agent.enabled && agentSupportsRole(agent, role)
  );
}

export async function runCourseAgent(input: RuntimeInput) {
  const client = getAgentCommonsClient();
  if (client && input.agent.agentCommonsAgentId) {
    const result = await client.run.once({
      agentId: input.agent.agentCommonsAgentId,
      messages: buildRunMessages(input),
      cliContext: JSON.stringify(
        {
          courseAgentPolicy: buildAgentPolicy(input),
          scopedCourseContext: buildScopedContext(input),
        },
        null,
        2
      ),
    });

    return extractRunReply(result) || fallbackCourseAgentReply(input);
  }

  return fallbackCourseAgentReply(input);
}

function fallbackCourseAgentReply(input: RuntimeInput) {
  const lesson =
    typeof input.context.moduleIndex === "number" &&
    typeof input.context.lessonIndex === "number"
      ? input.course.modules?.[input.context.moduleIndex]?.lessons?.[
          input.context.lessonIndex
        ]
      : null;
  const currentPlace = lesson
    ? `You are in "${lesson.title}" in ${input.course.title}.`
    : `You are in ${input.context.title || input.context.page} for ${input.course.title}.`;

  if (input.role === "learner") {
    return [
      currentPlace,
      "I can help you find the right lesson, clarify concepts, plan setup steps, or check your understanding.",
      input.agent.learningMode === "socratic"
        ? "I will use questions and hints before giving direct answers."
        : "I will guide you without doing graded work for you.",
    ].join(" ");
  }

  return [
    currentPlace,
    "I can help draft course material, reason about student participation, review assignments, and interpret course or payment activity available in this educator view.",
    "For actions such as filling forms or navigating, I will return a clear suggestion for this page first.",
  ].join(" ");
}

function buildRunMessages(input: RuntimeInput) {
  const system = [
    input.agent.instructions,
    "You are embedded in Commons Courses as a context-aware course assistant.",
    "Respect the supplied courseAgentPolicy and scopedCourseContext.",
    "For learners, teach through hints, explanations, retrieval, and setup help. Do not complete graded work or reveal hidden answers.",
    "For educators, support course delivery, analytics interpretation, course operations, and drafting within the configured action policy.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system" as const, content: system },
    ...input.messages,
  ];
}

function extractRunReply(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const candidates = [
    record.content,
    record.text,
    record.output,
    record.response,
    (record.data as Record<string, unknown> | undefined)?.content,
    (record.data as Record<string, unknown> | undefined)?.text,
    (record.data as Record<string, unknown> | undefined)?.output,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return null;
}

function buildAgentPolicy(input: RuntimeInput) {
  return {
    audience: input.agent.audience,
    dataScope: input.agent.dataScope,
    learningMode: input.agent.learningMode,
    actions: input.agent.actions,
    instructions: input.agent.instructions,
    privacy:
      input.role === "learner"
        ? "Never expose another learner's enrollment, progress, submissions, payments, grades, or messages."
        : "Only use learner-private data for educator-owned course operations.",
    academicIntegrity:
      "Support learning and setup. Do not complete graded assignments, fabricate completion, or provide hidden answer keys.",
  };
}

function buildScopedContext(input: RuntimeInput) {
  const base = {
    course: {
      title: input.course.title,
      tagline: input.course.tagline,
      modules:
        input.agent.dataScope === "course_overview"
          ? input.course.modules?.map((module) => ({ title: module.title }))
          : input.course.modules,
    },
    view: input.context,
    semanticSearchResults: input.searchResults || [],
  };

  if (input.role === "learner") {
    return {
      ...base,
      learnerProgress:
        input.agent.dataScope === "course_content_and_progress"
          ? input.learnerProgress
          : null,
    };
  }

  return base;
}
