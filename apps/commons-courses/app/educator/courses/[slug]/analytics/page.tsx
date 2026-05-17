import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BadgePercent, CreditCard, MousePointerClick, Users } from "lucide-react";
import { Nav } from "@/components/nav";
import { CourseAgentDrawer } from "@/components/course-agents/course-agent-drawer";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { buildCourseAnalyticsSummary } from "@/lib/analytics";
import type { CourseAgentConfig } from "@/types/course-agent";

export default async function CourseAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const summary = await buildCourseAnalyticsSummary({
    courseId: result.course._id,
    courseSlug: slug,
    days: 30,
  });
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
          page: "educator.analytics",
          title: "Analytics",
          visibleText: [
            result.course.title,
            `${summary.totals.courseViews} course views`,
            `${summary.totals.completedPayments} completed payments`,
            `${summary.totals.stalePendingPayments} likely abandoned payments`,
            `${summary.funnels.checkoutCompletionRate}% checkout completion`,
          ].join("\n"),
        }}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <Link href="/educator" className="text-sm font-bold text-slate-500">
          Back to educator console
        </Link>
        <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-950">Analytics</h1>
            <p className="mt-2 text-sm text-slate-500">
              {result.course.title} · Last {summary.windowDays} days
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CourseLink slug={slug} href="students" label="Students" />
            <CourseLink slug={slug} href="payments" label="Payments" />
            <CourseLink slug={slug} href="edit" label="Edit" />
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-5">
          <Metric
            icon={MousePointerClick}
            label="Course views"
            value={summary.totals.courseViews}
          />
          <Metric icon={Users} label="Visitors" value={summary.totals.uniqueVisitors} />
          <Metric
            icon={CreditCard}
            label="Gross revenue"
            value={formatMoney(summary.totals.grossRevenue, result.course.currency)}
          />
          <Metric
            icon={BadgePercent}
            label="Discounts"
            value={formatMoney(summary.totals.discountsGiven, result.course.currency)}
          />
          <Metric
            icon={Activity}
            label="Avg progress"
            value={`${summary.totals.averageProgress}%`}
          />
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Funnel label="View to checkout" value={summary.funnels.viewToCheckoutRate} />
          <Funnel label="Checkout completion" value={summary.funnels.checkoutCompletionRate} />
          <Funnel label="Likely abandonment" value={summary.funnels.pendingAbandonmentRate} />
          <Funnel label="Lesson completion" value={summary.funnels.lessonCompletionRate} />
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <Breakdown title="Sources" rows={summary.breakdowns.sources} />
          <Breakdown title="Payment status" rows={summary.breakdowns.paymentStatus} />
          <Breakdown title="Providers" rows={summary.breakdowns.providers} />
          <Breakdown title="Access codes" rows={summary.breakdowns.accessCodes} />
          <Breakdown title="Affiliates" rows={summary.breakdowns.affiliates} />
          <Breakdown title="Page activity" rows={summary.breakdowns.pages} />
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-slate-900">
            Likely abandoned payments
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {summary.recentPendingPayments.map((payment, index) => (
              <div
                key={`${payment.createdAt}-${index}`}
                className="grid gap-3 border-b border-slate-100 p-4 text-sm last:border-b-0 md:grid-cols-[1fr_120px_120px_120px]"
              >
                <div>
                  <p className="font-bold text-slate-900">{payment.provider}</p>
                  <p className="text-xs text-slate-500">
                    {payment.accessCode || "No code"} · {payment.affiliateCode || "No affiliate"}
                  </p>
                </div>
                <span>{payment.paymentPlan}</span>
                <span>{formatMoney(payment.amount, payment.currency)}</span>
                <span>{formatDate(payment.createdAt)}</span>
              </div>
            ))}
            {summary.recentPendingPayments.length === 0 && (
              <p className="p-6 text-sm text-slate-500">
                No pending checkout has aged past 30 minutes in this window.
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

function Funnel({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-bold text-slate-900">{label}</span>
        <span className="text-slate-500">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold text-slate-900">{title}</h2>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        {rows.slice(0, 8).map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between border-b border-slate-100 p-3 text-sm last:border-b-0"
          >
            <span className="break-words font-medium text-slate-800">{row.label}</span>
            <span className="font-bold text-slate-950">{row.count}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-slate-500">No data yet.</p>}
      </div>
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

function formatMoney(amount: number, currency?: string) {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", {
    style: "currency",
    currency: code,
  }).format(amount);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
