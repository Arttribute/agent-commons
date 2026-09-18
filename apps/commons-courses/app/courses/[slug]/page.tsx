import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { SiteFooter } from "@/components/site-footer";
import { CourseDetailTabs } from "@/components/courses/course-detail-tabs";
import { CourseOutline } from "@/components/courses/course-outline";
import { CoursePaymentOptions } from "@/components/courses/course-payment-options";
import { EnrolledBanner } from "@/components/courses/enrolled-banner";
import { EnrollmentAwareActions } from "@/components/courses/enrollment-aware-actions";
import {
  CourseExperienceGallery,
  type CourseExperienceCard,
} from "@/components/courses/course-experience-gallery";
import { AnalyticsTracker } from "@/components/analytics/analytics-tracker";
import { RichTextRenderer } from "@/components/rich-text-renderer";
import { auth } from "@/lib/auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { getCourseThemeStyle, type CourseTheme } from "@/lib/course-theme";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import ExperienceProject from "@/models/ExperienceProject";
import ExperienceRevision from "@/models/ExperienceRevision";
import type { ExperienceDocument } from "@/types/experience";
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  BookOpen,
  Users,
  CheckCircle,
  Wifi,
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
  catalogVisibility?: "public" | "private";
  educator?: { userId?: unknown };
  collaborators?: Array<{
    userId?: unknown;
    email?: string;
  }>;
  tags: string[];
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  theme?: CourseTheme;
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

