import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  CreditCard,
  GraduationCap,
} from "lucide-react";
import { requireEducatorCourse } from "@/lib/educator-auth";
import Enrollment from "@/models/Enrollment";
import Payment from "@/models/Payment";
import Assignment from "@/models/Assignment";

export default async function CourseDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await requireEducatorCourse(slug);
  if (result.error) redirect("/educator");

  const [students, payments, assignments] = await Promise.all([
    Enrollment.countDocuments({ courseId: result.course._id }),
    Payment.find({ courseId: result.course._id, status: "completed" }).lean(),
    Assignment.countDocuments({ courseId: result.course._id }),
  ]);
  const gross = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const modules = result.course.modules?.length || 0;
  const lessons =
    result.course.modules?.reduce((sum, module) => sum + (module.lessons?.length || 0), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">
            Course dashboard
          </p>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">Manage the course</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            A single workspace for content, learners, revenue, access, automation, and team operations.
          </p>
        </div>
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          View public page
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={GraduationCap} label="Students" value={students} />
        <Metric icon={CreditCard} label="Completed revenue" value={formatMoney(gross, result.course.currency)} />
        <Metric icon={BookOpen} label="Content" value={`${modules} modules / ${lessons} lessons`} />
        <Metric icon={ClipboardList} label="Assignments" value={assignments} />
      </div>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ActionCard
          icon={BookOpen}
          title="Build course content"
          body="Organize modules, lesson details, preview access, and course structure."
          href={`/educator/courses/${slug}/content`}
        />
        <ActionCard
          icon={Award}
          title="Attach daily skill badges"
          body="Create atomic challenges that can live inside this course and also stand alone on the Skills page."
          href={`/educator/courses/${slug}/skills`}
        />
        <ActionCard
          icon={CreditCard}
          title="Price and access"
          body="Keep checkout settings, access programs, scholarships, passes, and affiliates together."
          href={`/educator/courses/${slug}/access`}
        />
        <ActionCard
          icon={BarChart3}
          title="Understand performance"
          body="Review traffic, sales, student progress, funnels, and payment signals."
          href={`/educator/courses/${slug}/analytics`}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-bold text-slate-900">Course snapshot</h3>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <Snapshot label="Level" value={result.course.level} />
          <Snapshot label="Type" value={result.course.courseType} />
          <Snapshot label="Duration" value={result.course.duration} />
          <Snapshot label="Instructor" value={result.course.instructor || "Not set"} />
          <Snapshot label="Price" value={result.course.isFree ? "Free" : formatMoney(result.course.price, result.course.currency)} />
          <Snapshot label="Updated" value={formatDate(result.course.updatedAt)} />
        </dl>
      </section>
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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <Icon className="mb-3 h-4 w-4 text-slate-400" />
      <p className="break-words text-xl font-bold text-slate-950">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  body,
  href,
}: {
  icon: typeof BookOpen;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <Icon className="mb-4 h-5 w-5 text-slate-500" />
      <h3 className="font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
    </Link>
  );
}

function Snapshot({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-bold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-slate-950">{value}</dd>
    </div>
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
    year: "numeric",
  }).format(new Date(value));
}
