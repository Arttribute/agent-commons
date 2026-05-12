import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { CourseOutline } from "@/components/courses/course-outline";
import { EnrolButton } from "@/components/courses/enrol-button";
import { EnrolledBanner } from "@/components/courses/enrolled-banner";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import {
  ArrowLeft,
  Clock,
  BookOpen,
  BarChart2,
  Users,
  CheckCircle,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
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
  title: string;
  slug: string;
  tagline: string;
  description: string;
  longDescription: string;
  price: number;
  currency?: string;
  isFree: boolean;
  courseType: "self-paced" | "live";
  level: "beginner" | "intermediate" | "advanced";
  duration: string;
  lessonsCount: number;
  modulesCount: number;
  instructor: string;
  tags: string[];
  modules: ModuleData[];
}

function formatCoursePrice(course: { isFree: boolean; price: number; currency?: string }) {
  if (course.isFree) return "Free";
  if (["kes", "ksh"].includes(course.currency?.toLowerCase() ?? "")) {
    return `Ksh ${course.price.toLocaleString("en-KE")}`;
  }
  return `$${course.price}`;
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  await connectDB();
  const course = (await Course.findOne({ slug, published: true }).lean()) as
    | CourseDetailData
    | null;
  if (!course) notFound();

  const totalMinutes = course.modules
    .flatMap((m) => m.lessons)
    .reduce((acc, l) => acc + parseInt(l.duration), 0);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white">
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
                  <PurchaseCard course={course} />
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
                        How the lab fits in
                      </h2>
                      <p className="text-[15px] leading-7 text-slate-800">
                        CommonLab courses are designed to pair lessons with safe
                        agent practice: prompts, tool calls, workflows, logs,
                        and review checkpoints before learners move into real
                        integrations.
                      </p>
                    </div>
                  </div>
                </div>

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

                {/* Enrolled banner (shows for logged-in enrolled users) */}
                <div className="mb-8">
                  <EnrolledBanner courseSlug={course.slug} />
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
                  <CourseOutline modules={course.modules} enrolled={false} />
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

function PurchaseCard({ course }: { course: CourseDetailData }) {
  return (
    <div className="w-full min-w-0 max-w-sm rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm lg:max-w-none">
      <div className="h-1 bg-slate-900" />
      <div className="p-6">
        <div className="text-3xl font-bold text-slate-900 mb-1">
          {formatCoursePrice(course)}
        </div>
        {!course.isFree && (
          <p className="text-xs text-slate-400 mb-5">
            One-time payment · Lifetime access
          </p>
        )}

        <div className="mb-3">
          <EnrolButton
            courseSlug={course.slug}
            isFree={course.isFree}
            checkoutUrl={`/api/payments/checkout?courseSlug=${course.slug}`}
          />
        </div>

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
