import { redirect } from "next/navigation";
import { LiveSessionManager } from "@/components/educator/live-session-manager";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function LiveSessionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  return <LiveSessionManager courseSlug={slug} courseTitle={result.course.title} />;
}
