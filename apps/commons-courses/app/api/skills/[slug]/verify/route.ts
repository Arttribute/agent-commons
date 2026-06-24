import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import User from "@/models/User";
import type { SkillChallenge } from "@/types/skills";
import { platformServiceToken } from "@/lib/platform-service-token";

type PlatformEvent = {
  eventId?: string;
  eventType: string;
  subject?: { type?: string; id?: string };
  subjectId?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

type PendingSignal = {
  id: string;
  platform: "agent_commons" | "common_os" | "external";
  eventType: string;
  status: "pending" | "verified";
  verifiedAt?: Date;
  metadata?: Record<string, unknown>;
};

async function fetchEvents(input: {
  platform: PendingSignal["platform"];
  actorId: string;
  eventType: string;
  since: Date;
}): Promise<PlatformEvent[]> {
  if (input.platform === "external") return [];

  const isAgentCommons = input.platform === "agent_commons";
  const baseUrl =
    process.env.COMMONS_API_URL ??
    (isAgentCommons
      ? process.env.AGENT_COMMONS_API_URL
      : process.env.COMMON_OS_API_URL);
  const token = await platformServiceToken(input.platform);
  if (!baseUrl || !token) return [];

  const query = new URLSearchParams({
    actorId: input.actorId,
    eventType: input.eventType,
    since: input.since.toISOString(),
    limit: "50",
  });
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/${
      process.env.COMMONS_API_URL
        ? isAgentCommons
          ? "v1/activity/events"
          : "v1/compute/activity/events"
        : isAgentCommons
          ? "v1/activity/events"
          : "activity/events"
    }?${query}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    data?: PlatformEvent[];
  };
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await connectDB();
  const { slug } = await params;
  const [user, course] = await Promise.all([
    User.findById(session.user.id)
      .select("identityUserId")
      .lean<{ identityUserId?: string }>(),
    Course.findOne({
      slug,
      published: true,
      "skillPack.enabled": true,
    })
      .select("_id skillPack.challenges")
      .lean<{
        _id: unknown;
        skillPack?: { challenges?: SkillChallenge[] };
      }>(),
  ]);

  if (!user?.identityUserId) {
    return NextResponse.json(
      {
        error:
          "Link this legacy course account to Commons Identity before verifying platform tasks.",
        code: "IDENTITY_LINK_REQUIRED",
      },
      { status: 409 },
    );
  }
  if (!course) {
    return NextResponse.json({ error: "Skill pack not found." }, { status: 404 });
  }

  const enrollment = await Enrollment.findOne({
    userId: session.user.id,
    courseId: course._id,
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Enrollment not found." }, { status: 404 });
  }

  const requirements = new Map(
    (course.skillPack?.challenges ?? [])
      .filter((challenge) => challenge.practicalSignal)
      .map((challenge) => [
        challenge.practicalSignal!.id,
        challenge.practicalSignal!,
      ]),
  );

  const verified: string[] = [];
  const newlyCompletedChallenges: string[] = [];
  let pointsAwarded = 0;
  const nextSignals: PendingSignal[] = [];
  for (const rawSignal of enrollment.practicalSignals ?? []) {
    const signal = rawSignal.toObject
      ? (rawSignal.toObject() as PendingSignal)
      : (rawSignal as PendingSignal);
    if (signal.status === "verified") {
      nextSignals.push(signal);
      continue;
    }
    const requirement = requirements.get(signal.id);
    if (!requirement) {
      nextSignals.push(signal);
      continue;
    }
    const events = await fetchEvents({
      platform: requirement.platform,
      actorId: user.identityUserId,
      eventType: requirement.eventType,
      since: enrollment.enrolledAt,
    });
    const event = events[0];
    if (!event) {
      nextSignals.push(signal);
      continue;
    }
    verified.push(signal.id);
    const challenge = (course.skillPack?.challenges ?? []).find(
      (item) => item.practicalSignal?.id === signal.id,
    );
    if (
      challenge &&
      !enrollment.completedChallenges.includes(challenge.id)
    ) {
      newlyCompletedChallenges.push(challenge.id);
      pointsAwarded += challenge.points;
    }
    nextSignals.push({
      ...signal,
      status: "verified",
      verifiedAt: new Date(),
      metadata: {
        eventId: event.eventId,
        subjectId: event.subject?.id ?? event.subjectId,
        occurredAt: event.occurredAt,
        sourceMetadata: event.metadata ?? {},
      },
    });
  }

  enrollment.practicalSignals = nextSignals;
  if (newlyCompletedChallenges.length > 0) {
    enrollment.completedChallenges = [
      ...enrollment.completedChallenges,
      ...newlyCompletedChallenges,
    ];
    enrollment.points += pointsAwarded;
    enrollment.streak = calculateNextStreak(
      enrollment.lastChallengeCompletedAt,
      enrollment.streak,
    );
    enrollment.longestStreak = Math.max(
      enrollment.longestStreak,
      enrollment.streak,
    );
    enrollment.lastChallengeCompletedAt = new Date();
  }
  await enrollment.save();

  return NextResponse.json({
    verified,
    completedChallenges: newlyCompletedChallenges,
    pointsAwarded,
    practicalSignals: nextSignals,
  });
}

function calculateNextStreak(lastCompletedAt: Date | undefined, currentStreak: number) {
  if (!lastCompletedAt) return 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lastCompletedAt);
  last.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (today.getTime() - last.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff <= 0) return Math.max(currentStreak, 1);
  if (dayDiff === 1) return currentStreak + 1;
  return 1;
}
