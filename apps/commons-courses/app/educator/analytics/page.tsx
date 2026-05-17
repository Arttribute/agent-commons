import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BadgePercent, BookOpen, CreditCard, Users } from "lucide-react";
import { Nav } from "@/components/nav";
import { GeneralAgentDrawer } from "@/components/agents/general-agent-drawer";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import { buildEducatorAnalyticsSummary } from "@/lib/analytics";
import Course from "@/models/Course";

export default async function EducatorAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator/analytics");

  await connectDB();
  const courses = await Course.find(
    session.user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({
          userId: session.user.id,
          email: session.user.email,
          role: session.user.role,
        })
  )
    .select("_id title slug currency")
    .sort({ updatedAt: -1 })
    .lean();
  const summary = await buildEducatorAnalyticsSummary({
    courseIds: courses.map((course) => course._id as never),
    days: 30,
  });

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <GeneralAgentDrawer
        context={{
          page: "educator.analytics",
          title: "Analytics",
          visibleText: [
            `${courses.length} courses`,
            `${summary.totals.courseViews} course views`,
            `${summary.totals.completedPayments} completed payments`,
            `${summary.totals.stalePendingPayments} likely abandoned payments`,
          ].join("\n"),
        }}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-slate-950">Analytics</h1>
        <p className="mt-2 text-sm text-slate-500">
          Portfolio view across your courses · Last {summary.windowDays} days
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <Metric icon={BookOpen} label="Courses" value={courses.length} />
          <Metric icon={Users} label="Visitors" value={summary.totals.uniqueVisitors} />
          <Metric
            icon={Activity}
            label="Course views"
            value={summary.totals.courseViews}
          />
          <Metric
            icon={CreditCard}
            label="Completed sales"
            value={summary.totals.completedPayments}
          />
          <Metric
            icon={BadgePercent}
            label="Discounts"
            value={formatMoney(summary.totals.discountsGiven)}
          />
        </div>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Courses</h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {courses.map((course, index) => {
              const courseSummary = summary.courses[index];
              return (
                <div
                  key={String(course._id)}
                  className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-b-0 md:grid-cols-[1fr_100px_100px_100px_120px_auto]"
                >
                  <div>
                    <p className="font-bold text-slate-900">{course.title}</p>
                    <p className="text-xs text-slate-500">{course.slug}</p>
                  </div>
                  <span>{courseSummary?.totals.courseViews || 0} views</span>
                  <span>{courseSummary?.totals.enrollments || 0} students</span>
                  <span>{courseSummary?.totals.stalePendingPayments || 0} stuck</span>
                  <span>
                    {formatMoney(
                      courseSummary?.totals.grossRevenue || 0,
                      course.currency
                    )}
                  </span>
                  <Link
                    href={`/educator/courses/${course.slug}/analytics`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-center text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Open
                  </Link>
                </div>
              );
            })}
            {courses.length === 0 && (
              <p className="p-6 text-sm text-slate-500">
                Create or join a course to see analytics.
              </p>
            )}
          </div>
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
  icon: typeof Activity;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <Icon className="mb-3 h-4 w-4 text-slate-400" />
      <p className="break-words text-xl font-bold text-slate-950">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function formatMoney(amount: number, currency = "USD") {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", {
    style: "currency",
    currency: code,
  }).format(amount);
}
