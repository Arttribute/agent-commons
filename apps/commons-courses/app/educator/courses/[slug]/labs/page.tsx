import { redirect } from "next/navigation";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { LabWorkspaceLibrary } from "@/components/educator/lab-workspace-library";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function LabsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  return (
    <>
      <CourseSectionHeader section="content" />
      <LabWorkspaceLibrary slug={slug} />
    </>
  );
}
