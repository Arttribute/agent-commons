import { redirect } from "next/navigation";
import { LiveFacilitatorStudio } from "@/components/educator/live-facilitator-studio";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function LiveFacilitatorPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  return <LiveFacilitatorStudio sessionId={id} />;
}
