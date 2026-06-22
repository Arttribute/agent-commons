import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import Course from "@/models/Course";
import EducatorProfile from "@/models/EducatorProfile";
import Payment from "@/models/Payment";
import Enrollment from "@/models/Enrollment";
import { Nav } from "@/components/nav";
import { GeneralAgentDrawer } from "@/components/agents/general-agent-drawer";
import {
  ArrowRight,
  Award,
  BookOpen,
  CreditCard,
  LayoutDashboard,
  Rocket,
  Users,
} from "lucide-react";

export default async function EducatorDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator");

  await connectDB();
  const sharedCourseFilter = buildManagedCoursesFilter({
    userId: session.user.id,
    email: session.user.email,
    role: session.user.role,
  });
  const sharedCourseCount =
    session.user.role === "admin"
      ? 0
      : await Course.countDocuments(sharedCourseFilter);
  const profile = await EducatorProfile.findOne({ userId: session.user.id }).lean();
  if (!profile && session.user.role !== "admin" && sharedCourseCount === 0) {
    redirect("/educator/settings");
  }

  const courses = await Course.find(
    session.user.role === "admin" ? {} : sharedCourseFilter
  ).sort({ updatedAt: -1 }).lean();
  const courseIds = courses.map((course) => course._id);
  const [enrollmentCount, payments] = await Promise.all([
    Enrollment.countDocuments({ courseId: { $in: courseIds } }),
    Payment.find({ courseId: { $in: courseIds }, status: "completed" }).lean(),
  ]);
  const gross = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <GeneralAgentDrawer
        context={{
          page: "educator.dashboard",
          title: "Educator console",
          visibleText: "Educator console with courses, students, assignments, and payments",
        }}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">
              Educator console
            </p>
            <h1 className="text-3xl font-bold text-slate-950">
              Manage your learning community
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Courses are the base. Skill badges and builder quests help learners
              practice daily, show progress, and move toward real projects.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/educator/analytics"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Analytics
            </Link>
            <Link
              href="/educator/settings"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Settings
            </Link>
            <Link
              href="/educator/courses/new"
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              New course
            </Link>
          </div>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Metric icon={BookOpen} label="Courses" value={courses.length} />
          <Metric icon={Users} label="Students" value={enrollmentCount} />
          <Metric icon={CreditCard} label="Completed sales" value={gross.toLocaleString()} />
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <FormatCard
            icon={BookOpen}
            title="Courses"
            body="Create structured learning paths with modules, lessons, assignments, and access."
            href="/educator/courses/new"
            action="Create course"
          />
          <FormatCard
            icon={Award}
            title="Skill badges"
            body="Attach atomic daily challenges to courses so learners can earn skills and keep streaks."
            href="/skills"
            action="View skills"
          />
          <FormatCard
            icon={Rocket}
            title="Builder quests"
            body="Guide learners into prototypes, build nights, hackathons, demos, and showcases."
            href="/builders"
            action="View Builders"
          />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Your courses</h2>
          </div>
          {courses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
              <p className="mb-4 text-sm text-slate-500">
                Create your first course and publish when ready.
              </p>
              <Link
                href="/educator/courses/new"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-bold text-white"
              >
                Create course <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {courses.map((course) => (
                <Link
                  key={String(course._id)}
                  href={`/educator/courses/${course.slug}`}
                  className="grid gap-3 border-b border-slate-100 p-4 transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-900">{course.title}</h3>
                      <span className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
                        {course.published ? "Published" : "Draft"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">{course.tagline}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <LayoutDashboard className="h-4 w-4 text-slate-400" />
                    Open dashboard
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <Icon className="mb-4 h-5 w-5 text-slate-400" />
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function FormatCard({
  icon: Icon,
  title,
  body,
  href,
  action,
}: {
  icon: typeof BookOpen;
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 p-5 transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <Icon className="mb-4 h-5 w-5 text-slate-500" />
      <h2 className="font-bold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
        {action} <ArrowRight className="h-3.5 w-3.5" />
      </p>
    </Link>
  );
}
