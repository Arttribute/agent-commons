import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import { connectDB } from "@/lib/db";
import { filterCompletedChallenges, getPublishedSkillPacks } from "@/lib/skill-paths";
import type { CourseSkillPack, SkillLeaderboardEntry, SkillPack } from "@/types/skills";
import type { Types } from "mongoose";

type CourseWithSkillPack = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

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

export type SkillsOverview = {
  packs: CourseSkillPack[];
  leaderboard: SkillLeaderboardEntry[];
  progressBySlug: Record<string, SkillProgressSummary>;
};

const emptyProgress: SkillProgressSummary = {
  authenticated: false,
  enrolled: false,
  completedChallenges: [],
  points: 0,
  streak: 0,
  longestStreak: 0,
};

export async function getSkillsOverview(user?: {
  id?: string;
  image?: string | null;
}): Promise<SkillsOverview> {
  await connectDB();

  const courses = (await Course.find({
    published: true,
    $or: [
      {
        "skillPack.enabled": true,
        "skillPack.challenges.0": { $exists: true },
      },
      {
        "skillPacks.enabled": true,
        "skillPacks.challenges.0": { $exists: true },
      },
    ],
  })
    .select("title slug skillPack skillPacks")
    .sort({ updatedAt: -1 })
    .lean()) as unknown as CourseWithSkillPack[];

  const packs: CourseSkillPack[] = courses.flatMap((course) =>
    getPublishedSkillPacks(course)
  );
  const skillCourseIds = courses.map((course) => course._id);
  const enrollmentsPromise =
    user?.id && packs.length > 0
      ? Enrollment.find({
          userId: user.id,
          courseId: { $in: skillCourseIds },
        })
          .select("courseId completedChallenges points streak longestStreak")
          .lean()
      : Promise.resolve([]);
  const leaderboardPromise = skillCourseIds.length
    ? Enrollment.aggregate([
        {
          $match: {
            courseId: { $in: skillCourseIds },
            status: { $in: ["active", "completed"] },
          },
        },
        {
          $lookup: {
            from: "courses",
            localField: "courseId",
            foreignField: "_id",
            as: "course",
          },
        },
        { $unwind: "$course" },
        {
          $project: {
            userId: 1,
            points: { $ifNull: ["$points", 0] },
            streak: { $ifNull: ["$streak", 0] },
            longestStreak: { $ifNull: ["$longestStreak", 0] },
            completedCount: {
              $size: { $ifNull: ["$completedChallenges", []] },
            },
            challengeCount: {
              $size: { $ifNull: ["$course.skillPack.challenges", []] },
            },
          },
        },
        {
          $group: {
            _id: "$userId",
            points: { $sum: "$points" },
            streak: { $max: "$streak" },
            longestStreak: { $max: "$longestStreak" },
            completedSkills: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$challengeCount", 0] },
                      { $gte: ["$completedCount", "$challengeCount"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            skillPathsInProgress: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$completedCount", 0] },
                      { $lt: ["$completedCount", "$challengeCount"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            skillPathsStarted: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            _id: 0,
            userId: { $toString: "$_id" },
            name: "$user.name",
            avatarUrl: "$user.image",
            points: 1,
            streak: 1,
            longestStreak: 1,
            completedSkills: 1,
            skillPathsInProgress: 1,
            skillPathsStarted: 1,
          },
        },
        { $sort: { points: -1, streak: -1, completedSkills: -1 } },
        { $limit: 10 },
      ])
    : Promise.resolve([]);
  const [enrollments, leaderboardRows] = await Promise.all([
    enrollmentsPromise,
    leaderboardPromise,
  ]) as [EnrollmentProgress[], SkillLeaderboardEntry[]];

  const leaderboard = leaderboardRows.map((row) => ({
    ...row,
    avatarUrl: row.avatarUrl || (row.userId === user?.id ? user.image ?? undefined : undefined),
    isCurrentUser: row.userId === user?.id,
  }));

  return {
    packs,
    leaderboard,
    progressBySlug: buildProgressBySlug({
      packs,
      enrollments,
      authenticated: Boolean(user?.id),
    }),
  };
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
