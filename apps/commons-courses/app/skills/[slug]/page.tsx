import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/app-url";
import { stripRichTextHtml } from "@/lib/rich-text";
import Course from "@/models/Course";
import SkillPathClient from "./skill-path-client";

type Props = {
  params: Promise<{ slug: string }>;
};

type SkillCourse = {
  title: string;
  slug: string;
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  skillPack?: {
    enabled?: boolean;
    title?: string;
    subtitle?: string;
    learnerPromise?: string;
    challenges?: Array<{ assetUrl?: string }>;
  };
};

function getSkillImageUrl(course: SkillCourse) {
  return (
    course.skillPack?.challenges?.[0]?.assetUrl ||
    course.previewImageUrl ||
    course.bannerImageUrl ||
    course.imageUrl ||
    `${getAppBaseUrl()}/opengraph-image`
  );
}

async function findSkillCourse(slug: string) {
  await connectDB();
  return (await Course.findOne({
    slug,
    published: true,
    "skillPack.enabled": true,
    "skillPack.challenges.0": { $exists: true },
  })
    .select(
      "title slug skillPack.title skillPack.subtitle skillPack.learnerPromise skillPack.enabled skillPack.challenges.assetUrl imageUrl bannerImageUrl previewImageUrl"
    )
    .lean()) as SkillCourse | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const course = await findSkillCourse(slug);
  if (!course?.skillPack) return {};

  const title = course.skillPack.title || course.title;
  const description = stripRichTextHtml(
    course.skillPack.learnerPromise || course.skillPack.subtitle
  );
  const image = getSkillImageUrl(course);
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
  if (!course?.skillPack) notFound();

  return <SkillPathClient slug={slug} />;
}
