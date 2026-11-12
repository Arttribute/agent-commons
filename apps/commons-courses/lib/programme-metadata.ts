import type { Metadata } from "next";

type PageShare = {
  slug: string;
  title: string;
  description?: string;
  imageUrl?: string;
  registrationUrl?: string;
};
type RegistrationShare = {
  slug: string;
  title: string;
  summary?: string;
  pageSlug?: string;
  theme?: { imageUrl?: string };
};

export function registrationSlugForPage(page: PageShare) {
  return page.registrationUrl?.match(
    /^\/register\/([a-z0-9][a-z0-9-]{1,62}[a-z0-9])$/,
  )?.[1];
}

export function isProgrammePage(page: PageShare, event: RegistrationShare) {
  return page.registrationUrl
    ? registrationSlugForPage(page) === event.slug
    : page.slug === event.pageSlug;
}

export function programmeShare(
  page: PageShare | null,
  event?: RegistrationShare | null,
) {
  return {
    title: page?.title.trim() || event?.title.trim() || "Programme",
    description: page?.description?.trim() || event?.summary?.trim() || "",
    imageUrl: page?.imageUrl?.trim() || event?.theme?.imageUrl?.trim() || "",
  };
}

export function programmeMetadata(
  share: ReturnType<typeof programmeShare>,
  {
    baseUrl,
    path,
    browserTitle = share.title,
  }: {
    baseUrl: string;
    path: string;
    browserTitle?: string;
  },
): Metadata {
  const url = new URL(path, baseUrl);
  // A shared booking link describes the programme, never a payment reference.
  url.search = "";
  url.hash = "";
  const image = new URL(share.imageUrl || "/opengraph-image", baseUrl).href;
  const description = share.description || share.title;
  return {
    title: { absolute: browserTitle },
    description,
    alternates: { canonical: url.href },
    openGraph: {
      type: "website",
      title: share.title,
      description,
      url: url.href,
      siteName: share.title,
      images: [{ url: image, alt: share.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: share.title,
      description,
      images: [{ url: image, alt: share.title }],
    },
  };
}
