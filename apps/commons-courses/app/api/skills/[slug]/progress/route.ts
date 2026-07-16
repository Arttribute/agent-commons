import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import User from "@/models/User";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { claimCommonLabReward } from "@/lib/credits";
import { getCommonsPrincipal } from "@/lib/commons-principal";
import { getAgentCommonsClient } from "@/lib/agent-commons";
import {
  filterCompletedChallenges,
  findSkillPackBySlug,
} from "@/lib/skill-paths";
import type { SkillPack } from "@/types/skills";
import type { Types } from "mongoose";

type CourseWithSkillPack = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  isFree?: boolean;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

type SkillProgress = {
  _id: unknown;
  completedChallenges?: string[];
  challengeAnswers?: Map<string, number> | Record<string, number>;
  points?: number;
  streak?: number;
  longestStreak?: number;
  lastChallengeCompletedAt?: Date;
  practicalSignals?: SkillProgressSignal[];
};

type SkillProgressSignal = {
  id: string;
  platform: string;
  eventType: string;
  status: "pending" | "verified";
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const { slug } = await params;
  await connectDB();
  const course = (await Course.findOne({
    published: true,
    $or: [{ slug }, { "skillPack.slug": slug }, { "skillPacks.slug": slug }],
  })
    .select("_id title slug isFree skillPack skillPacks")
    .lean()) as CourseWithSkillPack | null;
  const pack = course ? findSkillPackBySlug(course, slug) : null;

  if (!course || !pack) {
    return NextResponse.json(
      { error: "Skill pack not found." },
      { status: 404 },
    );
  }

  const enrollment = await findOrCreateFreeSkillEnrollment({
    userId: session.user.id,
    course,
  });

  if (!enrollment) {
    return NextResponse.json({
      authenticated: true,
      enrolled: false,
      completedChallenges: [],
      challengeAnswers: {},
      points: 0,
      streak: 0,
      longestStreak: 0,
      practicalSignals: [],
    });
  }

  return NextResponse.json({
    authenticated: true,
    enrolled: true,
    completedChallenges: filterCompletedChallenges(
      enrollment.completedChallenges,
      pack,
    ),
    challengeAnswers: mapLikeToObject(enrollment.challengeAnswers),
    points: calculatePackPoints(enrollment.completedChallenges, pack),
    streak: enrollment.streak ?? 0,
    longestStreak: enrollment.longestStreak ?? 0,
    lastChallengeCompletedAt: enrollment.lastChallengeCompletedAt,
    practicalSignals: enrollment.practicalSignals ?? [],
  });
}

