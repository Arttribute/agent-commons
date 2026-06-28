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

const googleConnectorTools: Record<string, string[]> = {
  google_calendar: [
    "google_calendar_list_events",
    "google_calendar_create_event",
  ],
  gmail: ["google_gmail_search_messages", "google_gmail_get_message"],
  google_drive: ["google_drive_search_files"],
  google_sheets: ["google_sheets_get_values"],
};

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
    skillInstructions?: Record<string, string>;
    tools?: string[];
    taskTitle?: string;
    message?: string;
  };
  sandboxState?: Record<string, unknown>;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { slug } = await params;
  const challengeId = request.nextUrl.searchParams.get("challengeId");
  if (!challengeId) {
    return NextResponse.json({ error: "challengeId is required." }, { status: 400 });
  }

  await connectDB();
  const course = await findSandboxCourse(slug);
  const pack = course ? findSkillPackBySlug(course, slug) : null;
  const challenge = pack?.challenges?.find((item) => item.id === challengeId);
  if (!course || !challenge?.sandbox?.enabled) {
    return NextResponse.json({ error: "Sandbox challenge not found." }, { status: 404 });
  }

  const enrollment = await ensureSandboxEnrollment({
    userId: session.user.id,
    course,
  });
  if (!enrollment) {
    return NextResponse.json(
      { error: "Enroll in this course before using the sandbox." },
      { status: 403 }
    );
  }

  const state = mapLikeGet(enrollment.sandboxStates, challengeId) || null;
  return NextResponse.json({ state });
}

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
    findSandboxCourse(slug),
  ]);

  const pack = course ? findSkillPackBySlug(course, slug) : null;
  const challenge = pack?.challenges?.find(
    (item) => item.id === body.challengeId
  );
  if (!course || !challenge?.sandbox?.enabled) {
    return NextResponse.json({ error: "Sandbox challenge not found." }, { status: 404 });
  }

  const enrollment = await ensureSandboxEnrollment({
    userId: session.user.id,
    course,
  });
  if (!enrollment && !course.isFree) {
    return NextResponse.json(
      { error: "Enroll in this course before using the sandbox." },
      { status: 403 }
    );
  }
  if (!enrollment) {
    return NextResponse.json(
      { error: "Could not create sandbox progress for this enrollment." },
      { status: 500 }
    );
  }

  const validation = validateSandboxAgent(challenge.sandbox, body.agent);
  if (validation) {
    return NextResponse.json({ error: validation }, { status: 422 });
  }

  const client = getAgentCommonsClient(session.accessToken);

  if (!user?.identityUserId) {
    return NextResponse.json(
      {
        error:
          "Your CommonLab account is not linked to Commons Identity yet. Sign out and sign back in before creating an agent.",
      },
      { status: 409 }
    );
  }

  if (!client) {
    return NextResponse.json(
      {
        error:
          "Your session cannot reach Agent Commons yet. Sign out and sign back in so CommonLab can request agent permissions.",
      },
      { status: 503 }
    );
  }

  const instructions = buildInstructions(challenge.sandbox, body.agent);
  const createPayload = {
    name: body.agent.name.trim(),
    persona: body.agent.persona?.trim(),
    instructions,
    owner: user.identityUserId,
    ownerUserId: user.identityUserId,
    workspaceId: user.identityWorkspaceId,
    modelProvider: "openai",
    modelId: process.env.AGENT_LEARNER_SANDBOX_MODEL || "gpt-4o-mini",
    metadata: {
      source: "commonlab_skill_sandbox",
      courseSlug: course.slug,
      skillSlug: slug,
      challengeId: challenge.id,
    },
  } as Parameters<typeof client.agents.create>[0] & Record<string, unknown>;
  const created = await client.agents.create(createPayload);
  const agentId = created.data.agentId;
  const toolAssignments = await assignSelectedPlatformTools({
    client,
    agentId,
    config: challenge.sandbox,
    selectedToolIds: body.agent.tools || [],
  });

  await trackAnalyticsEvent({
    eventType: challenge.sandbox.completionEventType || "agent_sandbox_completed",
    userId: session.user.id,
    courseId: course._id,
    courseSlug: course.slug,
    page: "skills",
    metadata: {
      challengeId: challenge.id,
      agentId,
      simulated: false,
      selectedSkills: body.agent.skills || [],
      selectedTools: body.agent.tools || [],
      assignedPlatformTools: toolAssignments.assigned,
      toolAssignmentWarnings: toolAssignments.warnings,
      creditReward: challenge.sandbox.creditReward || 0,
    },
    request,
  });

  await saveSandboxState({
    enrollmentId: enrollment._id,
    challengeId: challenge.id,
    state: {
      ...(body.sandboxState || {}),
      createdAgentId: agentId,
      creditReward: challenge.sandbox.creditReward || 0,
      updatedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    agentId,
    simulated: false,
    assignedTools: toolAssignments.assigned,
    toolWarnings: toolAssignments.warnings,
    creditReward: challenge.sandbox.creditReward || 0,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await request.json()) as SandboxBody & { agentId?: string };
  if (!body.agentId || !body.challengeId || !body.agent?.name || !body.agent.systemPrompt) {
    return NextResponse.json(
      { error: "agentId, challengeId, agent.name, and agent.systemPrompt are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const [user, course] = await Promise.all([
    User.findById(session.user.id)
      .select("identityUserId identityWorkspaceId")
      .lean<{ identityUserId?: string; identityWorkspaceId?: string }>(),
    findSandboxCourse(slug),
  ]);
  const pack = course ? findSkillPackBySlug(course, slug) : null;
  const challenge = pack?.challenges?.find(
    (item) => item.id === body.challengeId
  );
  if (!course || !challenge?.sandbox?.enabled) {
    return NextResponse.json({ error: "Sandbox challenge not found." }, { status: 404 });
  }
  if (!user?.identityUserId) {
    return NextResponse.json(
      { error: "Your CommonLab account is not linked to Commons Identity yet." },
      { status: 409 }
    );
  }

  const client = getAgentCommonsClient(session.accessToken);
  if (!client) {
    return NextResponse.json(
      { error: "Your session cannot reach Agent Commons yet. Sign out and sign back in so CommonLab can request agent permissions." },
      { status: 503 }
    );
  }

  const agent = await client.agents.get(body.agentId);
  const ownerUserId = (agent.data as { ownerUserId?: string }).ownerUserId;
  const legacyOwner = (agent.data as { owner?: string }).owner;
  if (ownerUserId !== user.identityUserId && legacyOwner !== user.identityUserId) {
    return NextResponse.json(
      { error: "This sandbox agent belongs to a different account." },
      { status: 403 }
    );
  }

  const instructions = buildInstructions(challenge.sandbox, body.agent);
  await client.agents.update(body.agentId, {
    name: body.agent.name.trim(),
    persona: body.agent.persona?.trim(),
    instructions,
  });
  const toolAssignments = await assignSelectedPlatformTools({
    client,
    agentId: body.agentId,
    config: challenge.sandbox,
    selectedToolIds: body.agent.tools || [],
  });

  const enrollment = await ensureSandboxEnrollment({
    userId: session.user.id,
    course,
  });
  if (enrollment && body.sandboxState) {
    await saveSandboxState({
      enrollmentId: enrollment._id,
      challengeId: challenge.id,
      state: {
        ...body.sandboxState,
        createdAgentId: body.agentId,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({
    agentId: body.agentId,
    assignedTools: toolAssignments.assigned,
    toolWarnings: toolAssignments.warnings,
  });
}

function findSandboxCourse(slug: string) {
  return Course.findOne({
    published: true,
    $or: [{ slug }, { "skillPack.slug": slug }, { "skillPacks.slug": slug }],
  })
    .select("_id title slug isFree skillPack skillPacks")
    .lean<SandboxCourse | null>();
}

async function ensureSandboxEnrollment({
  userId,
  course,
}: {
  userId: string;
  course: SandboxCourse;
}) {
  const enrollment = await Enrollment.findOne({
    userId,
    courseId: course._id,
  }).select("_id sandboxStates");
  if (enrollment || !course.isFree) return enrollment;
  return Enrollment.create({
    userId,
    courseId: course._id,
    status: "active",
    accessLevel: "full",
    paymentStatus: "free",
    accessSource: "free",
  });
}

async function saveSandboxState({
  enrollmentId,
  challengeId,
  state,
}: {
  enrollmentId: Types.ObjectId | string;
  challengeId: string;
  state: Record<string, unknown>;
}) {
  await Enrollment.updateOne(
    { _id: enrollmentId },
    {
      $set: {
        [`sandboxStates.${challengeId}`]: state,
      },
    }
  );
}

function mapLikeGet(value: unknown, key: string) {
  if (!value) return undefined;
  if (value instanceof Map) return value.get(key);
  if (typeof value === "object") {
    return (value as Record<string, unknown>)[key];
  }
  return undefined;
}

async function assignSelectedPlatformTools({
  client,
  agentId,
  config,
  selectedToolIds,
}: {
  client: NonNullable<ReturnType<typeof getAgentCommonsClient>>;
  agentId: string;
  config: AgentSandboxConfig;
  selectedToolIds: string[];
}) {
  const selected = new Set(selectedToolIds);
  const toolNames = new Set<string>();
  for (const tool of config.toolTemplates || []) {
    if (!selected.has(tool.id) || !tool.connectorKind) continue;
    for (const name of googleConnectorTools[tool.connectorKind] || []) {
      toolNames.add(name);
    }
  }

  const assigned: string[] = [];
  const warnings: string[] = [];
  const currentAssignments = await client.agents
    .listTools(agentId)
    .then((result) => result.data || [])
    .catch(() => []);
  const currentToolIds = new Set(
    currentAssignments
      .map((assignment) => (assignment as { toolId?: string }).toolId)
      .filter(Boolean)
  );
  for (const toolName of toolNames) {
    try {
      const tool = await client.tools.get(toolName);
      const toolId = tool.data.toolId;
      if (currentToolIds.has(toolId)) {
        continue;
      }
      await client.agents.addTool(agentId, {
        toolId,
        usageComments:
          "Selected by a learner in a CommonLab agent creation sandbox.",
      });
      assigned.push(toolName);
    } catch {
      warnings.push(
        `Could not attach ${toolName}. Run the Google Workspace tools migration in Agent Commons.`
      );
    }
  }
  return { assigned, warnings };
}

function validateSandboxAgent(
  config: AgentSandboxConfig,
  agent: NonNullable<SandboxBody["agent"]>
) {
  if ((agent.name?.trim().length || 0) < 2) return "Give the agent a clear name.";
  if ((agent.systemPrompt?.trim().length || 0) < 40) {
    return "Write a system prompt with at least 40 characters.";
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
    .map((skill) => {
      const instructions =
        agent.skillInstructions?.[skill!.id]?.trim() || skill!.instructions;
      return `Skill: ${skill!.name}\n${instructions}`;
    });
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
    "This agent was created from a CommonLab learning sandbox. Use connected tools only when the user has explicitly connected and authorized them.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
