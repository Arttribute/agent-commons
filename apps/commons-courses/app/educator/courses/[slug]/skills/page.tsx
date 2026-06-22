import { CourseEditor } from "@/components/educator/course-editor";

export default async function EducatorCourseSkillsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div>
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Daily skill challenges
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
          Create skill badges learners can earn
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Build short, focused challenges that can reinforce this course and
          also stand alone on the Skills page.
        </p>
      </div>
      <CourseEditor slug={slug} section="skills" />
    </div>
  );
}