async function findOrCreateFreeSkillEnrollment({
  userId,
  course,
}: {
  userId: string;
  course: CourseWithSkillPack;
}) {
  const enrollment = (await Enrollment.findOne({
    userId,
    courseId: course._id,
  })
    .select(
      "completedChallenges challengeAnswers points streak longestStreak lastChallengeCompletedAt practicalSignals",
    )
    .lean()) as SkillProgress | null;

  if (enrollment || !course.isFree) return enrollment;

  const created = await Enrollment.create({
    userId,
    courseId: course._id,
    status: "active",
    accessLevel: "full",
    paymentStatus: "free",
    accessSource: "free",
  });

  return {
    _id: created._id,
    completedChallenges: created.completedChallenges ?? [],
    challengeAnswers: {},
    points: created.points ?? 0,
    streak: created.streak ?? 0,
    longestStreak: created.longestStreak ?? 0,
    lastChallengeCompletedAt: created.lastChallengeCompletedAt,
    practicalSignals: created.practicalSignals ?? [],
  } satisfies SkillProgress;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { slug } = await params;
  const body = (await req.json()) as {
    challengeId?: string;
    answers?: Record<string, number>;
    sandboxCompletion?: {
      agentId?: string;
      simulated?: boolean;
      creditReward?: number;
    };
  };
  if (!body.challengeId || (!body.answers && !body.sandboxCompletion)) {
    return NextResponse.json(
      { error: "challengeId and answers or sandboxCompletion are required." },
      { status: 400 },
    );
  }

  await connectDB();
  const course = (await Course.findOne({
    published: true,
    $or: [{ slug }, { "skillPack.slug": slug }, { "skillPacks.slug": slug }],
  })
    .select("_id title slug isFree skillPack skillPacks")
    .lean()) as CourseWithSkillPack | null;
  const pack = course ? findSkillPackBySlug(course, slug) : null;

  const challenge = pack?.challenges?.find(
    (item) => item.id === body.challengeId,
  );
  if (!course || !pack || !challenge) {
    return NextResponse.json(
      { error: "Challenge not found." },
      { status: 404 },
    );
  }

  const allCorrect = challenge.sandbox?.enabled
    ? Boolean(body.sandboxCompletion)
    : challenge.questions.every(
        (question) => body.answers?.[question.id] === question.answerIndex,
      );
  if (!allCorrect) {
    return NextResponse.json(
      {
        error: challenge.sandbox?.enabled
          ? "Complete the sandbox task first."
          : "Answer all quiz questions correctly to complete the challenge.",
      },
      { status: 422 },
    );
  }

  const [enrollment, user] = await Promise.all([
    findOrCreateFreeSkillEnrollment({
      userId: session.user.id,
      course,
    }),
    User.findById(session.user.id)
      .select("identityUserId identityWorkspaceId")
      .lean<{ identityUserId?: string; identityWorkspaceId?: string }>(),
  ]);

  if (!enrollment) {
    return NextResponse.json(
      { error: "Enroll in this course before saving skill progress." },
      { status: 403 },
    );
  }

  const completedChallenges = enrollment.completedChallenges ?? [];
  const alreadyCompleted = completedChallenges.includes(challenge.id);
  if (challenge.sandbox?.enabled && !alreadyCompleted) {
    if (!body.sandboxCompletion?.agentId || body.sandboxCompletion.simulated) {
      return NextResponse.json(
        { error: "Complete the live Agent Commons sandbox first." },
        { status: 422 },
      );
    }
    const principal = await getCommonsPrincipal(session);
    const identityUserId = principal?.identityUserId;
    const client = identityUserId
      ? getAgentCommonsClient(session.accessToken, identityUserId)
      : null;
    if (!client || !identityUserId) {
      return NextResponse.json(
        { error: "Your Agent Commons identity could not be verified." },
        { status: 409 },
      );
    }
    let createdAgent: { data?: Record<string, any> };
    try {
      createdAgent = (await client.agents.get(
        body.sandboxCompletion.agentId,
      )) as { data?: Record<string, any> };
    } catch {
      return NextResponse.json(
        { error: "The sandbox completion could not be verified." },
        { status: 422 },
      );
    }
    const agent = createdAgent.data;
    if (
      !agent ||
      (agent.ownerUserId ?? agent.owner)?.toLowerCase() !==
        identityUserId.toLowerCase() ||
      agent.metadata?.source !== "commonlab_skill_sandbox" ||
      agent.metadata?.challengeId !== challenge.id ||
      agent.metadata?.courseSlug !== course.slug
    ) {
      return NextResponse.json(
        { error: "The sandbox completion could not be verified." },
        { status: 422 },
      );
    }
  }
  const awaitsPracticalVerification = Boolean(
    challenge.practicalSignal && !body.sandboxCompletion,
  );
  const shouldCompleteNow = !alreadyCompleted && !awaitsPracticalVerification;
  const streak = !shouldCompleteNow
    ? (enrollment.streak ?? 0)
    : calculateNextStreak(
        enrollment.lastChallengeCompletedAt,
        enrollment.streak ?? 0,
      );
  const nextCompleted = alreadyCompleted
    ? completedChallenges
    : shouldCompleteNow
      ? [...completedChallenges, challenge.id]
      : completedChallenges;
  const nextPoints = !shouldCompleteNow
    ? (enrollment.points ?? 0)
    : (enrollment.points ?? 0) + challenge.points;
  const nextPackPoints = calculatePackPoints(nextCompleted, pack);
  const answerEntries = Object.fromEntries(
    Object.entries(body.answers || {}).map(([questionId, answer]) => [
      `${challenge.id}:${questionId}`,
      answer,
    ]),
  );
  const practicalSignals = challenge.practicalSignal
    ? [
        ...(enrollment.practicalSignals ?? []).filter(
          (signal: SkillProgressSignal) =>
            signal.id !== challenge.practicalSignal?.id,
        ),
        {
          id: challenge.practicalSignal.id,
          platform: challenge.practicalSignal.platform,
          eventType: challenge.practicalSignal.eventType,
          status: body.sandboxCompletion
            ? ("verified" as const)
            : ("pending" as const),
        },
      ]
    : (enrollment.practicalSignals ?? []);

  await Enrollment.updateOne(
    { _id: enrollment._id },
    {
      $set: {
        completedChallenges: nextCompleted,
        points: nextPoints,
        streak,
        longestStreak: Math.max(enrollment.longestStreak ?? 0, streak),
        lastChallengeCompletedAt: !shouldCompleteNow
          ? enrollment.lastChallengeCompletedAt
          : new Date(),
        practicalSignals,
        ...Object.fromEntries(
          Object.entries(answerEntries).map(([key, value]) => [
            `challengeAnswers.${key}`,
            value,
          ]),
        ),
      },
    },
  );

  await trackAnalyticsEvent({
    eventType: "skill_challenge_completed",
    userId: session.user.id,
    courseId: course._id,
    courseSlug: course.slug,
    page: "skills",
    metadata: {
      challengeId: challenge.id,
      pointsAwarded: alreadyCompleted ? 0 : challenge.points,
      streak,
    },
    request: req,
  });

  let creditGrant: Awaited<ReturnType<typeof claimCommonLabReward>> | undefined;
  // Completed challenges may re-submit this idempotent claim so a temporary
  // API failure does not permanently lose the reward.
  if (
    (shouldCompleteNow || alreadyCompleted) &&
    challenge.sandbox?.enabled &&
    user?.identityUserId
  ) {
    creditGrant = await claimCommonLabReward({
      identityUserId: user.identityUserId,
      workspaceId: user.identityWorkspaceId,
      campaignKey: "commonlab-skill-challenge",
      eventId: `${course._id.toString()}:${challenge.id}`,
      relatedCourseId: course._id.toString(),
      relatedChallengeId: challenge.id,
      agentId: body.sandboxCompletion?.agentId,
      metadata: {
        courseSlug: course.slug,
        simulated: body.sandboxCompletion?.simulated,
      },
    });
  }

  return NextResponse.json({
    completedChallenges: filterCompletedChallenges(nextCompleted, pack),
    points: nextPackPoints,
    streak,
    longestStreak: Math.max(enrollment.longestStreak ?? 0, streak),
    practicalSignals,
    creditGrant,
  });
}

function calculateNextStreak(
  lastCompletedAt: Date | undefined,
  currentStreak: number,
) {
  if (!lastCompletedAt) return 1;

  const today = startOfLocalDay(new Date());
  const last = startOfLocalDay(new Date(lastCompletedAt));
  const dayMs = 24 * 60 * 60 * 1000;
  const dayDiff = Math.round((today.getTime() - last.getTime()) / dayMs);

  if (dayDiff <= 0) return Math.max(currentStreak, 1);
  if (dayDiff === 1) return currentStreak + 1;
  return 1;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mapLikeToObject(value?: Map<string, number> | Record<string, number>) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}

function calculatePackPoints(
  completedChallenges: string[] | undefined,
  pack: SkillPack,
) {
  const completed = new Set(
    filterCompletedChallenges(completedChallenges, pack),
  );
  return pack.challenges.reduce(
    (sum, challenge) =>
      sum + (completed.has(challenge.id) ? challenge.points : 0),
    0,
  );
}
