import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import EducatorProfile from "@/models/EducatorProfile";
import Payment from "@/models/Payment";
import Enrollment from "@/models/Enrollment";
import { Nav } from "@/components/nav";
import { GeneralAgentDrawer } from "@/components/agents/general-agent-drawer";
import { ArrowRight, BookOpen, CreditCard, Users } from "lucide-react";

export default async function EducatorDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator");

  await connectDB();
  const profile = await EducatorProfile.findOne({ userId: session.user.id }).lean();
  if (!profile && session.user.role !== "admin") {
    redirect("/educator/settings");
  }

  const courseFilter =
    session.user.role === "admin" ? {} : { "educator.userId": session.user.id };
  const courses = await Course.find(courseFilter).sort({ updatedAt: -1 }).lean();
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
              Manage your courses
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Courses, students, assignments, submissions, and payment activity.
            </p>
          </div>
          <div className="flex gap-2">
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
            <div className="overflow-hidden rounded-xl border border-slate-200">
              {courses.map((course) => (
                <div
                  key={String(course._id)}
                  className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 md:grid-cols-[1fr_auto]"
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
                  <div className="flex flex-wrap items-center gap-2">
                    <CourseLink slug={course.slug} label="Edit" href="edit" />
                    <CourseLink slug={course.slug} label="Students" href="students" />
                    <CourseLink slug={course.slug} label="Assignments" href="assignments" />
                    <CourseLink slug={course.slug} label="Payments" href="payments" />
                  </div>
                </div>
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

function CourseLink({
  slug,
  href,
  label,
}: {
  slug: string;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={`/educator/courses/${slug}/${href}`}
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}
