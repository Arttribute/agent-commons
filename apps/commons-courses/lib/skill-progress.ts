import Enrollment from "@/models/Enrollment";
import { connectDB } from "@/lib/db";
import { filterCompletedChallenges } from "@/lib/skill-paths";
import type { CourseSkillPack, SkillPack } from "@/types/skills";
import type { Types } from "mongoose";

export type SkillProgressSummary = {
  authenticated: boolean;
  enrolled: boolean;
  completedChallenges: string[];
  points: number;
  streak: number;
  longestStreak: number;
};

type EnrollmentProgress = {
  courseId: Types.ObjectId;
  completedChallenges?: string[];
  points?: number;
  streak?: number;
  longestStreak?: number;
};

const emptyProgress: SkillProgressSummary = {
  authenticated: false,
  enrolled: false,
  completedChallenges: [],
  points: 0,
  streak: 0,
  longestStreak: 0,
};

export async function getProgressBySkillSlug({
  userId,
  packs,
}: {
  userId?: string;
  packs: CourseSkillPack[];
}) {
  if (!userId || packs.length === 0) {
    return buildProgressBySlug({
      packs,
      enrollments: [],
      authenticated: Boolean(userId),
    });
  }

  await connectDB();
  const courseIds = [...new Set(packs.map((pack) => pack.courseId))];
  const enrollments = (await Enrollment.find({
    userId,
    courseId: { $in: courseIds },
  })
    .select("courseId completedChallenges points streak longestStreak")
    .lean()) as unknown as EnrollmentProgress[];

  return buildProgressBySlug({
    packs,
    enrollments,
    authenticated: true,
  });
}

function buildProgressBySlug({
  packs,
  enrollments,
  authenticated,
}: {
  packs: CourseSkillPack[];
  enrollments: EnrollmentProgress[];
  authenticated: boolean;
}) {
  const progressBySlug: Record<string, SkillProgressSummary> = {};
  const enrollmentByCourseId = new Map(
    enrollments.map((enrollment) => [enrollment.courseId.toString(), enrollment])
  );

  for (const pack of packs) {
    const enrollment = enrollmentByCourseId.get(pack.courseId);
    progressBySlug[pack.skillSlug] = enrollment
      ? {
          authenticated: true,
          enrolled: true,
          completedChallenges: filterCompletedChallenges(
            enrollment.completedChallenges,
            pack
          ),
          points: calculatePackPoints(enrollment.completedChallenges, pack),
          streak: enrollment.streak ?? 0,
          longestStreak: enrollment.longestStreak ?? 0,
        }
      : { ...emptyProgress, authenticated };
  }

  return progressBySlug;
}

function calculatePackPoints(completedChallenges: string[] | undefined, pack: SkillPack) {
  const completed = new Set(filterCompletedChallenges(completedChallenges, pack));
  return pack.challenges.reduce(
    (sum, challenge) => sum + (completed.has(challenge.id) ? challenge.points : 0),
    0
  );
}
