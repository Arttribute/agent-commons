import { redirect } from "next/navigation";
import { AssignmentManager } from "@/components/educator/assignment-manager";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function CourseCourseworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const modules = (result.course.modules || []).map((module) => ({
    title: module.title,
    lessons: (module.lessons || []).map((lesson) => lesson.title),
  }));

  return <AssignmentManager slug={slug} modules={modules} />;
}
