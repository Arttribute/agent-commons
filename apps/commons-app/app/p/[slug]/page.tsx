import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { projectPageRequestOrigin } from "@agent-commons/ui/page-bridge";
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
  // Rendering the frame address on the server lets the page start loading with
  // this HTML rather than after hydration. Reading headers keeps the route
  // per-request, so every response gets its own nonce.
  const session = {
    nonce: crypto.randomUUID(),
    hostOrigin: projectPageRequestOrigin(await headers()),
  };
  return <PublicPageHost page={page} session={session} />;
}
