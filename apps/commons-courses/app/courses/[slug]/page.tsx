import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { CourseOutline } from "@/components/courses/course-outline";
import { CoursePaymentOptions } from "@/components/courses/course-payment-options";
import { EnrolledBanner } from "@/components/courses/enrolled-banner";
import { EnrollmentAwareActions } from "@/components/courses/enrollment-aware-actions";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";
import { auth } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import {
  ArrowRight,
  ArrowLeft,
  Award,
  Clock,
  BookOpen,
  BarChart2,
  Users,
  CheckCircle,
  FlaskConical,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import {
  getCourseStartStatus,
  getLiveScheduleSummary,
  type LiveSchedule,
} from "@/lib/course-schedule";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ ref?: string; affiliate?: string }>;
}

interface LessonData {
  title: string;
  duration: string;
  description?: string;
  isFree: boolean;
}

interface ModuleData {
  title: string;
  description?: string;
  lessons: LessonData[];
}

interface CourseDetailData {
  _id: unknown;
  title: string;
  slug: string;
  tagline: string;
  description: string;
  longDescription: string;
  price: number;
  currency?: string;
  isFree: boolean;
  paymentProviders?: ("stripe" | "paystack")[];
  installmentPlan?: {
    enabled: boolean;
    label?: string;
    installmentAmount?: number;
    installmentCount?: number;
    releaseAccess:
      | "full_after_first_payment"
      | "module_by_module"
      | "full_after_completion";
  };
  courseType: "self-paced" | "live";
  startDate?: string | Date | null;
  liveSchedule?: LiveSchedule | null;
  sessionDates?: Array<string | Date>;
  level: "beginner" | "intermediate" | "advanced";
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  tags: string[];
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  skillPack?: {
    enabled?: boolean;
    title?: string;
    subtitle?: string;
    learnerPromise?: string;
    challenges?: Array<{
      id: string;
      title: string;
      shortTitle?: string;
      points?: number;
    }>;
  };
  modules: ModuleData[];
  accessProgram?: {
    discounts?: unknown[];
    earlyPaymentDiscounts?: Array<{
      active?: boolean;
      amountType?: "percent" | "fixed";
      amount?: number;
      deadline?: string | Date;
      label?: string;
    }>;
    scholarships?: unknown[];
    passes?: unknown[];
    affiliates?: unknown[];
  };
}

interface EnrollmentData {
  progress?: number;
}

