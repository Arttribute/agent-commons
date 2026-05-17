import { CourseEditor } from "@/components/educator/course-editor";

export default async function CourseAgentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
          Automation
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">Course agents</h2>
      </div>
      <CourseEditor slug={slug} section="agents" />
    </div>
  );
}
