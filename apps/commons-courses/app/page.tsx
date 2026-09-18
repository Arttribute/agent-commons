import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Boxes,
  Clock,
  Eye,
  Layers,
  Play,
  Wifi,
} from "lucide-react";
import { Nav } from "@/components/nav";
import { SandboxDemo } from "@/components/landing/sandbox-demo";
import { SiteFooter } from "@/components/site-footer";
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
    const courses = (await Course.find({
      published: true,
      catalogVisibility: { $ne: "private" },
    })
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
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
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
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 shadow-card transition-colors hover:bg-slate-50"
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
      className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-card transition-all hover:border-slate-300 hover:shadow-floating"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <CourseTypeBadge type={course.courseType} />
        <span className="text-sm font-semibold text-slate-950">
          {formatCoursePrice(course)}
        </span>
      </div>
      <h3 className="text-base font-medium text-slate-950">{course.title}</h3>
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
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card transition-all hover:border-slate-300 hover:shadow-floating"
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
            <p className="truncate text-xs text-slate-500">{pack.courseTitle}</p>
            <h3 className="mt-1 text-base font-medium text-slate-950">
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
        <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-700">
          Start the path <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
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

      <section className="border-b border-slate-200 bg-white pt-28">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-medium leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.4rem]">
              A <Highlight index={2}>controlled workspace</Highlight> for every
              learner.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Learners build, run and debug real AI agents in a guided sandbox.
              You bring the curriculum.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <PrimaryLink href="/auth/signup">
                Start learning <ArrowRight className="h-4 w-4" />
              </PrimaryLink>
              <SecondaryLink href="/educator">Teach with CommonLab</SecondaryLink>
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-4xl">
            <SandboxDemo />
          </div>
        </div>
      </section>

      <section id="practice" className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="max-w-2xl text-3xl font-medium tracking-tight text-slate-950">
            Practice in a <Highlight index={0}>safe environment</Highlight> before touching real tools.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              { icon: Boxes, title: "Build", body: "Create an agent from a lesson template, one guided step at a time." },
              { icon: Play, title: "Run", body: "Test it with the tools and sample data the educator allows." },
              { icon: Eye, title: "Review", body: "Inspect every log, tool call and output, then improve it." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
                <Icon className="h-5 w-5 text-slate-500" strokeWidth={1.75} />
                <h3 className="mt-4 text-[15px] font-medium text-slate-950">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {courses.length > 0 && (
        <section className="border-b border-slate-200 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading title="Featured courses" href="/courses" cta="All courses" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.slug} course={course} />
              ))}
            </div>
          </div>
        </section>
      )}

      {skillPacks.length > 0 && (
        <section className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <SectionHeading title="Daily skill paths" href="/skills" cta="All skills" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {skillPacks.map((pack, index) => (
                <SkillPackCard key={pack.skillSlug} pack={pack} index={index} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:px-8">
          <h2 className="max-w-2xl text-3xl font-medium tracking-tight text-slate-950">
            Teach AI agents with <Highlight index={3}>confidence</Highlight>.
          </h2>
          <p className="max-w-lg text-[15px] leading-7 text-slate-600">
            Courses, live sessions, skill badges and sandboxes in one console, with a copilot that helps you build them.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PrimaryLink href="/educator">
              Open the educator console <ArrowRight className="h-4 w-4" />
            </PrimaryLink>
            <SecondaryLink href="/courses">Browse courses</SecondaryLink>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function SectionHeading({ title, href, cta }: { title: string; href: string; cta: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h2 className="text-2xl font-medium tracking-tight text-slate-950">{title}</h2>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-sm text-slate-600 transition-colors hover:text-slate-950"
      >
        {cta} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
