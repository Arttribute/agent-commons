import { NextRequest, NextResponse } from "next/server";
import { getAgentCommonsClient } from "@/lib/agent-commons";
import { normalizeCourseAgents } from "@/lib/course-agent-defaults";
import { requireEducatorCourse } from "@/lib/educator-auth";
import type { CourseAgentConfig } from "@/types/course-agent";

type CreateAgentBody = {
  courseAgentId?: string;
  agent?: CourseAgentConfig;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) return result.error;

  const client = getAgentCommonsClient();
  if (!client) {
    return NextResponse.json(
      { error: "Agent Commons API key is not configured." },
      { status: 503 }
    );
  }

  const body = (await req.json()) as CreateAgentBody;
  if (!body.courseAgentId || !body.agent) {
    return NextResponse.json(
      { error: "courseAgentId and agent are required." },
      { status: 400 }
    );
  }

  const courseAgent = body.agent;
  const instructions = buildAgentInstructions({
    agent: courseAgent,
    courseTitle: result.course.title,
  });
  const created = await client.agents.create({
    name: `${result.course.title} - ${courseAgent.name}`,
    instructions,
    persona: courseAgent.audience === "learners"
      ? "A patient, principled course learning assistant."
      : "A concise, operational course delivery assistant.",
    modelProvider:
      (process.env.AGENT_COMMONS_DEFAULT_MODEL_PROVIDER as "openai") || "openai",
    modelId: process.env.AGENT_COMMONS_DEFAULT_MODEL_ID || "gpt-4o-mini",
    temperature: 0.3,
  });

  const agentCommonsAgentId = created.data.agentId;
  const agents = normalizeCourseAgents(result.course.agents).map((agent) =>
    agent.id === body.courseAgentId
      ? {
          ...agent,
          ...courseAgent,
          agentCommonsAgentId,
        }
      : agent
  );

  result.course.set({ agents });
  await result.course.save();

  return NextResponse.json({
    agentCommonsAgentId,
    agent: created.data,
    courseAgents: agents,
  });
}

function buildAgentInstructions({
  agent,
  courseTitle,
}: {
  agent: CourseAgentConfig;
  courseTitle: string;
}) {
  return [
    `You are "${agent.name}", a course assistant for "${courseTitle}".`,
    `Audience: ${agent.audience}.`,
    `Data scope: ${agent.dataScope}.`,
    `Learning mode: ${agent.learningMode}.`,
    `Allowed action modes: ${agent.actions.join(", ")}.`,
    "You receive course and page context from Commons Courses at runtime. Use only that scoped context and do not request or infer private data outside it.",
    "For learners, help them understand, find, set up, and practice. Do not complete graded work, leak answer keys, or bypass learning.",
    "Never reveal another learner's progress, submissions, payments, messages, grades, or feedback.",
    agent.instructions,
  ]
    .filter(Boolean)
    .join("\n\n");
}
