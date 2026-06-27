import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-url";
import { stripRichTextHtml } from "@/lib/rich-text";
import { findSkillPackBySlug } from "@/lib/skill-paths";
import Course from "@/models/Course";
import SkillPathClient from "./skill-path-client";
import type { CourseSkillPack, SkillPack } from "@/types/skills";

type Props = {
  params: Promise<{ slug: string }>;
};

type SkillCourse = {
  _id: { toString(): string };
  title: string;
  slug: string;
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
      "title slug skillPack skillPacks imageUrl bannerImageUrl previewImageUrl"
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
  const course = await findSkillCourse(slug);
  const pack = course ? findSkillPackBySlug(course, slug) : null;
  if (!course || !pack) notFound();

  return <SkillPathClient slug={slug} />;
}
