import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { buildManagedCoursesFilter } from "@/lib/educator-auth";
import { buildEducatorAnalyticsSummary } from "@/lib/analytics";
import Course from "@/models/Course";
import { ConsolePage } from "@/components/educator/console-page";
import { EmptyState, List, ListRow, PageHeader, StatStrip } from "@/components/ui/surface";

export default async function EducatorAnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/educator/analytics");

  await connectDB();
  const courses = await Course.find(
    session.user.role === "admin"
      ? {}
      : buildManagedCoursesFilter({ userId: session.user.id, email: session.user.email, role: session.user.role }),
  )
    .select("_id title slug currency")
    .sort({ updatedAt: -1 })
    .lean();
  const summary = await buildEducatorAnalyticsSummary({
    courseIds: courses.map((course) => course._id as never),
    days: 30,
  });

  return (
    <ConsolePage>
      <PageHeader title="Analytics" meta={`All courses · last ${summary.windowDays} days`} />
      <StatStrip
        className="mb-6"
        items={[
          { label: "Visitors", value: summary.totals.uniqueVisitors },
          { label: "Course views", value: summary.totals.courseViews },
          { label: "Completed sales", value: summary.totals.completedPayments },
          { label: "Discounts", value: formatMoney(summary.totals.discountsGiven) },
        ]}
      />
      {courses.length ? (
        <List>
          {courses.map((course, index) => {
            const item = summary.courses[index];
            return (
              <ListRow
                key={String(course._id)}
                href={`/educator/courses/${course.slug}/analytics`}
                title={course.title}
                meta={`${item?.totals.courseViews || 0} views · ${item?.totals.enrollments || 0} learners${
                  item?.totals.stalePendingPayments ? ` · ${item.totals.stalePendingPayments} stuck checkouts` : ""
                }`}
                trailing={
                  <span className="text-sm tabular-nums">
                    {formatMoney(item?.totals.grossRevenue || 0, course.currency)}
                  </span>
                }
              />
            );
          })}
        </List>
      ) : (
        <EmptyState icon={BarChart3} title="No courses yet" />
      )}
    </ConsolePage>
  );
}

function formatMoney(amount: number, currency = "USD") {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat(code === "KES" ? "en-KE" : "en-US", { style: "currency", currency: code }).format(amount);
}
