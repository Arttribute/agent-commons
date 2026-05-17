import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { CourseAgentDrawer } from "@/components/course-agents/course-agent-drawer";
import { CourseDashboardShell } from "@/components/educator/course-dashboard-shell";
import { requireEducatorCourse } from "@/lib/educator-auth";
import type { CourseAgentConfig } from "@/types/course-agent";

export default async function EducatorCourseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<unknown>;
}) {
  const { slug } = (await params) as { slug: string };
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const agents = JSON.parse(
    JSON.stringify(result.course.agents || [])
  ) as CourseAgentConfig[];

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <CourseAgentDrawer
        courseSlug={slug}
        role="educator"
        agents={agents}
        context={{
          page: "educator.course-dashboard",
          title: result.course.title,
          visibleText: `${result.course.title}\nEducator course dashboard`,
        }}
      />
      <CourseDashboardShell
        slug={slug}
        title={result.course.title}
        published={result.course.published}
      >
        {children}
      </CourseDashboardShell>
    </div>
  );
}