function formatCoursePrice(course: {
  isFree: boolean;
  price: number;
  currency?: string;
}) {
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
    `${course.slug} ${course.title}`,
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
        'Most importantly, participants stop asking, "How do I use ChatGPT?" and start asking, "Which parts of my work can become smarter, faster, and easier with AI?"',
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
    .where("catalogVisibility")
    .ne("private")
    .select("title tagline description imageUrl bannerImageUrl previewImageUrl")
    .lean()) as
    | (Pick<
        CourseDetailData,
        | "title"
        | "tagline"
        | "description"
        | "imageUrl"
        | "bannerImageUrl"
        | "previewImageUrl"
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
  const course = (await Course.findOne({
    slug,
    published: true,
  }).lean()) as CourseDetailData | null;
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
  const managesCourse = Boolean(
    session?.user?.id &&
      (session.user.role === "admin" ||
        String(course.educator?.userId || "") === session.user.id ||
        course.collaborators?.some(
          (collaborator) =>
            String(collaborator.userId || "") === session.user.id ||
            collaborator.email?.toLowerCase() ===
              session.user.email?.toLowerCase(),
        )),
  );
  if (course.catalogVisibility === "private" && !isEnrolled && !managesCourse) {
    notFound();
  }
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
  const experienceProjects = (await ExperienceProject.find({
    courseId: course._id,
    status: "published",
    publishedRevisionId: { $exists: true },
  })
    .select("_id isFreePreview publishedRevisionId")
    .sort({ publishedAt: -1 })
    .lean()) as Array<{
    _id: unknown;
    isFreePreview: boolean;
    publishedRevisionId: unknown;
  }>;
  const experienceRevisions = (await ExperienceRevision.find({
    _id: {
      $in: experienceProjects.map(
        (experience) => experience.publishedRevisionId,
      ),
    },
  })
    .select("_id document")
    .lean()) as Array<{ _id: unknown; document: ExperienceDocument }>;
  const experienceRevisionById = new Map(
    experienceRevisions.map((revision) => [
      String(revision._id),
      revision.document,
    ]),
  );
  const experiences: CourseExperienceCard[] = experienceProjects.flatMap(
    (experience) => {
      const document = experienceRevisionById.get(
        String(experience.publishedRevisionId),
      );
      return document
        ? [
            {
              id: String(experience._id),
              title: document.title,
              description:
                document.description || "An immersive learning experience.",
              estimatedMinutes: document.estimatedMinutes || 8,
              sceneCount: document.scenes.length,
              isFreePreview: experience.isFreePreview,
              theme: document.theme,
            },
          ]
        : [];
    },
  );

  const totalMinutes = course.modules
    .flatMap((m) => m.lessons)
    .reduce((acc, l) => {
      const minutes = Number.parseInt(l.duration, 10);
      return Number.isFinite(minutes) ? acc + minutes : acc;
    }, 0);

  return (
    <div style={getCourseThemeStyle(course.theme) as CSSProperties} className="min-h-screen overflow-x-hidden bg-[var(--course-background)] text-[var(--course-text)]">
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
        <section className="border-b border-slate-200 bg-[var(--course-background)]">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
            <Link
              href="/courses"
              className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-950"
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
                {startStatus.label ? (
                  <p className="mb-6 text-sm text-slate-500">Starts {startStatus.label}</p>
                ) : null}
                <p className="mb-3 text-sm text-slate-500">{presentation.eyebrow}</p>
                <h1 className="mb-5 max-w-4xl break-words text-4xl font-medium leading-[1.08] tracking-tight text-slate-950 sm:text-5xl">
                  {course.title}
                </h1>
                <p className="mb-6 max-w-3xl break-words text-lg leading-8 text-slate-700 sm:text-xl">
                  {presentation.heroSubtitle || course.tagline}
                </p>
                {presentation.signal ? (
                  <div className="mb-8 flex max-w-3xl items-start gap-3 border-l-2 border-slate-300 pl-4">
                    <p className="text-sm leading-6 text-slate-800 sm:text-base">
                      {presentation.signal}
                    </p>
                  </div>
                ) : null}

                <div className="grid max-w-3xl gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3">
                  <HeroFact
                    icon={Clock}
                    label="Duration"
                    value={course.duration}
                  />
                  <HeroFact
                    icon={BookOpen}
                    label="Format"
                    value={
                      course.courseType === "live"
                        ? "Live cohort"
                        : "Self-paced"
                    }
                  />
                  <HeroFact
                    icon={Users}
                    label="Instructor"
                    value={course.instructor}
                  />
                </div>

                {course.courseType === "live" && (
                  <div className="mt-6 max-w-3xl border-t border-slate-200 pt-5">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-950">
                      <Wifi className="h-4 w-4" strokeWidth={1.75} />
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

        <CourseDetailTabs
          sections={[
            {
              id: "overview",
              label: "Overview",
              content: <OverviewPanel course={course} presentation={presentation} isAiQuickWins={isAiQuickWins} />,
            },
            {
              id: "outcomes",
              label: "Outcomes",
              content: <OutcomesPanel presentation={presentation} />,
            },
            ...(presentation.projectExamples?.length
              ? [{ id: "projects", label: "What you will build", content: <ProjectsPanel projects={presentation.projectExamples} /> }]
              : []),
            {
              id: "curriculum",
              label: "Curriculum",
              content: (
                <SectionFrame
                  title="Course outline"
                  meta={[
                    `${course.modulesCount} modules`,
                    `${course.lessonsCount} lessons`,
                    totalMinutes > 0 ? `about ${totalMinutes} min` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <CourseOutline modules={outlineModules} enrolled={isEnrolled} />
                </SectionFrame>
              ),
            },
            ...(experiences.length
              ? [
                  {
                    id: "experiences",
                    label: "Experiences",
                    content: (
                      <CourseExperienceGallery
                        courseSlug={course.slug}
                        courseIsFree={course.isFree}
                        isEnrolled={isEnrolled}
                        experiences={experiences}
                      />
                    ),
                  },
                ]
              : []),
            ...(skillChallenges.length
              ? [
                  {
                    id: "skills",
                    label: "Skill badges",
                    content: (
                      <SectionFrame
                        title="Daily skill badges"
                        meta="Short challenges that turn practice into earned skills."
                        action={
                          <Link
                            href={`/skills/${course.slug}`}
                            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-950"
                          >
                            Open skill path <ArrowRight className="h-4 w-4" />
                          </Link>
                        }
                      >
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {skillChallenges.slice(0, 6).map((challenge, index) => (
                            <div key={challenge.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-medium text-slate-600">
                                {index + 1}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {challenge.shortTitle || challenge.title}
                              </span>
                              <span className="text-xs text-slate-500">{challenge.points ?? 0} pts</span>
                            </div>
                          ))}
                        </div>
                      </SectionFrame>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </main>

      <SiteFooter />
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
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
          {value}
        </p>
      </div>
    </div>
  );
}

function SectionFrame({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-medium tracking-tight text-slate-950">{title}</h2>
            {meta ? <p className="mt-1.5 text-sm text-slate-500">{meta}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  );
}

function OverviewPanel({
  course,
  presentation,
  isAiQuickWins,
}: {
  course: CourseDetailData;
  presentation: CoursePresentation;
  isAiQuickWins: boolean;
}) {
  return (
    <SectionFrame title={presentation.overviewTitle}>
      <div className="max-w-3xl space-y-5 text-base leading-8 text-slate-700">
        {presentation.overview.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {presentation.gains?.length ? (
          <div className="border-t border-slate-200 pt-6">
            <h3 className="mb-3 text-base font-medium text-slate-950">
              {presentation.gainTitle || "What participants gain"}
            </h3>
            <div className="space-y-4">
              {presentation.gains.map((gain) => (
                <p key={gain}>{gain}</p>
              ))}
            </div>
          </div>
        ) : null}
        {!isAiQuickWins && course.longDescription ? (
          <div className="border-t border-slate-200 pt-6">
            <RichTextRenderer value={course.longDescription} className="break-words text-slate-700" />
          </div>
        ) : null}
      </div>
    </SectionFrame>
  );
}

function OutcomesPanel({ presentation }: { presentation: CoursePresentation }) {
  return (
    <SectionFrame title={presentation.learningTitle}>
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="grid content-start gap-x-8 gap-y-3">
          {presentation.learning.map((item, index) => (
            <div key={item} className="flex items-start gap-4 border-t border-slate-200 pt-3">
              <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-sm leading-6 text-slate-700">{item}</span>
            </div>
          ))}
        </div>
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-base font-medium text-slate-950">{presentation.audienceTitle}</h3>
            {presentation.audienceIntro ? (
              <p className="mb-3 text-sm leading-6 text-slate-600">{presentation.audienceIntro}</p>
            ) : null}
            <ul className="space-y-2">
              {presentation.audience.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                  <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-3 text-base font-medium text-slate-950">{presentation.outputTitle}</h3>
            <ul className="space-y-2">
              {presentation.outputs.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                  <CheckCircle className="mt-1 h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </SectionFrame>
  );
}

function ProjectsPanel({ projects }: { projects: string[] }) {
  return (
    <SectionFrame title="What you will build" meta="Leave with at least one practical system you can keep using.">
      <div className="grid gap-x-8 sm:grid-cols-2">
        {projects.map((project, index) => (
          <div key={project} className="flex items-start gap-4 border-t border-slate-200 py-4">
            <span className="text-xs tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span>
            <p className="text-sm leading-6 text-slate-800">{project}</p>
          </div>
        ))}
      </div>
    </SectionFrame>
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
    (rule) => rule.active !== false && rule.deadline,
  );

  return (
    <div className="w-full min-w-0 max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white shadow-floating lg:max-w-none">
      <div className="p-5 sm:p-6">
        <EnrollmentAwareActions
          courseSlug={course.slug}
          initialEnrolled={isEnrolled}
          initialProgress={enrollmentProgress}
          hasStarted={hasStarted}
          startDateLabel={startDateLabel}
        >
          <div className="mb-1 text-3xl font-medium tracking-tight text-slate-950">
            {formatCoursePrice(course)}
          </div>
          {!course.isFree && (
            <p className="mb-5 text-xs text-slate-500">
              One-time payment · Lifetime access
            </p>
          )}
          {startDateLabel && (
            <p className="mb-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
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
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
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
  currency?: string,
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
