import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPublicProjectPage } from "@/lib/public-project-page";
import { PublicPageHost } from "@/components/project-pages/public-page-host";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await fetchPublicProjectPage((await params).slug);
  if (!page) return { title: "Page not found" };
  return {
    title: { absolute: page.title },
    description: page.description,
    openGraph: {
      title: page.title,
      description: page.description,
      ...(page.imageUrl ? { images: [page.imageUrl] } : {}),
    },
    robots: { index: true, follow: true },
  };
}
export default async function Page({ params }: Props) {
  const page = await fetchPublicProjectPage((await params).slug);
  if (!page) notFound();
  return <PublicPageHost page={page} />;
}
