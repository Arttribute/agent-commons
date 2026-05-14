import Link from "next/link";
import { AlertTriangle, ArrowLeft, CreditCard } from "lucide-react";
import { Nav } from "@/components/nav";

interface Props {
  searchParams: Promise<{
    code?: string;
    courseSlug?: string;
    provider?: string;
    message?: string;
  }>;
}

const fallbackTitle = "Payment could not be started";

function getErrorCopy({
  code,
  provider,
  message,
}: {
  code?: string;
  provider?: string;
  message?: string;
}) {
  if (message) {
    return {
      title: fallbackTitle,
      detail: message,
    };
  }

  if (code === "provider_not_enabled") {
    return {
      title: "This payment option is not available",
      detail: provider
        ? `${provider} has not been enabled for this course yet.`
        : "The selected payment provider has not been enabled for this course yet.",
    };
  }

  if (code === "invalid_payment_plan") {
    return {
      title: "That payment plan is not available",
      detail:
        "The course owner has not enabled that installment option, or the plan was changed recently.",
    };
  }

  if (code === "course_not_found") {
    return {
      title: "Course not found",
      detail: "The course may be unpublished or no longer available.",
    };
  }

  return {
    title: fallbackTitle,
    detail:
      "We could not open checkout for this course. Please try another payment option or return to the course page.",
  };
}

export default async function PaymentErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const { title, detail } = getErrorCopy(params);
  const courseHref = params.courseSlug ? `/courses/${params.courseSlug}` : "/courses";

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <main className="mx-auto flex max-w-2xl flex-col px-4 pb-16 pt-28 sm:px-6">
        <Link
          href={courseHref}
          className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={courseHref}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:opacity-90"
            >
              Try again <CreditCard className="h-4 w-4" />
            </Link>
            <Link
              href="/courses"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Browse courses
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
