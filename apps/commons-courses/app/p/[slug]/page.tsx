import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicProjectPage, commonsWebUrl } from "@/lib/project-pages";
import { ProjectPageHost } from "@/components/project-page-host";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await publicProjectPage((await params).slug);
  return page
    ? {
        title: { absolute: page.title },
        description: page.description,
        openGraph: {
          title: page.title,
          description: page.description,
          ...(page.imageUrl ? { images: [page.imageUrl] } : {}),
        },
      }
    : { title: "Page not found" };
}
export default async function Page({ params }: Props) {
  const page = await publicProjectPage((await params).slug);
  if (!page) notFound();
  return <ProjectPageHost page={page} commonsUrl={commonsWebUrl()} />;
}
