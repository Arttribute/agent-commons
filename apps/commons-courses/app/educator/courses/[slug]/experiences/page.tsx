import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { ExperienceLibrary } from "@/components/educator/experience-library";

export default async function CourseExperiencesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <CourseSectionHeader section="content" />
      <ExperienceLibrary courseSlug={slug} />
    </>
  );
}
