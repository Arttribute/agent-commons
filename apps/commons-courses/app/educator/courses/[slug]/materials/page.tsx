import { redirect } from "next/navigation";
import { CourseMaterialLibrary } from "@/components/educator/course-material-library";
import { LabWorkspaceLibrary } from "@/components/educator/lab-workspace-library";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function MaterialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  return <div className="space-y-12"><CourseMaterialLibrary slug={slug} /><LabWorkspaceLibrary slug={slug} /></div>;
}
