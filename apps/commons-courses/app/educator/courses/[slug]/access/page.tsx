import { CourseEditor } from "@/components/educator/course-editor";
import { CourseSectionHeader } from "@/components/educator/course-section-header";

export default async function CourseSalesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <CourseSectionHeader section="sales" />
      <CourseEditor slug={slug} section="access" />
    </>
  );
}
