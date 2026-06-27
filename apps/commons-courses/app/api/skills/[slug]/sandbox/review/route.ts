import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { findSkillPackBySlug } from "@/lib/skill-paths";
import Course from "@/models/Course";
import type {
  AgentSandboxReviewTarget,
  SkillPack,
} from "@/types/skills";
import type { Types } from "mongoose";

type ReviewCourse = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

type ReviewBody = {
  challengeId?: string;
  target?: AgentSandboxReviewTarget;
  content?: string;
  context?: {
    agentName?: string;
    persona?: string;
    selectedSkills?: string[];
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
  const body = (await request.json()) as ReviewBody;
  if (!body.challengeId || !body.target || !body.content?.trim()) {
    return NextResponse.json(
      { error: "challengeId, target, and content are required." },
      { status: 400 }
    );
  }

  await connectDB();
  const course = await Course.findOne({
    published: true,
    $or: [{ slug }, { "skillPack.slug": slug }, { "skillPacks.slug": slug }],
  })
    .select("_id title slug skillPack skillPacks")
    .lean<ReviewCourse | null>();
  const pack = course ? findSkillPackBySlug(course, slug) : null;
  const challenge = pack?.challenges.find((item) => item.id === body.challengeId);
  const review = challenge?.sandbox?.review;
  if (!course || !pack || !challenge?.sandbox?.enabled || !review?.enabled) {
    return NextResponse.json({ error: "Review is not enabled." }, { status: 404 });
  }
  if (!review.targets.includes(body.target)) {
    return NextResponse.json({ error: "This target is not reviewable." }, { status: 422 });
  }

  const result = await reviewWithAi({
    target: body.target,
    content: body.content,
    rubric: review.rubric || defaultRubric(body.target),
    minScore: review.minScore || 70,
    model: review.model,
    context: body.context,
    accessToken: session.accessToken,
  });

  return NextResponse.json({ data: result });
}

async function reviewWithAi(input: {
  target: AgentSandboxReviewTarget;
  content: string;
  rubric: string;
  minScore: number;
  model?: string;
  context?: ReviewBody["context"];
  accessToken?: string;
}) {
  const agentCommonsReview = await reviewWithAgentCommons(input);
  if (agentCommonsReview) return agentCommonsReview;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return deterministicReview(input);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model || process.env.SANDBOX_REVIEW_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You review beginner agent-building work. Return only JSON with score, passed, summary, strengths, improvements, and nextRevision. Be specific, kind, and concise.",
          },
          {
            role: "user",
            content: JSON.stringify({
              target: input.target,
              minScore: input.minScore,
              rubric: input.rubric,
              context: input.context || {},
              learnerContent: input.content,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return deterministicReview(input);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    return normalizeReview(parsed, input);
  } catch {
    return deterministicReview(input);
  }
}

async function reviewWithAgentCommons(input: {
  target: AgentSandboxReviewTarget;
  content: string;
  rubric: string;
  minScore: number;
  context?: ReviewBody["context"];
  accessToken?: string;
}) {
  const reviewAgentId = process.env.SANDBOX_REVIEW_AGENT_ID;
  const baseUrl =
    process.env.COMMONS_API_URL ||
    process.env.AGENT_COMMONS_API_URL ||
    process.env.NEXT_PUBLIC_AGENT_COMMONS_API_URL;
  if (!reviewAgentId || !baseUrl || !input.accessToken) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/agents/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agentId: reviewAgentId,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              instruction:
                "Review this learner agent-building work. Return only JSON with score, passed, summary, strengths, improvements, and nextRevision.",
              target: input.target,
              minScore: input.minScore,
              rubric: input.rubric,
              context: input.context || {},
              learnerContent: input.content,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = extractText(data);
    const parsed = JSON.parse(text || "{}");
    return normalizeReview(parsed, input);
  } catch {
    return null;
  }
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

function deterministicReview(input: {
  target: AgentSandboxReviewTarget;
  content: string;
  rubric: string;
  minScore: number;
}) {
  const text = input.content.toLowerCase();
  const checks =
    input.target === "system_prompt"
      ? [
          ["persona", /you are|role|act as|assistant/.test(text)],
          ["goal", /help|create|plan|review|summarize|teach|support/.test(text)],
          ["boundaries", /do not|avoid|ask before|permission|never|must not/.test(text)],
          ["tool safety", /tool|calendar|gmail|drive|sheets|permission|when needed/.test(text)],
        ]
      : [
          ["task focus", /when|start|first|before|after/.test(text)],
          ["steps", /check|inspect|identify|verify|ask|summarize/.test(text)],
          ["quality bar", /clear|simple|accurate|safe|reliable|confirm/.test(text)],
          ["boundaries", /avoid|do not|ask|permission|only/.test(text)],
        ];
  const hitCount = checks.filter(([, ok]) => ok).length;
  const lengthScore = Math.min(20, Math.floor(input.content.trim().length / 18));
  const score = Math.min(100, hitCount * 20 + lengthScore);
  const missing = checks.filter(([, ok]) => !ok).map(([name]) => String(name));

  return {
    score,
    passed: score >= input.minScore,
    summary:
      score >= input.minScore
        ? "This is strong enough to continue."
        : "This needs one more revision before continuing.",
    strengths:
      checks.filter(([, ok]) => ok).map(([name]) => `Includes ${name}.`),
    improvements: missing.map((name) => `Add clearer ${name}.`),
    nextRevision:
      missing.length > 0
        ? `Revise by adding: ${missing.join(", ")}.`
        : "Tighten wording and keep the instructions specific.",
  };
}

function normalizeReview(value: Record<string, unknown>, input: { minScore: number }) {
  const score = Math.max(0, Math.min(100, Number(value.score) || 0));
  return {
    score,
    passed: typeof value.passed === "boolean" ? value.passed : score >= input.minScore,
    summary: String(value.summary || ""),
    strengths: toStringArray(value.strengths),
    improvements: toStringArray(value.improvements),
    nextRevision: String(value.nextRevision || ""),
  };
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean).slice(0, 5)
    : [];
}

function defaultRubric(target: AgentSandboxReviewTarget) {
  return target === "system_prompt"
    ? "Score persona, goal, behavioral rules, boundaries, safety, and tool-use clarity."
    : "Score task focus, repeatable steps, quality checks, boundaries, and usefulness.";
}
