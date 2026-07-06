import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Boxes,
  CheckCircle,
  Clock,
  Eye,
  FlaskConical,
  GraduationCap,
  Layers,
  Play,
  Rocket,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Wifi,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { SandboxDemo } from "@/components/landing/sandbox-demo";
import { chipStyles } from "@/lib/brand";
import {
  getLiveScheduleSummary,
  type LiveSchedule,
} from "@/lib/course-schedule";
import { connectDB } from "@/lib/db";
import { getPublicSkillsOverview } from "@/lib/skills-overview";
import { stripRichTextHtml } from "@/lib/rich-text";
import type { CourseSkillPack } from "@/types/skills";
import Course from "@/models/Course";

interface CourseData {
  title: string;
  slug: string;
  tagline: string;
  price: number;
  currency?: string;
  isFree: boolean;
  courseType: "self-paced" | "live";
  level: string;
  lessonsCount: number;
  modulesCount: number;
  duration: string;
  startDate?: string | null;
  liveSchedule?: LiveSchedule | null;
}

interface RawCourse {
  title: string;
  slug: string;
  tagline: string;
  price: number;
  currency?: string;
  isFree: boolean;
  courseType?: "self-paced" | "live";
  level: string;
  lessonsCount: number;
  modulesCount: number;
  duration: string;
  startDate?: Date | string | null;
  liveSchedule?: LiveSchedule | null;
  isMainFeatured?: boolean;
  isFeatured?: boolean;
}

async function getFeaturedCourses(): Promise<CourseData[]> {
  try {
    await connectDB();
    const courses = (await Course.find({ published: true })
      .sort({ isMainFeatured: -1, isFeatured: -1, createdAt: 1 })
      .select(
        "title slug tagline price currency isFree courseType level lessonsCount modulesCount duration startDate liveSchedule isMainFeatured isFeatured",
      )
      .lean()) as unknown as RawCourse[];

    return courses
      .filter((c) => c.isMainFeatured || c.isFeatured)
      .slice(0, 6)
      .map((c) => ({
        title: c.title,
        slug: c.slug,
        tagline: c.tagline,
        price: c.price,
        currency: c.currency,
        isFree: c.isFree,
        courseType: c.courseType ?? "self-paced",
        level: c.level,
        lessonsCount: c.lessonsCount,
        modulesCount: c.modulesCount,
        duration: c.duration,
        startDate: c.startDate
          ? new Date(c.startDate).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : null,
        liveSchedule: c.liveSchedule ?? null,
      }));
  } catch {
    return [];
  }
}

async function getFeaturedSkillPacks(): Promise<CourseSkillPack[]> {
  try {
    const { packs } = await getPublicSkillsOverview();
    return packs.slice(0, 3);
  } catch {
    return [];
  }
}

function CourseTypeBadge({ type }: { type: "self-paced" | "live" }) {
  if (type === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
        <Wifi className="h-3 w-3" /> Live cohort
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      <Play className="h-3 w-3" /> Self-paced
    </span>
  );
}

