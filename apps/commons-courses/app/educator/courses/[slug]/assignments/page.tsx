import { redirect } from "next/navigation";
import { AssignmentManager } from "@/components/educator/assignment-manager";
import { requireEducatorCourse } from "@/lib/educator-auth";

export default async function CourseAssignmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
          Coursework
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-950">
          Assignments and submissions
        </h2>
      </div>
      <AssignmentManager slug={slug} />
    </div>
  );
}
