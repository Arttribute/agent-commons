import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchPublicProjectPage } from "@/lib/public-project-page";
import { NewChatView } from "@/components/home/new-chat-view";
import { PageChatDraft } from "@/components/project-pages/page-chat-draft";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await auth();
  if (!user?.user?.id)
    redirect(`/login?callbackUrl=${encodeURIComponent(`/p/${slug}/chat`)}`);
  const page = await fetchPublicProjectPage(slug);
  if (!page?.chatEnabled) notFound();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageChatDraft
        title={page.title}
        context={page.publicContext || page.description}
      />
      <div className="min-h-0 flex-1">
        <NewChatView />
      </div>
    </div>
  );
}
