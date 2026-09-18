import { CourseEditor } from "@/components/educator/course-editor";
import { CourseSectionHeader } from "@/components/educator/course-section-header";

export default async function CourseAgentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <CourseSectionHeader section="agents" info="Assistants for learners or your teaching team, with the data and actions you allow." />
      <CourseEditor slug={slug} section="agents" />
    </>
  );
}
