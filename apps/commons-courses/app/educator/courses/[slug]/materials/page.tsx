import { redirect } from "next/navigation";
import { CourseMaterialLibrary } from "@/components/educator/course-material-library";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function MaterialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  return (
    <>
      <CourseSectionHeader section="content" />
      <CourseMaterialLibrary slug={slug} />
    </>
  );
}
