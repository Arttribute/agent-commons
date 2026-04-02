import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { CourseOutline } from "@/components/courses/course-outline";
import { coursesData } from "@/data/courses";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  BookOpen,
  BarChart2,
  Users,
  CheckCircle,
} from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params;
  const course = coursesData.find((c) => c.slug === slug);
  if (!course) notFound();

  const totalMinutes = course.modules
    .flatMap((m) => m.lessons)
    .reduce((acc, l) => acc + parseInt(l.duration), 0);

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="pt-20">
        {/* Hero */}
        <div className="relative overflow-hidden bg-white border-b border-slate-100">
          <div className="max-w-5xl mx-auto px-6 lg:px-12 py-14">
            <Link
              href="/courses"
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors mb-8"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> All courses
            </Link>

            <div className="grid lg:grid-cols-[1fr_320px] gap-12 items-start">
              {/* Left */}
              <div>
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-300 text-slate-600 bg-slate-50">
                    {course.level}
                  </span>
                  {course.isFree ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-300 text-slate-600 bg-slate-50">
                      Free
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-900 text-slate-900 bg-white">
                      Paid
                    </span>
                  )}
                </div>

                <h1 className="text-4xl font-bold text-slate-900 mb-4 leading-tight">
                  {course.title}
                </h1>
                <p className="text-slate-500 leading-relaxed mb-6 max-w-xl">
                  {course.tagline}
                </p>

                <div className="flex flex-wrap items-center gap-5 text-sm text-slate-400 mb-8">
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
                      className="text-xs px-2.5 py-1 rounded-full border border-slate-200 text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right: Purchase card (hero) */}
              <PurchaseCard course={course} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-w-5xl mx-auto px-6 lg:px-12 py-16">
          <div className="grid lg:grid-cols-[1fr_320px] gap-12">
            {/* Left: description + outline */}
            <div>
              {/* About */}
              <div className="mb-12">
                <h2 className="text-lg font-bold text-slate-900 mb-4">
                  About this course
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {course.longDescription}
                </p>
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
                      <span className="text-sm text-slate-700">{m.title}</span>
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
                <CourseOutline modules={course.modules} enrolled={false} />
              </div>
            </div>

            {/* Right: sticky purchase card */}
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <PurchaseCard course={course} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white px-6 lg:px-12 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 border-t border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded bg-slate-900 flex items-center justify-center">
            <BookOpen className="h-3 w-3 text-white" />
          </div>
          <span>© 2026 Agent Commons</span>
        </div>
        <Link href="/courses" className="hover:text-slate-700 transition-colors">
          Courses
        </Link>
      </footer>
    </div>
  );
}

function PurchaseCard({ course }: { course: (typeof coursesData)[0] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="h-1 bg-slate-900" />
      <div className="p-6">
        <div className="text-3xl font-bold text-slate-900 mb-1">
          {course.isFree ? "Free" : `$${course.price}`}
        </div>
        {!course.isFree && (
          <p className="text-xs text-slate-400 mb-5">
            One-time payment · Lifetime access
          </p>
        )}

        <Link
          href={`/api/payments/checkout?courseSlug=${course.slug}`}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-white text-sm font-bold hover:opacity-90 transition-opacity mb-3"
          style={{ backgroundColor: "#0a0a0a" }}
        >
          {course.isFree ? "Enrol for free" : "Enrol now"}{" "}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        <Link
          href="/auth/signup"
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Create account first
        </Link>

        <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5">
          {[
            `${course.lessonsCount} lessons`,
            `${course.duration} of content`,
            `${course.modulesCount} modules`,
            "Lifetime access",
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
