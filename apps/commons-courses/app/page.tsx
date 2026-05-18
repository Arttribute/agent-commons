import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle,
  Clock,
  FlaskConical,
  GraduationCap,
  Layers,
  Play,
  ShieldCheck,
  Terminal,
  Users,
  Wifi,
} from "lucide-react";
import { Nav } from "@/components/nav";
import {
  getLiveScheduleSummary,
  type LiveSchedule,
} from "@/lib/course-schedule";
import { connectDB } from "@/lib/db";
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
  description: string;
  lessonsCount: number;
  modulesCount: number;
  duration: string;
  tags: string[];
  imageUrl?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  startDate?: string | null;
  liveSchedule?: LiveSchedule | null;
  nextSessionDate?: string | null;
  modules: { title: string; lessons: { title: string }[] }[];
}

interface LandingData {
  mainFeatured: CourseData | null;
  featured: CourseData[];
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
  description: string;
  lessonsCount: number;
  modulesCount: number;
  duration: string;
  tags?: string[];
  imageUrl?: string | null;
  image?: string | null;
  bannerImage?: string | null;
  bannerImageUrl?: string | null;
  previewImageUrl?: string | null;
  thumbnail?: string | null;
  coverImage?: string | null;
  nextSessionDate?: Date | string | null;
  startDate?: Date | string | null;
  liveSchedule?: LiveSchedule | null;
  isMainFeatured?: boolean;
  isFeatured?: boolean;
  modules?: {
    title: string;
    lessons?: { title: string }[];
  }[];
}

