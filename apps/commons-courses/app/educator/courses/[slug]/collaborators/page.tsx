import { CourseEditor } from "@/components/educator/course-editor";
import { CourseSectionHeader } from "@/components/educator/course-section-header";

export default async function CourseCollaboratorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <CourseSectionHeader section="settings" />
      <CourseEditor slug={slug} section="collaborators" />
    </>
  );
}
