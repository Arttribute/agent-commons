import type { Types } from "mongoose";
import type { CourseSkillPack, SkillPack } from "@/types/skills";

type CourseWithSkillPacks = {
  _id: Types.ObjectId | { toString(): string };
  title: string;
  slug: string;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

export function getPublishedSkillPacks(course: CourseWithSkillPacks) {
  const packs: CourseSkillPack[] = [];
  const courseId = course._id.toString();

  if (
    course.skillPack?.enabled &&
    course.skillPack.challenges?.length
  ) {
    packs.push({
      ...course.skillPack,
      courseId,
      courseSlug: course.slug,
      skillSlug: course.skillPack.slug || course.slug,
      courseTitle: course.title,
    });
  }

  for (const pack of course.skillPacks || []) {
    if (!pack.enabled || !pack.challenges?.length) continue;
    const skillSlug = pack.slug || slugify(pack.title);
    packs.push({
      ...pack,
      slug: skillSlug,
      courseId,
      courseSlug: course.slug,
      skillSlug,
      courseTitle: course.title,
    });
  }

  return packs;
}

export function findSkillPackBySlug(
  course: CourseWithSkillPacks,
  slug: string
) {
  return getPublishedSkillPacks(course).find(
    (pack) => pack.skillSlug === slug || pack.courseSlug === slug
  );
}

export function getChallengeIds(pack?: Pick<SkillPack, "challenges"> | null) {
  return new Set((pack?.challenges || []).map((challenge) => challenge.id));
}

export function filterCompletedChallenges(
  completed: string[] | undefined,
  pack?: Pick<SkillPack, "challenges"> | null
) {
  const challengeIds = getChallengeIds(pack);
  return (completed || []).filter((id) => challengeIds.has(id));
}

export function slugify(value?: string) {
  return (
    value
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "skill-path"
  );
}
