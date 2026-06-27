import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import { getPublishedSkillPacks } from "@/lib/skill-paths";
import type { CourseSkillPack, SkillLeaderboardEntry, SkillPack } from "@/types/skills";

type CourseWithSkillPack = {
  _id: { toString(): string };
  title: string;
  slug: string;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

export async function GET() {
  const session = await auth();
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
  const leaderboardRows = skillCourseIds.length
    ? ((await Enrollment.aggregate([
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
      ])) as SkillLeaderboardEntry[])
    : [];

  const leaderboard = leaderboardRows.map((row) => ({
    ...row,
    avatarUrl:
      row.avatarUrl ||
      (row.userId === session?.user?.id ? session.user.image ?? undefined : undefined),
    isCurrentUser: row.userId === session?.user?.id,
  }));

  return NextResponse.json({ packs, leaderboard });
}
