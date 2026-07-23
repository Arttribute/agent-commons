import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { CourseOutline } from "@/components/courses/course-outline";
import { CoursePaymentOptions } from "@/components/courses/course-payment-options";
import { EnrolledBanner } from "@/components/courses/enrolled-banner";
import { EnrollmentAwareActions } from "@/components/courses/enrollment-aware-actions";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";
import { RichTextRenderer } from "@/components/rich-text-renderer";
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
  Users,
  CheckCircle,
  FlaskConical,
  Wifi,
  Target,
  Workflow,
  Layers,
  MessageSquare,
  FileText,
  Zap,
  type LucideIcon,
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
  assignment?: string;
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

interface CoursePresentation {
  eyebrow: string;
  heroSubtitle?: string;
  signal?: string;
  overviewTitle: string;
  overview: string[];
  audienceTitle: string;
  audienceIntro?: string;
  audience: string[];
  learningTitle: string;
  learning: string[];
  outputTitle: string;
  outputs: string[];
  projectExamples?: string[];
  gainTitle?: string;
  gains?: string[];
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

function isAiQuickWinsCourse(course: Pick<CourseDetailData, "slug" | "title">) {
  return /ai.*quick.*wins|quick.*wins.*leaders/i.test(
    `${course.slug} ${course.title}`
  );
}

function toOutlineModules(modules: ModuleData[]): ModuleData[] {
  return modules.map((module) => ({
    title: module.title,
    description: module.description,
    assignment: module.assignment,
    lessons: module.lessons.map((lesson) => ({
      title: lesson.title,
      duration: lesson.duration,
      description: lesson.description,
      isFree: Boolean(lesson.isFree),
    })),
  }));
}

function getCoursePresentation(course: CourseDetailData): CoursePresentation {
  if (isAiQuickWinsCourse(course)) {
    return {
      eyebrow: "AI Quick Wins for Leaders Masterclass",
      heroSubtitle:
        "Build real AI workspaces, workflows, and automations for your business or team.",
      signal: "This is not a basic ChatGPT prompting course.",
      overviewTitle: "Move from casual AI use to real AI-powered systems",
      overview: [
        "This practical 4-week online programme helps non-technical professionals build connected AI workspaces for real work: organizing knowledge, creating reusable instructions, connecting tools, and automating repetitive tasks.",
        "The course is beginner-friendly, but it is not shallow. We keep the language simple while building systems participants can keep using in daily operations.",
      ],
      audienceTitle: "Who this is for",
      audienceIntro:
        "For people who spend too much time following up, replying to messages, updating sheets, collecting information, preparing reports, organizing documents, or managing admin work. No coding experience is required.",
      audience: [
        "Business owners and founders",
        "Managers and team leaders",
        "Operations and admin teams",
        "Consultants and freelancers",
        "Marketers, creatives, and content teams",
      ],
      learningTitle: "What participants will learn",
      learning: [
        "Understand how AI is moving beyond chatbots into workspaces, agents, tools, and automations",
        "Identify repetitive tasks and workflows that can be improved with AI",
        "Build a focused AI workspace for a real business or work use case",
        "Organize documents, context, examples, and instructions so AI can support repeated tasks",
        "Create reusable agent skills, prompts, templates, and operating instructions",
        "Connect AI with tools such as Gmail, Google Sheets, WhatsApp, forms, Make, and n8n",
        "Build simple automations for follow-ups, notifications, summaries, reporting, and admin tasks",
        "Design workflows that combine AI, data, tools, and human review",
        "Use AI practically and responsibly in everyday operations",
      ],
      outputTitle: "What you will leave with",
      outputs: [
        "A structured AI workspace for a specific business or work function",
        "A mapped workflow showing how a manual process can be improved with AI",
        "Reusable prompts, templates, and operating instructions",
        "A working AI-assisted workflow or automation",
        "A simple plan for improving and expanding the system after the course",
      ],
      projectExamples: [
        "Customer inquiry assistant",
        "Lead follow-up workflow",
        "Form-to-WhatsApp notification system",
        "Reporting assistant",
        "Content repurposing workspace",
        "Admin automation",
        "Client onboarding workflow",
        "Meeting notes to action-items system",
      ],
      gainTitle: "The real shift",
      gains: [
        "By the end, participants should have a clearer understanding of how AI can support real work, confidence using AI beyond basic prompting, hands-on experience building AI workspaces and automations, and a working system they can apply in their business, team, or daily operations.",
        "Most importantly, participants stop asking, \"How do I use ChatGPT?\" and start asking, \"Which parts of my work can become smarter, faster, and easier with AI?\"",
      ],
    };
  }

  const assignments = course.modules
    .map((module) => module.assignment)
    .filter(Boolean) as string[];

  return {
    eyebrow: course.courseType === "live" ? "Live course" : "Course",
    heroSubtitle: course.tagline,
    overviewTitle: "What this course helps you do",
    overview: [
      course.description || course.tagline,
      "Work through the course in a focused sequence, then turn the lessons into a concrete result you can keep using.",
    ].filter(Boolean),
    audienceTitle: "Who this is for",
    audience: [
      `${course.level[0].toUpperCase()}${course.level.slice(1)} learners who want practical progress`,
      "People who prefer learning by building rather than watching passively",
      "Teams or individuals who want clearer workflows, reusable knowledge, and better execution",
    ],
    learningTitle: "What you will work through",
    learning: course.modules.map((module) => module.title),
    outputTitle: "Expected output",
    outputs:
      assignments.length > 0
        ? assignments.slice(0, 5)
        : [
            "A clearer working model for the course topic",
            "Reusable notes, prompts, templates, or workflows from the lessons",
            "A practical next-step plan after the course",
          ],
  };
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
  const url = `${getAppBaseUrl()}/courses/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${course.title} | CommonLab`,
      description,
      url,
      siteName: "CommonLab",
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
  const startStatus = getCourseStartStatus(course.startDate);
  const liveScheduleSummary = getLiveScheduleSummary(course.liveSchedule);
  const skillChallenges =
    course.skillPack?.enabled && course.skillPack.challenges?.length
      ? course.skillPack.challenges
      : [];
  const presentation = getCoursePresentation(course);
  const isAiQuickWins = isAiQuickWinsCourse(course);
  const outlineModules = toOutlineModules(course.modules);

  const totalMinutes = course.modules
    .flatMap((m) => m.lessons)
    .reduce((acc, l) => {
      const minutes = Number.parseInt(l.duration, 10);
      return Number.isFinite(minutes) ? acc + minutes : acc;
    }, 0);

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
      <main className="pt-16">
        <section className="border-b border-slate-200 bg-slate-50/70">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
            <Link
              href="/courses"
              className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All courses
            </Link>

            {bannerImageUrl ? (
              <div className="mb-10 aspect-[16/6] max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}

            <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_370px] xl:gap-20">
              <section className="min-w-0">
                <div className="mb-6 flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold capitalize text-slate-700">
                    {course.level}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-lime-200 px-2 py-1 text-xs font-bold text-slate-900">
                    <Wifi className="h-3 w-3" />
                    {course.courseType === "live" ? "Live programme" : "Self-paced"}
                  </span>
                  {startStatus.label ? (
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700">
                      Starts {startStatus.label}
                    </span>
                  ) : null}
                </div>

                <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-lime-700">
                  {presentation.eyebrow}
                </p>
                <h1 className="mb-5 max-w-4xl break-words text-4xl font-semibold leading-[1.08] text-slate-950 sm:text-5xl lg:text-[3.5rem]">
                  {course.title}
                </h1>
                <p className="mb-6 max-w-3xl break-words text-lg leading-8 text-slate-700 sm:text-xl">
                  {presentation.heroSubtitle || course.tagline}
                </p>
                {presentation.signal ? (
                  <div className="mb-8 flex max-w-3xl items-start gap-3 border-l-2 border-lime-500 pl-4">
                    <CheckCircle className="mt-1 h-4 w-4 flex-shrink-0 text-lime-600" />
                    <p className="text-sm font-bold leading-6 text-slate-950 sm:text-base">
                      {presentation.signal}
                    </p>
                  </div>
                ) : null}

                <div className="grid max-w-3xl gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
                  <HeroFact icon={Clock} label="Duration" value={course.duration} />
                  <HeroFact
                    icon={BookOpen}
                    label="Format"
                    value={course.courseType === "live" ? "Live cohort" : "Self-paced"}
                  />
                  <HeroFact icon={Users} label="Instructor" value={course.instructor} />
                </div>

                {course.courseType === "live" && (
                  <div className="mt-6 max-w-3xl border-t border-slate-200 pt-5">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-950">
                      <Wifi className="h-4 w-4" />
                      Live class schedule
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {liveScheduleSummary ||
                        "Live meeting details will be shared by the organizer."}
                    </p>
                  </div>
                )}

                <EnrolledBanner
                  courseSlug={course.slug}
                  initialEnrolled={isEnrolled}
                  initialProgress={enrollmentProgress}
                  hasStarted={startStatus.started}
                  startDateLabel={startStatus.label}
                  className="mt-6 max-w-3xl"
                />
              </section>

              <aside id="enroll" className="min-w-0 scroll-mt-36">
                <PurchaseCard
                  course={course}
                  affiliateCode={affiliateCode}
                  isEnrolled={isEnrolled}
                  enrollmentProgress={enrollmentProgress}
                  hasStarted={startStatus.started}
                  startDateLabel={startStatus.label}
                />
              </aside>
            </div>
          </div>
        </section>

        <nav
          aria-label="Course sections"
          className="sticky top-16 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-7 overflow-x-auto px-4 sm:px-6 lg:px-8">
            {[
              ["#overview", "Overview"],
              ["#outcomes", "Outcomes"],
              ...(presentation.projectExamples?.length
                ? [["#projects", "What you will build"]]
                : []),
              ["#curriculum", "Curriculum"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="flex h-14 shrink-0 items-center border-b-2 border-transparent text-sm font-semibold text-slate-600 transition-colors hover:border-lime-500 hover:text-slate-950"
              >
                {label}
              </a>
            ))}
            <a
              href="#enroll"
              className="ml-auto hidden h-9 shrink-0 items-center gap-1.5 rounded-md bg-slate-950 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800 sm:flex"
            >
              Enroll <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </nav>

        <CoursePresentationSections
          course={course}
          presentation={presentation}
          isAiQuickWins={isAiQuickWins}
        />

        {skillChallenges.length > 0 ? (
          <section className="border-y border-amber-200 bg-amber-50/60">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <div className="grid gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:items-start">
                <div>
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-200">
                    <Award className="h-5 w-5 text-amber-800" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-950">
                    Daily skill badges
                  </h2>
                  <p className="mt-3 max-w-lg text-[15px] leading-7 text-slate-700">
                    Complete focused challenges one at a time and turn practical
                    work into visible, earned skills.
                  </p>
                  <Link
                    href={`/skills/${course.slug}`}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Open skill path <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid gap-px overflow-hidden rounded-lg border border-amber-200 bg-amber-200 sm:grid-cols-2">
                  {skillChallenges.slice(0, 6).map((challenge) => (
                    <div key={challenge.id} className="bg-white p-4">
                      <p className="text-sm font-bold text-slate-900">
                        {challenge.shortTitle || challenge.title}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        {challenge.points ?? 0} pts
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section id="curriculum" className="scroll-mt-32 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-lime-700">
                  Curriculum
                </p>
                <h2 className="text-3xl font-semibold text-slate-950">
                  Course outline
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span>{course.modulesCount} modules</span>
                <span aria-hidden="true">·</span>
                <span>{course.lessonsCount} lessons</span>
                {totalMinutes > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>~{totalMinutes} min total</span>
                  </>
                ) : null}
              </div>
            </div>
            <CourseOutline modules={outlineModules} enrolled={isEnrolled} />
          </div>
        </section>
      </main>

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

function HeroFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-white px-4 py-3.5">
      <Icon className="h-4 w-4 flex-shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}

function CoursePresentationSections({
  course,
  presentation,
  isAiQuickWins,
}: {
  course: CourseDetailData;
  presentation: CoursePresentation;
  isAiQuickWins: boolean;
}) {
  return (
    <div>
      <section id="overview" className="scroll-mt-32 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8 lg:py-20">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-lime-700">
              Course promise
            </p>
            <h2 className="max-w-xl text-3xl font-semibold leading-tight text-slate-950 lg:text-4xl">
              {presentation.overviewTitle}
            </h2>
          </div>
          <div className="max-w-3xl space-y-5 text-base leading-8 text-slate-700">
            {presentation.overview.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section
        id="outcomes"
        className="scroll-mt-32 border-y border-slate-200 bg-slate-50"
      >
        <div className="mx-auto grid max-w-7xl px-4 sm:px-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:px-8">
          <div className="border-b border-slate-200 py-14 lg:border-b-0 lg:border-r lg:py-16 lg:pr-12">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-lime-300 text-slate-950">
              <Target className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-950">
              {presentation.audienceTitle}
            </h2>
            {presentation.audienceIntro ? (
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-600">
                {presentation.audienceIntro}
              </p>
            ) : null}
            <div className="mt-7 space-y-3">
              {presentation.audience.map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle className="mt-1 h-4 w-4 flex-shrink-0 text-lime-600" />
                  <span className="text-sm font-medium leading-6 text-slate-800">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="py-14 lg:py-16 lg:pl-12">
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Workflow className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-950">
              {presentation.learningTitle}
            </h2>
            <div className="mt-8 grid gap-x-10 gap-y-5 md:grid-cols-2">
              {presentation.learning.map((item, index) => (
                <div key={item} className="flex items-start gap-4 border-t border-slate-200 pt-4">
                  <span className="w-6 flex-shrink-0 text-xs font-bold tabular-nums text-lime-700">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm leading-6 text-slate-700">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:px-8 lg:py-16">
          <div>
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-800">
              <Layers className="h-5 w-5" />
            </div>
            <h2 className="text-2xl font-semibold text-slate-950">
              {presentation.outputTitle}
            </h2>
          </div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {presentation.outputs.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle className="mt-1 h-4 w-4 flex-shrink-0 text-lime-600" />
                <span className="text-[15px] leading-7 text-slate-700">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {presentation.projectExamples?.length ? (
        <section id="projects" className="scroll-mt-32 bg-slate-950 text-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
              <div>
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-lime-300 text-slate-950">
                  <Zap className="h-5 w-5" />
                </div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-lime-300">
                  Practical from day one
                </p>
                <h2 className="text-3xl font-semibold text-white">
                  What you will build
                </h2>
                <p className="mt-4 max-w-lg text-[15px] leading-7 text-slate-300">
                  Each participant should leave with at least one practical
                  AI-powered system they can continue using.
                </p>
              </div>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {presentation.projectExamples.map((project, index) => (
                  <div
                    key={project}
                    className="flex items-start gap-4 border-t border-slate-700 py-4"
                  >
                    <span className="text-xs font-bold tabular-nums text-lime-300">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm font-semibold leading-6 text-slate-100">
                      {project}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {presentation.gains?.length ? (
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] lg:px-8 lg:py-20">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200">
                <MessageSquare className="h-5 w-5 text-slate-700" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime-700">
                  Outcome
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-slate-950">
                  {presentation.gainTitle || "What participants gain"}
                </h2>
              </div>
            </div>
            <div className="space-y-5 text-base leading-8 text-slate-700">
              {presentation.gains.map((gain, index) =>
                index === presentation.gains!.length - 1 ? (
                  <blockquote
                    key={gain}
                    className="border-l-2 border-lime-500 pl-5 text-xl font-semibold leading-8 text-slate-950"
                  >
                    {gain}
                  </blockquote>
                ) : (
                  <p key={gain}>{gain}</p>
                )
              )}
            </div>
          </div>
        </section>
      ) : null}

      {!isAiQuickWins && course.longDescription ? (
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)] lg:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200">
                <FileText className="h-5 w-5 text-slate-700" />
              </div>
              <h2 className="pt-1.5 text-2xl font-semibold text-slate-950">
                About this course
              </h2>
            </div>
            <RichTextRenderer
              value={course.longDescription}
              className="max-w-3xl break-words text-slate-700"
            />
          </div>
        </section>
      ) : null}
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
    <div className="w-full min-w-0 max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_50px_-28px_rgba(15,23,42,0.45)] lg:max-w-none">
      <div className="h-1 bg-lime-400" />
      <div className="p-5 sm:p-6">
        <EnrollmentAwareActions
          courseSlug={course.slug}
          initialEnrolled={isEnrolled}
          initialProgress={enrollmentProgress}
          hasStarted={hasStarted}
          startDateLabel={startDateLabel}
        >
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Enrollment
          </p>
          <div className="mb-1 text-3xl font-bold text-slate-950">
            {formatCoursePrice(course)}
          </div>
          {!course.isFree && (
            <p className="mb-5 text-xs text-slate-500">
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
