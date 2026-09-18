import { CourseEditor } from "@/components/educator/course-editor";
import { CourseSectionHeader } from "@/components/educator/course-section-header";

export default async function CourseSkillBadgesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <CourseSectionHeader section="skills" info="Short daily challenges learners complete to earn a skill badge. Published paths also appear on the public Skills page." />
      <CourseEditor slug={slug} section="skills" />
    </>
  );
}
