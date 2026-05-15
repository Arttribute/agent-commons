import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { AssignmentManager } from "@/components/educator/assignment-manager";
import { CourseAgentDrawer } from "@/components/course-agents/course-agent-drawer";
import { requireEducatorCourse } from "@/lib/educator-auth";
import type { CourseAgentConfig } from "@/types/course-agent";

export default async function CourseAssignmentsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");
  const agents = JSON.parse(
    JSON.stringify(result.course.agents || [])
  ) as CourseAgentConfig[];

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <CourseAgentDrawer
        courseSlug={slug}
        role="educator"
        agents={agents}
        context={{
          page: "educator.assignments",
          title: "Assignments and submissions",
          visibleText: result.course.title,
        }}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <h1 className="mb-8 mt-4 text-3xl font-bold text-slate-950">
          Assignments and submissions
        </h1>
        <AssignmentManager slug={slug} />
      </main>
    </div>
  );
}
