import { EducatorCopilotShell } from "@/components/educator/educator-copilot-shell";
import { EducatorShell, type ShellCourse } from "@/components/educator/educator-shell";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";

async function loadShellCourses(): Promise<ShellCourse[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  try {
    await connectDB();
    const filter =
      session.user.role === "admin"
        ? {}
        : buildManagedCoursesFilter({
            userId: session.user.id,
            email: session.user.email,
            role: session.user.role,
          });
    const courses = await Course.find(filter)
      .select("title slug published")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean<Array<{ title: string; slug: string; published?: boolean }>>();
    return courses.map((course) => ({
      title: course.title,
      slug: course.slug,
      published: Boolean(course.published),
    }));
  } catch {
    return [];
  }
}

export default async function EducatorLayout({ children }: { children: React.ReactNode }) {
  const courses = await loadShellCourses();
  return (
    <>
      <div id="educator-shell-content">
        <EducatorShell courses={courses}>{children}</EducatorShell>
      </div>
      <EducatorCopilotShell />
    </>
  );
}
