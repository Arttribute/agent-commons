import { getAgentCommonsClient } from "@/lib/agent-commons";
import type { CourseAgentMessage, CourseAgentViewContext } from "@/types/course-agent";
import type { ScopedSearchResult } from "@/types/vector-search";

type GeneralAgentInput = {
  message: string;
  messages: CourseAgentMessage[];
  context: CourseAgentViewContext;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string;
  };
  accessible: {
    learnerCourses: Array<{
      title: string;
      slug: string;
      progress?: number;
      href: string;
    }>;
    educatorCourses: Array<{
      title: string;
      slug: string;
      href: string;
      studentsHref: string;
      assignmentsHref: string;
      paymentsHref: string;
      analyticsHref: string;
    }>;
  };
  searchResults: Array<ScopedSearchResult & { courseTitle?: string; courseSlug?: string }>;
};

export async function runGeneralAgent(input: GeneralAgentInput) {
  const client = getAgentCommonsClient();
  const agentId = process.env.AGENT_COMMONS_GENERAL_AGENT_ID;

  if (client && agentId) {
    const result = await client.run.once({
      agentId,
      messages: [
        { role: "system", content: buildGeneralSystemPrompt() },
        ...input.messages,
      ],
      cliContext: JSON.stringify(
        {
          currentView: input.context,
          accessibleWorkspace: input.accessible,
          semanticSearchResults: input.searchResults,
          accessPolicy:
            "Only use the accessibleWorkspace and semanticSearchResults supplied here. Never claim access to hidden courses, another learner's private data, or educator-only data unless present in this context.",
        },
        null,
        2
      ),
    });

    return extractRunReply(result) || fallbackReply(input);
  }

  return fallbackReply(input);
}

function fallbackReply(input: GeneralAgentInput) {
  const query = input.message.toLowerCase();
  const learnerMatch = input.accessible.learnerCourses.find((course) =>
    query.includes(course.title.toLowerCase())
  );
  const educatorMatch = input.accessible.educatorCourses.find((course) =>
    query.includes(course.title.toLowerCase())
  );
  const match = learnerMatch || educatorMatch;

  if (match) {
    return `I found "${match.title}". You can open it here: ${match.href}`;
  }

  if (input.searchResults.length > 0) {
    const first = input.searchResults[0];
    return `I found "${first.title}" in ${first.courseTitle || "one of your courses"}. ${
      first.courseSlug ? `Open /courses/${first.courseSlug}` : ""
    }`;
  }

  return [
    "I can help you navigate your courses, assignments, progress, educator console, students, and payments.",
    input.accessible.learnerCourses.length
      ? `You are enrolled in ${input.accessible.learnerCourses.length} course(s).`
      : "",
    input.accessible.educatorCourses.length
      ? `You manage ${input.accessible.educatorCourses.length} course(s).`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildGeneralSystemPrompt() {
  return [
    "You are the CommonLab workspace assistant.",
    "Help users navigate and find things across only the courses and views they are allowed to access.",
    "Prefer links and concrete next actions. Be concise.",
    "Do not expose another learner's private information, submissions, grades, progress, payments, messages, or feedback.",
    "Educator-only details may be used only when they are included in the supplied scoped context.",
  ].join("\n");
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
