import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { CourseSkillPack, SkillLeaderboardEntry } from "@/types/skills";

type CourseWithSkillPack = {
  _id: { toString(): string };
  title: string;
  slug: string;
  skillPack?: Omit<CourseSkillPack, "courseId" | "courseSlug" | "courseTitle">;
};

export async function GET() {
  const session = await auth();
  await connectDB();

  const courses = (await Course.find({
    published: true,
    "skillPack.enabled": true,
    "skillPack.challenges.0": { $exists: true },
  })
    .select("title slug skillPack")
    .sort({ updatedAt: -1 })
    .lean()) as unknown as CourseWithSkillPack[];

  const packs: CourseSkillPack[] = courses
    .filter((course) => course.skillPack)
    .map((course) => ({
      ...course.skillPack!,
      courseId: course._id.toString(),
      courseSlug: course.slug,
      courseTitle: course.title,
    }));

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
          $group: {
            _id: "$userId",
            points: { $sum: { $ifNull: ["$points", 0] } },
            streak: { $max: { $ifNull: ["$streak", 0] } },
            longestStreak: { $max: { $ifNull: ["$longestStreak", 0] } },
            completedSkills: {
              $sum: {
                $size: { $ifNull: ["$completedChallenges", []] },
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
            points: 1,
            streak: 1,
            longestStreak: 1,
            completedSkills: 1,
            skillPathsStarted: 1,
          },
        },
        { $sort: { points: -1, streak: -1, completedSkills: -1 } },
        { $limit: 10 },
      ])) as SkillLeaderboardEntry[])
    : [];

  const leaderboard = leaderboardRows.map((row) => ({
    ...row,
    isCurrentUser: row.userId === session?.user?.id,
  }));

  return NextResponse.json({ packs, leaderboard });
}