async function getLandingData(): Promise<LandingData> {
  try {
    await connectDB();
    const courses = (await Course.find({ published: true })
      .sort({ isMainFeatured: -1, isFeatured: -1, createdAt: 1 })
      .select(
        "title slug tagline price currency isFree courseType level description lessonsCount modulesCount duration tags imageUrl bannerImageUrl previewImageUrl image bannerImage thumbnail coverImage startDate liveSchedule nextSessionDate modules isMainFeatured isFeatured",
      )
      .lean()) as unknown as RawCourse[];

    const toData = (c: RawCourse): CourseData => ({
      title: c.title,
      slug: c.slug,
      tagline: c.tagline,
      price: c.price,
      currency: c.currency,
      isFree: c.isFree,
      courseType: c.courseType ?? "self-paced",
      level: c.level,
      description: c.description,
      lessonsCount: c.lessonsCount,
      modulesCount: c.modulesCount,
      duration: c.duration,
      tags: c.tags ?? [],
      imageUrl:
        c.bannerImageUrl ??
        c.imageUrl ??
        c.bannerImage ??
        c.coverImage ??
        c.thumbnail ??
        c.image ??
        null,
      bannerImageUrl: c.bannerImageUrl ?? c.bannerImage ?? c.coverImage ?? null,
      previewImageUrl: c.previewImageUrl ?? null,
      startDate: c.startDate
        ? new Date(c.startDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null,
      liveSchedule: c.liveSchedule ?? null,
      nextSessionDate: c.nextSessionDate
        ? new Date(c.nextSessionDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : null,
      modules: (c.modules ?? []).map((m) => ({
        title: m.title,
        lessons: (m.lessons ?? []).map((l) => ({ title: l.title })),
      })),
    });

    const mainFeatured =
      courses.find((c) => c.isMainFeatured) ?? courses[0] ?? null;
    const featured = courses
      .filter((c) => c.isFeatured && c.slug !== mainFeatured?.slug)
      .slice(0, 3);

    return {
      mainFeatured: mainFeatured ? toData(mainFeatured) : null,
      featured: featured.map(toData),
    };
  } catch {
    return { mainFeatured: null, featured: [] };
  }
}

const chipStyles = [
  "bg-[#B8F56D] text-slate-950 border-[#A6E45E]",
  "bg-[#71E0E7] text-slate-950 border-[#5DCDD5]",
  "bg-[#FFE177] text-slate-950 border-[#F3D05C]",
  "bg-[#E5A3DF] text-slate-950 border-[#D58DD0]",
  "bg-[#9FB0F4] text-slate-950 border-[#899CE8]",
  "bg-[#F3A2B4] text-slate-950 border-[#E88EA3]",
];

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

function formatCoursePrice(course: Pick<CourseData, "isFree" | "price" | "currency">) {
  if (course.isFree) return "Free";
  if (["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "")) {
    return `Ksh ${course.price.toLocaleString("en-KE")}`;
  }
  return `$${course.price}`;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] font-semibold text-slate-700">{children}</p>;
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

function Marker({
  children,
  index = 0,
}: {
  children: React.ReactNode;
  index?: number;
}) {
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span
        className={`absolute -inset-x-2 bottom-1 top-2 rounded-lg border ${
          chipStyles[index % chipStyles.length]
        }`}
      />
      <span className="relative">{children}</span>
    </span>
  );
}

function HighlightPill({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-sm font-semibold ${
        chipStyles[index % chipStyles.length]
      }`}
    >
      {children}
    </span>
  );
}

function HeroPanel({ hero }: { hero: CourseData }) {
  return (
    <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <p className="text-[15px] font-semibold text-slate-700">
          Featured path
        </p>
        <h2 className="mt-2 line-clamp-2 min-h-[3.5rem] text-xl font-semibold leading-snug text-slate-950">
          {hero.title}
        </h2>
        <p className="mt-2 line-clamp-2 min-h-12 text-[15px] leading-6 text-slate-700">
          {hero.tagline}
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
        {[
          [hero.modulesCount, "Modules"],
          [hero.lessonsCount, "Lessons"],
          [hero.duration, "Duration"],
        ].map(([value, label]) => (
          <div key={label} className="p-4 text-center">
            <p className="text-lg font-semibold text-slate-950">{value}</p>
            <p className="mt-1 text-xs font-medium text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="space-y-3">
          {[
            "Course publishing and enrolment",
            "Guided learner projects",
            "Sandbox-ready agent exercises",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 text-[15px] text-slate-800"
            >
              <CheckCircle className="h-4 w-4 text-slate-900" />
              <span>{item}</span>
            </div>
          ))}
        </div>
        <div className="min-h-8 flex-1" />
        <Link
          href={`/courses/${hero.slug}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          View course <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function NoFeaturedCoursePanel() {
  return (
    <div className="flex min-h-[420px] flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-[15px] font-semibold text-slate-700">
          Featured path
        </p>
        <h2 className="mt-2 text-xl font-semibold leading-snug text-slate-950">
          Courses are loading from MongoDB.
        </h2>
        <p className="mt-2 text-[15px] leading-6 text-slate-700">
          Once a published course is available, it will appear here
          automatically.
        </p>
      </div>
      <Link
        href="/courses"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Browse courses <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function SandboxFlow() {
  const steps = [
    ["01", "Build", "Create an agent from a lesson template."],
    ["02", "Run", "Test it with limited tools and sample data."],
    ["03", "Review", "Inspect logs, outputs, and next steps."],
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            Guided sandbox workflow
          </h3>
          <p className="mt-1 text-[15px] leading-6 text-slate-700">
            Learners practice in a controlled environment before using real
            tools or production data.
          </p>
        </div>
        <span className="self-start rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          Safe practice
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(([num, title, body], index) => (
          <div key={num} className="rounded-lg border border-slate-200 p-4">
            <span
              className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${chipStyles[index]}`}
            >
              {num}
            </span>
            <h4 className="mt-4 text-[15px] font-semibold text-slate-950">
              {title}
            </h4>
            <p className="mt-2 text-[15px] leading-6 text-slate-700">{body}</p>
          </div>
        ))}
      </div>
    </div>
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
          <Link href="/terms" className="hover:text-slate-950">
            Terms
          </Link>
          <a
            href="https://agentcommons.io"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-950"
          >
            Agent Commons
          </a>
        </div>
      </div>
    </footer>
  );
}

export default async function HomePage() {
  const { mainFeatured: mainFeaturedRaw, featured } = await getLandingData();
  const hero = mainFeaturedRaw;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Nav />

      <section className="border-b border-slate-200 bg-white pt-28">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
          <div>
            <Eyebrow>CommonLab</Eyebrow>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-[3.25rem]">
              A practical space for{" "}
              <Marker index={0}>teaching and learning</Marker>{" "}
              <Highlight index={2} className="whitespace-nowrap">
                AI&nbsp;agents
              </Highlight>
              .
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-800">
              CommonLab helps educators publish courses and gives learners a
              safe place to build, run, observe, and debug agents before using
              real-world tools.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/courses"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Explore courses <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/educator"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Teach with CommonLab
              </Link>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                ["Courses", "Lessons, cohorts, enrolment"],
                ["Labs", "Guided sandbox exercises"],
                ["Review", "Progress, traces, outputs"],
              ].map(([value, label], index) => (
                <div key={value} className="rounded-lg border border-slate-200 p-4">
                  <HighlightPill index={index}>{value}</HighlightPill>
                  <p className="mt-3 text-[15px] leading-6 text-slate-700">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:pt-10">
            {hero ? <HeroPanel hero={hero} /> : <NoFeaturedCoursePanel />}
          </div>
        </div>
      </section>

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <Eyebrow>What CommonLab does</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Course delivery, <Highlight index={1}>hands-on practice</Highlight>,
              and safe agent exploration in one place.
            </h2>
            <p className="mt-4 text-[17px] leading-8 text-slate-800">
              Learners do not need to jump between scattered tools and risky
              integrations. Educators can structure the learning journey while
              learners practice with visible, reviewable agent work.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: GraduationCap,
                title: "Structured courses",
                desc: "Publish self-paced lessons, live cohorts, projects, and assessments.",
              },
              {
                icon: FlaskConical,
                title: "Hands-on labs",
                desc: "Attach sandbox exercises for prompts, tool calls, memory, APIs, and workflows.",
              },
              {
                icon: ShieldCheck,
                title: "Safe practice",
                desc: "Let learners test agent behavior before moving into live accounts and data.",
              },
            ].map(({ icon: Icon, title, desc }, index) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-6">
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
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="sandboxes"
        className="border-y border-slate-200 bg-slate-50 py-16"
      >
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <Eyebrow>Sandbox layer</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              A <Highlight index={2}>controlled workspace</Highlight> for each
              learner, cohort, or team.
            </h2>
            <p className="mt-4 text-[17px] leading-8 text-slate-800">
              The course structure stays familiar: enrol, learn, complete
              lessons, and submit projects. The lab layer adds isolated
              workspaces, observable runs, and permissioned tools.
            </p>
          </div>

          <SandboxFlow />
        </div>

        <div className="mx-auto mt-6 grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
          {[
            {
              icon: Boxes,
              title: "Isolated runtimes",
              desc: "Separate practice environments for learners and cohorts.",
            },
            {
              icon: Terminal,
              title: "Run history",
              desc: "Review tasks, logs, tool calls, files, and outputs.",
            },
            {
              icon: Users,
              title: "Multi-agent practice",
              desc: "Teach coordination, delegation, and collaboration patterns.",
            },
            {
              icon: ShieldCheck,
              title: "Teaching guardrails",
              desc: "Limit tools, reset labs, and review attempts.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <Icon className="h-5 w-5 text-slate-900" />
              <h3 className="mt-4 text-[15px] font-semibold text-slate-950">
                {title}
              </h3>
              <p className="mt-2 text-[15px] leading-6 text-slate-700">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="educators" className="bg-white py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
          <div>
            <Eyebrow>For educators</Eyebrow>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              Bring your curriculum. CommonLab provides the{" "}
              <Highlight index={3}>learning workspace</Highlight>.
            </h2>
            <Link
              href="/educator"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Open educator console <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Publish public or private courses",
              "Run 4 to 6 week cohorts or self-paced programs",
              "Attach sandbox exercises to lessons",
              "Track enrolment, progress, and completion",
              "Create templates for agents, tools, and workflows",
              "Offer affordable access for learners and communities",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
                <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-900" />
                <p className="text-[15px] leading-6 text-slate-800">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {hero && (
        <section className="border-y border-slate-200 bg-white py-16">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
            <div>
              <Eyebrow>Featured course</Eyebrow>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                Start with a <Highlight index={4}>structured path</Highlight>,
                then practice in the lab.
              </h2>
              <p className="mt-4 text-[17px] leading-8 text-slate-800">
                CommonLab continues to support the course structure already in
                place while preparing the product for educator-created courses
                and attached lab environments.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <CourseTypeBadge type={hero.courseType} />
                  <span className="text-xl font-semibold text-slate-950">
                    {formatCoursePrice(hero)}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {hero.title}
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-slate-700">
                  {hero.tagline}
                </p>
                {hero.startDate && (
                  <p className="mt-4 rounded-lg bg-lime-50 px-3 py-2 text-sm font-semibold text-slate-800">
                    Starts {hero.startDate}
                  </p>
                )}
                {getLiveScheduleSummary(hero.liveSchedule) && (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                    {getLiveScheduleSummary(hero.liveSchedule)}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-200 pt-5 text-sm text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-4 w-4" />
                    {hero.modulesCount} modules
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    {hero.lessonsCount} lessons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {hero.duration}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {hero.modules.slice(0, 6).map((m, i) => (
                  <div
                    key={m.title}
                    className="flex items-center gap-3 px-5 py-3.5 sm:px-6"
                  >
                    <span className="w-6 text-xs font-semibold tabular-nums text-slate-500">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-[15px] leading-6 text-slate-800">
                      {m.title}
                    </span>
                    <span className="text-sm text-slate-500">
                      {m.lessons.length}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 bg-slate-50 p-5 sm:p-6">
                <Link
                  href={`/courses/${hero.slug}`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  View course <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="bg-slate-50 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Eyebrow>More courses</Eyebrow>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((c) => (
                <Link
                  key={c.slug}
                  href={`/courses/${c.slug}`}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <CourseTypeBadge type={c.courseType} />
                    <span className="text-sm font-semibold text-slate-950">
                      {formatCoursePrice(c)}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-950">
                    {c.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-slate-700">
                    {c.tagline}
                  </p>
                  {c.startDate && (
                    <p className="mt-4 rounded-lg bg-lime-50 px-3 py-2 text-xs font-semibold text-slate-800">
                      Starts {c.startDate}
                    </p>
                  )}
                  {getLiveScheduleSummary(c.liveSchedule) && (
                    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      {getLiveScheduleSummary(c.liveSchedule)}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                    <span>{c.modulesCount} modules</span>
                    <span>{c.lessonsCount} lessons</span>
                    <span>{c.duration}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Eyebrow>Get started</Eyebrow>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950">
            Make AI agents understandable by giving learners a{" "}
            <Highlight index={0}>safe place</Highlight> to build and inspect
            them.
          </h2>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/signup"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/courses"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Browse courses
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
