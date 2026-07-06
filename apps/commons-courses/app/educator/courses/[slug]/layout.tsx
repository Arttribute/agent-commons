import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { CourseDashboardShell } from "@/components/educator/course-dashboard-shell";
import { requireEducatorCourse } from "@/lib/educator-auth";

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

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
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
