import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-url";
import { stripRichTextHtml } from "@/lib/rich-text";
import { filterCompletedChallenges, findSkillPackBySlug } from "@/lib/skill-paths";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import SkillPathClient from "./skill-path-client";
import type { CourseSkillPack, SkillPack } from "@/types/skills";
import type { Types } from "mongoose";

type Props = {
  params: Promise<{ slug: string }>;
};

type SkillCourse = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  isFree?: boolean;
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  skillPack?: SkillPack;
  skillPacks?: SkillPack[];
};

function getSkillImageUrl(course: SkillCourse, pack?: CourseSkillPack) {
  return (
    pack?.challenges?.[0]?.assetUrl ||
    course.previewImageUrl ||
    course.bannerImageUrl ||
    course.imageUrl ||
    `${getAppBaseUrl()}/opengraph-image`
  );
}

async function findSkillCourse(slug: string) {
  await connectDB();
  return (await Course.findOne({
    published: true,
    $or: [
      { slug },
      { "skillPack.slug": slug },
      { "skillPacks.slug": slug },
    ],
  })
    .select(
      "title slug isFree skillPack skillPacks imageUrl bannerImageUrl previewImageUrl"
    )
    .lean()) as SkillCourse | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await findSkillCourse(slug);
  const pack = course ? findSkillPackBySlug(course, slug) : null;
  if (!course || !pack) return {};

  const title = pack.title || course.title;
  const description = stripRichTextHtml(
    pack.learnerPromise || pack.subtitle
  );
  const image = getSkillImageUrl(course, pack);
  const url = `${getAppBaseUrl()}/skills/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "CommonLab",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function SkillPathPage({ params }: Props) {
  const { slug } = await params;
  const [session, course] = await Promise.all([auth(), findSkillCourse(slug)]);
  const pack = course ? findSkillPackBySlug(course, slug) : null;
  if (!course || !pack) notFound();
  const initialProgress = await getInitialSkillProgress({
    userId: session?.user?.id,
    course,
    pack,
  });

  return (
    <SkillPathClient
      slug={slug}
      initialPack={pack}
      initialProgress={initialProgress}
    />
  );
}

async function getInitialSkillProgress({
  userId,
  course,
  pack,
}: {
  userId?: string;
  course: SkillCourse;
  pack: CourseSkillPack;
}) {
  if (!userId) return null;

  let enrollment = await Enrollment.findOne({
    userId,
    courseId: course._id,
  })
    .select(
      "completedChallenges challengeAnswers points streak longestStreak lastChallengeCompletedAt practicalSignals"
    )
    .lean<{
      completedChallenges?: string[];
      challengeAnswers?: Map<string, number> | Record<string, number>;
      points?: number;
      streak?: number;
      longestStreak?: number;
      practicalSignals?: Array<{ status: "pending" | "verified" }>;
    } | null>();

  if (!enrollment && course.isFree) {
    const created = await Enrollment.create({
      userId,
      courseId: course._id,
      status: "active",
      accessLevel: "full",
      paymentStatus: "free",
      accessSource: "free",
    });
    enrollment = {
      completedChallenges: created.completedChallenges ?? [],
      challengeAnswers: {},
      points: created.points ?? 0,
      streak: created.streak ?? 0,
      longestStreak: created.longestStreak ?? 0,
      practicalSignals: created.practicalSignals ?? [],
    };
  }

  if (!enrollment) {
    return {
      authenticated: true,
      enrolled: false,
      completedChallenges: [],
      challengeAnswers: {},
      points: 0,
      streak: 0,
      longestStreak: 0,
      practicalSignals: [],
    };
  }

  return {
    authenticated: true,
    enrolled: true,
    completedChallenges: filterCompletedChallenges(enrollment.completedChallenges, pack),
    challengeAnswers: mapLikeToObject(enrollment.challengeAnswers),
    points: calculatePackPoints(enrollment.completedChallenges, pack),
    streak: enrollment.streak ?? 0,
    longestStreak: enrollment.longestStreak ?? 0,
    practicalSignals: enrollment.practicalSignals ?? [],
  };
}

function mapLikeToObject(value?: Map<string, number> | Record<string, number>) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  return value;
}

function calculatePackPoints(completedChallenges: string[] | undefined, pack: SkillPack) {
  const completed = new Set(filterCompletedChallenges(completedChallenges, pack));
  return pack.challenges.reduce(
    (sum, challenge) => sum + (completed.has(challenge.id) ? challenge.points : 0),
    0
  );
}
