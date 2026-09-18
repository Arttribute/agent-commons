import { redirect } from "next/navigation";
import { requireEducatorCourse } from "@/lib/educator-auth";
import { buildCourseAnalyticsSummary } from "@/lib/analytics";
import { AnalyticsBreakdowns, FunnelCard } from "@/components/educator/analytics-breakdowns";
import { CourseSectionHeader } from "@/components/educator/course-section-header";
import { Disclosure, StatStrip } from "@/components/ui/surface";

export default async function CourseAnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const summary = await buildCourseAnalyticsSummary({ courseId: result.course._id, courseSlug: slug, days: 30 });
  const currency = result.course.currency;
  const pending = summary.recentPendingPayments;

  return (
    <div className="space-y-6">
      <CourseSectionHeader section="analytics" meta={`Last ${summary.windowDays} days`} />
      <StatStrip
        className="lg:grid-cols-5"
        items={[
          { label: "Course views", value: summary.totals.courseViews },
          { label: "Visitors", value: summary.totals.uniqueVisitors },
          { label: "Revenue", value: formatMoney(summary.totals.grossRevenue, currency) },
          { label: "Discounts", value: formatMoney(summary.totals.discountsGiven, currency) },
          { label: "Average progress", value: `${summary.totals.averageProgress}%` },
        ]}
      />
      <FunnelCard
        items={[
          { label: "View to checkout", value: summary.funnels.viewToCheckoutRate },
          { label: "Checkout completion", value: summary.funnels.checkoutCompletionRate },
          { label: "Likely abandonment", value: summary.funnels.pendingAbandonmentRate },
          { label: "Lesson completion", value: summary.funnels.lessonCompletionRate },
        ]}
      />
      <AnalyticsBreakdowns
        groups={[
          { key: "sources", label: "Sources", rows: summary.breakdowns.sources },
          { key: "pages", label: "Pages", rows: summary.breakdowns.pages },
          { key: "payments", label: "Payment status", rows: summary.breakdowns.paymentStatus },
          { key: "providers", label: "Providers", rows: summary.breakdowns.providers },
          { key: "codes", label: "Access codes", rows: summary.breakdowns.accessCodes },
          { key: "affiliates", label: "Affiliates", rows: summary.breakdowns.affiliates },
        ]}
      />
      <Disclosure
        title="Likely abandoned payments"
        summary={pending.length ? `${pending.length} checkouts pending for over 30 minutes` : "None in this window"}
      >
        {pending.length ? (
          <div className="divide-y divide-border">
            {pending.map((payment, index) => (
              <div key={`${payment.createdAt}-${index}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block capitalize">{payment.provider}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[payment.paymentPlan, payment.accessCode, payment.affiliateCode].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="tabular-nums">{formatMoney(payment.amount, payment.currency)}</span>
                <span className="text-xs text-muted-foreground">{formatDate(payment.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No pending checkout has aged past 30 minutes.</p>
        )}
      </Disclosure>
    </div>
  );
}

function formatMoney(amount: number, currency?: string) {
  const code = (currency || "USD").toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", { style: "currency", currency: code }).format(amount);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}