function formatCoursePrice(
  course: Pick<CourseData, "isFree" | "price" | "currency">,
) {
  if (course.isFree) return "Free";
  if (["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "")) {
    return `Ksh ${course.price.toLocaleString("en-KE")}`;
  }
  return `$${course.price}`;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

function Highlight({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 ${
        chipStyles[index % chipStyles.length]
      } ${className}`}
    >
      {children}
    </span>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
    >
      {children}
    </Link>
  );
}

function SecondaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}

function CourseCard({ course }: { course: CourseData }) {
  const scheduleSummary = getLiveScheduleSummary(course.liveSchedule);
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <CourseTypeBadge type={course.courseType} />
        <span className="text-sm font-semibold text-slate-950">
          {formatCoursePrice(course)}
        </span>
      </div>
      <h3 className="text-base font-semibold text-slate-950">{course.title}</h3>
      <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-slate-700">
        {course.tagline}
      </p>
      <div className="flex-1" />
      {course.startDate && (
        <p className="mt-4 rounded-lg bg-lime-50 px-3 py-2 text-xs font-semibold text-slate-800">
          Starts {course.startDate}
        </p>
      )}
      {scheduleSummary && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
          {scheduleSummary}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <span className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {course.modulesCount} modules
        </span>
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          {course.lessonsCount} lessons
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {course.duration}
        </span>
      </div>
    </Link>
  );
}

function SkillPackCard({
  pack,
  index,
}: {
  pack: CourseSkillPack;
  index: number;
}) {
  return (
    <Link
      href={`/skills/${pack.skillSlug}`}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      {pack.coverUrl ? (
        <div className="border-b border-slate-100 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pack.coverUrl}
            alt={pack.title}
            className="h-auto w-full rounded-lg object-contain"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center border-b border-slate-100 bg-slate-50 py-8">
          <span
            className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border ${
              chipStyles[index % chipStyles.length]
            }`}
          >
            <Award className="h-6 w-6" />
          </span>
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-widest text-slate-500">
              {pack.courseTitle}
            </p>
            <h3 className="mt-1.5 text-base font-semibold text-slate-950">
              {pack.title}
            </h3>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-black ${
              chipStyles[index % chipStyles.length]
            }`}
          >
            {pack.challenges.length} days
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-slate-700">
          {stripRichTextHtml(pack.learnerPromise || pack.subtitle || "")}
        </p>
        <div className="flex-1" />
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-slate-950">
          Start the path <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-950">
            <FlaskConical className="h-3 w-3 text-white" />
          </div>
          <span>© 2026 CommonLab</span>
        </div>
        <div className="flex gap-6">
          <Link href="/courses" className="hover:text-slate-950">
            Courses
          </Link>
          <Link href="/skills" className="hover:text-slate-950">
            Skills
          </Link>
          <Link href="/privacy" className="hover:text-slate-950">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-slate-950">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}

export default async function HomePage() {
  const [courses, skillPacks] = await Promise.all([
    getFeaturedCourses(),
    getFeaturedSkillPacks(),
  ]);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Nav />

      {/* Hero — the core offer, nothing else */}
      <section className="border-b border-slate-200 bg-white pt-28">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
              <FlaskConical className="h-3.5 w-3.5" />
              CommonLab — the AI agent learning workspace
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.4rem]">
              A <Highlight index={2}>controlled workspace</Highlight> for every
              learner.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              Bring your curriculum — CommonLab provides the guided sandbox
              where learners build, run, observe, and debug real AI agents,
              safely and step by step.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryLink href="/auth/signup">
                Start learning <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <SecondaryLink href="/educator">
                Teach with CommonLab
              </SecondaryLink>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
              {["Guided steps", "Permissioned tools", "Observable runs"].map(
                (item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-slate-900" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          {/* The guided sandbox, shown — not described */}
          <div className="mx-auto mt-14 max-w-4xl">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
              Take a look — the guided sandbox
            </p>
            <SandboxDemo />
          </div>
        </div>
      </section>

      {/* The practice layer */}
      <section
        id="practice"
        className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Eyebrow>Guided sandbox workflow</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Learners practice in a{" "}
              <Highlight index={0}>controlled environment</Highlight> before
              touching real tools.
            </h2>
            <p className="mt-4 text-[17px] leading-8 text-slate-700">
              Each learner gets an isolated workspace with only the tools their
              educator allows. They build an agent from a lesson template, run
              it against sample data, and review every step it took.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ["01", "Build", "Create an agent from a lesson template with guided steps."],
              ["02", "Run", "Test it live with permitted tools and sample data."],
              ["03", "Review", "Inspect logs, tool calls, and outputs — then iterate."],
            ].map(([num, title, body], index) => (
              <div
                key={num}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <span
                  className={`inline-flex rounded-md border px-2 py-1 text-xs font-black ${chipStyles[index]}`}
                >
                  {num}
                </span>
                <h3 className="mt-4 text-[15px] font-semibold text-slate-950">
                  {title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-slate-700">
                  {body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Boxes,
                title: "Isolated workspaces",
                desc: "Separate practice environments for every learner and cohort.",
              },
              {
                icon: Terminal,
                title: "Observable runs",
                desc: "Every task, log, tool call, and output can be replayed and reviewed.",
              },
              {
                icon: ShieldCheck,
                title: "Teaching guardrails",
                desc: "Limit tools, reset practice spaces, and review attempts.",
              },
              {
                icon: Users,
                title: "Multi-agent practice",
                desc: "Teach coordination, delegation, and collaboration patterns.",
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <Icon className="h-5 w-5 text-slate-900" />
                <h3 className="mt-4 text-[15px] font-semibold text-slate-950">
                  {title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-slate-700">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Educators */}
      <section id="educators" className="border-b border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[380px_1fr] lg:px-8">
          <div>
            <Eyebrow>For educators</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Bring your curriculum. CommonLab provides the{" "}
              <Highlight index={3}>learning workspace</Highlight>.
            </h2>
            <p className="mt-4 text-[17px] leading-8 text-slate-700">
              You focus on what to teach. CommonLab handles the environments,
              the guardrails, and the guided practice around it.
            </p>
            <Link
              href="/educator"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Open educator console <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Publish public or private courses",
              "Author guided sandbox activities with step-by-step walkthroughs",
              "Run 4 to 6 week cohorts or self-paced programs",
              "Attach daily skill badge challenges to course concepts",
              "Track enrolment, progress, and completion",
              "Create templates for agents, tools, and workflows",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-lg border border-slate-200 p-4"
              >
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-900" />
                <p className="text-[15px] leading-6 text-slate-800">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The full path — courses, skills, quests (after the core offer) */}
      <section className="border-b border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Eyebrow>Around the workspace</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              A clear path from concepts to{" "}
              <Highlight index={1}>badges</Highlight> to shipped work.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: GraduationCap,
                title: "Structured courses",
                desc: "Self-paced lessons, live cohorts, projects, and assessments — all built around sandbox practice.",
                href: "/courses",
                cta: "Browse courses",
              },
              {
                icon: Award,
                title: "Daily skill badges",
                desc: "Short daily challenges learners can finish, streak, and proudly collect.",
                href: "/skills",
                cta: "Explore skills",
              },
              {
                icon: Rocket,
                title: "Builder quests",
                desc: "Turn learning into prototypes, hackathons, build nights, demos, and startup pathways.",
                href: "/builders",
                cta: "See quests",
              },
            ].map(({ icon: Icon, title, desc, href, cta }, index) => (
              <Link
                key={title}
                href={href}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
              >
                <div
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-md border ${chipStyles[index]}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-950">
                  {title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-slate-700">
                  {desc}
                </p>
                <div className="flex-1" />
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-slate-950">
                  {cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured courses */}
      {courses.length > 0 && (
        <section className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Featured courses</Eyebrow>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  Start with a <Highlight index={4}>structured path</Highlight>.
                </h2>
              </div>
              <SecondaryLink href="/courses">
                Browse all courses <ArrowRight className="h-4 w-4" />
              </SecondaryLink>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured skill paths */}
      {skillPacks.length > 0 && (
        <section className="border-b border-slate-200 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Skill paths</Eyebrow>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                  Earn AI fluency one{" "}
                  <Highlight index={0}>daily badge</Highlight> at a time.
                </h2>
              </div>
              <SecondaryLink href="/skills">
                View all skills <ArrowRight className="h-4 w-4" />
              </SecondaryLink>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skillPacks.map((pack, index) => (
                <SkillPackCard
                  key={pack.skillSlug}
                  pack={pack}
                  index={index}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            <Sparkles className="h-3.5 w-3.5" />
            Get started
          </span>
          <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950">
            Give your learners a <Highlight index={2}>safe place</Highlight> to
            master AI agents.
          </h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <PrimaryLink href="/auth/signup">
              Create free account <ArrowRight className="h-4 w-4" />
            </PrimaryLink>
            <SecondaryLink href="/educator">Teach with CommonLab</SecondaryLink>
          </div>
          <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-500">
            <Eye className="h-4 w-4" />
            Every run stays observable, replayable, and reviewable.
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
