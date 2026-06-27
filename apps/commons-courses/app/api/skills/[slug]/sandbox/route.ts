import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getAgentCommonsClient } from "@/lib/agent-commons";
import { trackAnalyticsEvent } from "@/lib/analytics";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import User from "@/models/User";
import { findSkillPackBySlug } from "@/lib/skill-paths";
import type { AgentSandboxConfig, SkillPack } from "@/types/skills";
import type { Types } from "mongoose";

type SandboxCourse = {
  _id: Types.ObjectId;
  slug: string;
  title: string;
  isFree?: boolean;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

type SandboxBody = {
  challengeId?: string;
  agent?: {
    name?: string;
    persona?: string;
    systemPrompt?: string;
    skills?: string[];
    tools?: string[];
    taskTitle?: string;
    message?: string;
  };
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await request.json()) as SandboxBody;
  if (!body.challengeId || !body.agent?.name || !body.agent.systemPrompt) {
    return NextResponse.json(
      { error: "challengeId, agent.name, and agent.systemPrompt are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const [user, course] = await Promise.all([
    User.findById(session.user.id)
      .select("identityUserId identityWorkspaceId")
      .lean<{ identityUserId?: string; identityWorkspaceId?: string }>(),
    Course.findOne({
      published: true,
      $or: [{ slug }, { "skillPack.slug": slug }, { "skillPacks.slug": slug }],
    })
      .select("_id title slug isFree skillPack skillPacks")
      .lean<SandboxCourse | null>(),
  ]);

  const pack = course ? findSkillPackBySlug(course, slug) : null;
  const challenge = pack?.challenges?.find(
    (item) => item.id === body.challengeId
  );
  if (!course || !challenge?.sandbox?.enabled) {
    return NextResponse.json({ error: "Sandbox challenge not found." }, { status: 404 });
  }

  const enrollment = await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  }).select("_id");
  if (!enrollment && !course.isFree) {
    return NextResponse.json(
      { error: "Enroll in this course before using the sandbox." },
      { status: 403 }
    );
  }

  const validation = validateSandboxAgent(challenge.sandbox, body.agent);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 422 });
  }

  const client = getAgentCommonsClient();
  let agentId: string | undefined;
  let simulated = true;

  if (client && user?.identityUserId) {
    const instructions = buildInstructions(challenge.sandbox, body.agent);
    const created = await client.agents.create({
      name: body.agent.name.trim(),
      persona: body.agent.persona?.trim(),
      instructions,
      owner: user.identityUserId,
      modelProvider: "openai",
      modelId: process.env.AGENT_LEARNER_SANDBOX_MODEL || "gpt-4o-mini",
    });
    agentId = created.data.agentId;
    simulated = false;
  }

  await trackAnalyticsEvent({
    eventType: challenge.sandbox.completionEventType || "agent_sandbox_completed",
    userId: session.user.id,
    courseId: course._id,
    courseSlug: course.slug,
    page: "skills",
    metadata: {
      challengeId: challenge.id,
      agentId,
      simulated,
      selectedSkills: body.agent.skills || [],
      selectedTools: body.agent.tools || [],
      creditReward: challenge.sandbox.creditReward || 0,
    },
    request,
  });

  return NextResponse.json({
    agentId,
    simulated,
    creditReward: challenge.sandbox.creditReward || 0,
  });
}

function validateSandboxAgent(
  config: AgentSandboxConfig,
  agent: NonNullable<SandboxBody["agent"]>
) {
  const required = new Set(config.requiredCapabilities || []);
  if ((agent.name?.trim().length || 0) < 2) return "Give the agent a clear name.";
  if ((agent.systemPrompt?.trim().length || 0) < 40) {
    return "Write a system prompt with at least 40 characters.";
  }
  if (required.has("skills") && !agent.skills?.length) {
    return "Select at least one skill for this lesson.";
  }
  if (required.has("tools") && !agent.tools?.length) {
    return "Select at least one tool or connector for this lesson.";
  }
  if (required.has("tasks") && !agent.taskTitle?.trim()) {
    return "Create the first task for the agent.";
  }
  if (required.has("chat") && !agent.message?.trim()) {
    return "Run the agent with a learner message.";
  }
  return "";
}

function buildInstructions(
  config: AgentSandboxConfig,
  agent: NonNullable<SandboxBody["agent"]>
) {
  const skillTemplates = new Map(
    (config.skillTemplates || []).map((skill) => [skill.id, skill])
  );
  const toolTemplates = new Map(
    (config.toolTemplates || []).map((tool) => [tool.id, tool])
  );
  const selectedSkills = (agent.skills || [])
    .map((id) => skillTemplates.get(id))
    .filter(Boolean)
    .map((skill) => `Skill: ${skill!.name}\n${skill!.instructions}`);
  const selectedTools = (agent.tools || [])
    .map((id) => toolTemplates.get(id))
    .filter(Boolean)
    .map((tool) => {
      const connector = tool!.connectorKind ? ` (${tool!.connectorKind})` : "";
      return `Tool: ${tool!.name}${connector}\n${tool!.description || "Use this tool when it is relevant."}`;
    });

  return [
    agent.systemPrompt?.trim(),
    agent.persona ? `Agent role: ${agent.persona.trim()}` : "",
    selectedSkills.length ? `\nSelected lesson skills:\n${selectedSkills.join("\n\n")}` : "",
    selectedTools.length ? `\nSelected lesson tools/connectors:\n${selectedTools.join("\n\n")}` : "",
    agent.taskTitle ? `\nFirst learner task: ${agent.taskTitle.trim()}` : "",
    "This agent was created from a CommonLab learning sandbox. Be transparent when a tool is simulated or not connected yet.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