function formatCoursePrice(course: { isFree: boolean; price: number; currency?: string }) {
  if (course.isFree) return "Free";
  if (["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "")) {
    return `Ksh ${course.price.toLocaleString("en-KE")}`;
  }
  return `$${course.price}`;
}

function formatInstallmentPlan(course: CourseDetailData, amount: number) {
  const count = course.installmentPlan?.installmentCount || 2;
  const planLabel = course.installmentPlan?.label || "Payment plan";
  const installmentPrice = formatCoursePrice({
    isFree: false,
    price: amount,
    currency: course.currency,
  });
  const isTwoPartKesPlan =
    count === 2 &&
    amount === 6000 &&
    ["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "");

  return {
    buttonLabel: planLabel,
    description: isTwoPartKesPlan
      ? `${installmentPrice} at the start of the course, then ${installmentPrice} in week 2.`
      : `${count} installments of ${installmentPrice}.`,
  };
}

function getCourseImageUrl(course?: {
  previewImageUrl?: string | null;
  bannerImageUrl?: string | null;
  imageUrl?: string | null;
}) {
  return (
    course?.previewImageUrl ||
    course?.bannerImageUrl ||
    course?.imageUrl ||
    `${getAppBaseUrl()}/opengraph-image`
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  await connectDB();
  const course = (await Course.findOne({ slug, published: true })
    .select("title tagline description imageUrl bannerImageUrl previewImageUrl")
    .lean()) as
    | (Pick<
        CourseDetailData,
        "title" | "tagline" | "description" | "imageUrl" | "bannerImageUrl" | "previewImageUrl"
      > & { slug?: string })
    | null;

  if (!course) return {};

  const title = course.title;
  const description = course.tagline || course.description;
  const image = getCourseImageUrl(course);

  return {
    title,
    description,
    openGraph: {
      title: `${course.title} | CommonLab`,
      description,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: course.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function CoursePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const affiliateCode = query.affiliate || query.ref;
  await connectDB();
  const course = (await Course.findOne({ slug, published: true }).lean()) as
    | CourseDetailData
    | null;
  if (!course) notFound();
  const session = await auth();
  const enrollment = session?.user?.id
    ? ((await Enrollment.findOne({
        userId: session.user.id,
        courseId: course._id,
      })
        .select("progress")
        .lean()) as EnrollmentData | null)
    : null;
  const isEnrolled = Boolean(enrollment);
  const enrollmentProgress = enrollment?.progress ?? 0;
  const bannerImageUrl = course.bannerImageUrl || course.imageUrl || null;
  const isCourseMedia = Boolean(bannerImageUrl?.includes("/api/media/"));
  const startStatus = getCourseStartStatus(course.startDate);
  const liveScheduleSummary = getLiveScheduleSummary(course.liveSchedule);
  const skillChallenges =
    course.skillPack?.enabled && course.skillPack.challenges?.length
      ? course.skillPack.challenges
      : [];

  const totalMinutes = course.modules
    .flatMap((m) => m.lessons)
    .reduce((acc, l) => acc + parseInt(l.duration), 0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
      <AnalyticsTracker
        courseSlug={course.slug}
        page="course.detail"
        metadata={{
          affiliateCode,
          price: course.price,
          currency: course.currency,
          isFree: course.isFree,
        }}
      />
      <Nav />
      <div className="pt-20">
        <div className="relative bg-white border-b border-slate-100">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <Link
              href="/courses"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors mb-8"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All courses
            </Link>

            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:gap-10">
              {/* Intro */}
              <section className="min-w-0">
                {bannerImageUrl ? (
                  <div
                    className={`mb-8 aspect-[16/9] overflow-hidden rounded-xl border border-slate-200 ${
                      isCourseMedia ? "bg-white p-2" : "bg-slate-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={bannerImageUrl}
                      alt=""
                      className={`h-full w-full ${
                        isCourseMedia ? "rounded-lg object-contain" : "object-cover"
                      }`}
                    />
                  </div>
                ) : null}
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-xs font-bold px-2 py-1 rounded-md border border-slate-300 text-slate-700 bg-slate-50">
                    {course.level}
                  </span>
                  {course.isFree ? (
                    <span className="text-xs font-bold px-2 py-1 rounded-md border border-slate-300 text-slate-700 bg-slate-50">
                      Free
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-1 rounded-md border border-slate-900 text-slate-900 bg-white">
                      Paid
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md bg-lime-100 text-slate-800">
                    <FlaskConical className="h-3 w-3" />
                    Lab-ready
                  </span>
                  {startStatus.label ? (
                    <span className="text-xs font-bold px-2 py-1 rounded-md border border-slate-200 bg-white text-slate-700">
                      Starts {startStatus.label}
                    </span>
                  ) : null}
                </div>

                <h1 className="break-words text-3xl font-semibold text-slate-950 mb-4 leading-tight sm:text-4xl">
                  {course.title}
                </h1>
                <p className="max-w-xl break-words text-[17px] text-slate-800 leading-8 mb-6">
                  {course.tagline}
                </p>

                <div className="flex flex-wrap items-center gap-5 text-[15px] text-slate-700 mb-8">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {course.duration}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    {course.lessonsCount} lessons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BarChart2 className="h-3.5 w-3.5" />
                    {course.modulesCount} modules
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    By {course.instructor}
                  </span>
                </div>

                {course.courseType === "live" && (
                  <div className="mb-8 max-w-2xl rounded-xl border border-lime-200 bg-lime-50 p-4">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-950">
                      <Wifi className="h-4 w-4" />
                      Live class schedule
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {liveScheduleSummary ||
                        "Live meeting details will be shared by the organizer."}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      The {course.lessonsCount} lessons are the course content
                      library. Live classes are scheduled cohort sessions for
                      discussion, walkthroughs, and support.
                    </p>
                  </div>
                )}

                <EnrolledBanner
                  courseSlug={course.slug}
                  initialEnrolled={isEnrolled}
                  initialProgress={enrollmentProgress}
                  hasStarted={startStatus.started}
                  startDateLabel={startStatus.label}
                  className="mb-8 max-w-2xl"
                />

                <div className="flex flex-wrap gap-2">
                  {course.tags.map((tag) => (
                    <span
                      key={tag}
                      className="max-w-full break-words text-sm px-2.5 py-1 rounded-md border border-slate-200 text-slate-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              {/* Sticky purchase card */}
              <aside className="min-w-0 lg:row-span-2">
                <div className="lg:sticky lg:top-24">
                  <PurchaseCard
                    course={course}
                    affiliateCode={affiliateCode}
                    isEnrolled={isEnrolled}
                    enrollmentProgress={enrollmentProgress}
                    hasStarted={startStatus.started}
                    startDateLabel={startStatus.label}
                  />
                </div>
              </aside>

              {/* Course content */}
              <section className="min-w-0 pt-4 lg:pt-8">
                {/* About */}
                <div className="mb-12">
                  <h2 className="text-lg font-bold text-slate-900 mb-4">
                    About this course
                  </h2>
                  <p className="break-words text-[15px] text-slate-800 leading-7">
                    {course.longDescription}
                  </p>
                </div>

                <div className="mb-12 rounded-xl border border-slate-200 bg-slate-50 p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-lime-300">
                      <ShieldCheck className="h-5 w-5 text-slate-950" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 mb-2">
                        How practice fits in
                      </h2>
                      <p className="text-[15px] leading-7 text-slate-800">
                        CommonLab courses can pair lessons with daily skill
                        badges, practical assignments, and safe agent practice:
                        prompts, tool calls, workflows, logs, and review
                        checkpoints before learners move into real integrations.
                      </p>
                    </div>
                  </div>
                </div>

                {skillChallenges.length > 0 ? (
                  <div className="mb-12 rounded-xl border border-amber-200 bg-amber-50/60 p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-200">
                          <Award className="h-5 w-5 text-amber-800" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-slate-900 mb-2">
                            Daily skill badges in this course
                          </h2>
                          <p className="text-[15px] leading-7 text-slate-800">
                            This course includes atomic skill challenges learners
                            can complete one at a time. Each challenge is small
                            enough to stand on its own and meaningful enough to
                            count as an earned skill badge.
                          </p>
                        </div>
                      </div>
                      <Link
                        href={`/skills/${course.slug}`}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
                      >
                        Open skill path <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                    <div className="mt-5 grid gap-2 sm:grid-cols-2">
                      {skillChallenges.slice(0, 6).map((challenge) => (
                        <div
                          key={challenge.id}
                          className="rounded-lg border border-amber-200 bg-white px-3 py-2"
                        >
                          <p className="truncate text-sm font-bold text-slate-900">
                            {challenge.shortTitle || challenge.title}
                          </p>
                          <p className="text-xs font-semibold text-amber-700">
                            {challenge.points ?? 0} pts
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* What you will learn */}
                <div className="mb-12">
                  <h2 className="text-lg font-bold text-slate-900 mb-5">
                    What you will learn
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {course.modules.map((m) => (
                      <div key={m.title} className="flex items-start gap-2.5">
                        <CheckCircle className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-700">
                          {m.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Course outline */}
                <div>
                  <h2 className="text-lg font-bold text-slate-900 mb-3">
                    Course outline
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mb-5">
                    <span>{course.modulesCount} modules</span>
                    <span>·</span>
                    <span>{course.lessonsCount} lessons</span>
                    <span>·</span>
                    <span>~{totalMinutes} min total</span>
                  </div>
                  <CourseOutline modules={course.modules} enrolled={isEnrolled} />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="h-5 w-5 rounded bg-slate-950 flex items-center justify-center">
              <FlaskConical className="h-3 w-3 text-white" />
            </div>
            <span>© 2026 CommonLab</span>
          </div>
          <div className="flex gap-6">
            <Link
              href="/courses"
              className="hover:text-slate-700 transition-colors"
            >
              Courses
            </Link>
            <Link
              href="/terms"
              className="hover:text-slate-700 transition-colors"
            >
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PurchaseCard({
  course,
  affiliateCode,
  isEnrolled,
  enrollmentProgress,
  hasStarted,
  startDateLabel,
}: {
  course: CourseDetailData;
  affiliateCode?: string;
  isEnrolled: boolean;
  enrollmentProgress: number;
  hasStarted: boolean;
  startDateLabel: string | null;
}) {
  const providers = course.paymentProviders || ["stripe"];
  const supportsPaystack = providers.includes("paystack");
  const isKes = ["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "");
  const checkoutProviderParam = isKes
    ? "&provider=paystack"
    : supportsPaystack
      ? "&provider=paystack"
      : "";
  const installmentAmount =
    course.installmentPlan?.installmentAmount ||
    Math.ceil(course.price / (course.installmentPlan?.installmentCount || 4));
  const installmentPlan = formatInstallmentPlan(course, installmentAmount);
  const affiliateParam = affiliateCode
    ? `&affiliate=${encodeURIComponent(affiliateCode)}`
    : "";
  const accessProgramCount =
    (course.accessProgram?.discounts?.length || 0) +
    (course.accessProgram?.earlyPaymentDiscounts?.length || 0) +
    (course.accessProgram?.scholarships?.length || 0) +
    (course.accessProgram?.passes?.length || 0);
  const earlyDiscount = course.accessProgram?.earlyPaymentDiscounts?.find(
    (rule) => rule.active !== false && rule.deadline
  );

  return (
    <div className="w-full min-w-0 max-w-sm rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm lg:max-w-none">
      <div className="h-1 bg-slate-900" />
      <div className="p-6">
        <EnrollmentAwareActions
          courseSlug={course.slug}
          initialEnrolled={isEnrolled}
          initialProgress={enrollmentProgress}
          hasStarted={hasStarted}
          startDateLabel={startDateLabel}
        >
          <div className="text-3xl font-bold text-slate-900 mb-1">
            {formatCoursePrice(course)}
          </div>
          {!course.isFree && (
            <p className="text-xs text-slate-400 mb-5">
              One-time payment · Lifetime access
            </p>
          )}
          {startDateLabel && (
            <p className="mb-5 rounded-lg border border-lime-200 bg-lime-50 p-3 text-xs font-semibold leading-5 text-slate-800">
              Course content opens on {startDateLabel}. You can reserve your
              place now.
            </p>
          )}

          <CoursePaymentOptions
            courseSlug={course.slug}
            isFree={course.isFree}
            checkoutUrl={`/api/payments/checkout?courseSlug=${course.slug}${checkoutProviderParam}${affiliateParam}`}
            primaryLabel={
              !course.isFree && supportsPaystack && isKes
                ? "Pay with M-Pesa or card"
                : undefined
            }
            installment={
              !course.isFree && course.installmentPlan?.enabled
                ? {
                    checkoutUrl: `/api/payments/checkout?courseSlug=${course.slug}&plan=installment${checkoutProviderParam}${affiliateParam}`,
                    buttonLabel: installmentPlan.buttonLabel,
                    description: installmentPlan.description,
                  }
                : undefined
            }
          />

          {!course.isFree && accessProgramCount > 0 && (
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Codes are applied securely at checkout.
            </p>
          )}

          {!course.isFree && earlyDiscount?.deadline && (
            <p className="mt-2 rounded-lg bg-lime-50 p-3 text-xs leading-5 text-slate-700">
              Pay before {formatDate(earlyDiscount.deadline)} for an automatic{" "}
              {formatDiscount(earlyDiscount, course.currency)} early payment
              discount.
            </p>
          )}
        </EnrollmentAwareActions>

        <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
          {[
            `${course.lessonsCount} lessons`,
            `${course.duration} of content`,
            `${course.modulesCount} modules`,
            "Sandbox-oriented exercises",
            "Free preview lessons",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <CheckCircle className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDiscount(
  rule: { amountType?: "percent" | "fixed"; amount?: number },
  currency?: string
) {
  if (rule.amountType === "fixed") {
    return formatCoursePrice({
      isFree: false,
      price: rule.amount || 0,
      currency,
    });
  }
  return `${rule.amount || 0}%`;
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
