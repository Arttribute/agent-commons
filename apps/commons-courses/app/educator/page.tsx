import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";
import EducatorProfile from "@/models/EducatorProfile";
import LiveSession from "@/models/LiveSession";
import { CopilotLauncher, type LauncherShortcut } from "@/components/educator/copilot-launcher";

export default async function EducatorHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator");

  await connectDB();
  const filter = buildManagedCoursesFilter({
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role,
  });
  const sharedCourseCount = session.user.role === "admin" ? 0 : await Course.countDocuments(filter);
  const profile = await EducatorProfile.findOne({ userId: session.user.id }).lean();
  if (!profile && session.user.role !== "admin" && sharedCourseCount === 0) {
    redirect("/educator/settings");
  }

  const courses = await Course.find(session.user.role === "admin" ? {} : filter)
    .select("title slug published")
    .sort({ updatedAt: -1 })
    .limit(20)
    .lean<Array<{ _id: unknown; title: string; slug: string; published?: boolean }>>();
  const liveSessions = await LiveSession.find({
    courseId: { $in: courses.map((course) => course._id) },
    status: { $in: ["live", "lobby"] },
  })
    .select("title courseSlug")
    .limit(2)
    .lean<Array<{ _id: unknown; title: string; courseSlug: string }>>();

  const shortcuts: LauncherShortcut[] = [
    ...liveSessions.map((item) => ({
      href: `/educator/courses/${item.courseSlug}/live/${String(item._id)}?tab=run`,
      label: item.title,
      dot: "live" as const,
    })),
    ...courses.slice(0, 3).map((course) => ({
      href: `/educator/courses/${course.slug}`,
      label: course.title,
      dot: course.published ? ("published" as const) : ("draft" as const),
    })),
    { href: "/educator/courses/new", label: "New course", icon: "new" },
    { href: "/educator/courses", label: "All courses", icon: "courses" },
    { href: "/educator/analytics", label: "Analytics", icon: "analytics" },
    { href: "/educator/copilot", label: "Create from files", icon: "ai" },
  ];

  const firstName = (session.user.name || "").split(" ")[0];

  return <CopilotLauncher greeting={firstName ? `Welcome back, ${firstName}` : "Welcome back"} shortcuts={shortcuts} />;
}
