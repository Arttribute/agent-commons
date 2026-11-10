import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { projectPageRequestOrigin } from "@agent-commons/ui/page-bridge";
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
  // Rendering the frame address on the server lets the page start loading with
  // this HTML rather than after hydration. Reading headers keeps the route
  // per-request, so every response gets its own nonce.
  const session = {
    nonce: crypto.randomUUID(),
    hostOrigin: projectPageRequestOrigin(await headers()),
  };
  return (
    <ProjectPageHost
      page={page}
      session={session}
      commonsUrl={commonsWebUrl()}
    />
  );
}
