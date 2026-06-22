import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import type { CourseSkillPack } from "@/types/skills";

type CourseWithSkillPack = {
  _id: { toString(): string };
  title: string;
  slug: string;
  skillPack?: Omit<CourseSkillPack, "courseId" | "courseSlug" | "courseTitle">;
};

export async function GET() {
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

  return NextResponse.json({ packs });
}
