import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { connectDB } from "@/lib/db";
import Enrollment from "@/models/Enrollment";
import { BookOpen, ArrowRight, Clock } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  await connectDB();
  const enrollments = await Enrollment.find({ userId: session.user.id })
    .populate("courseId")
    .sort({ enrolledAt: -1 })
    .lean();

  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="pt-24 pb-16 max-w-5xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-12">
          <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-3">
            Dashboard
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            Welcome back,{" "}
            {session.user?.name?.split(" ")[0] || session.user?.email}.
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Your enrolled courses and progress.
          </p>
        </div>

        {enrollments.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
            <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-4" />
            <h3 className="text-sm font-bold text-slate-700 mb-2">
              No courses yet
            </h3>
            <p className="text-sm text-slate-400 mb-6">
              Enrol in a course to get started.
            </p>
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#0a0a0a" }}
            >
              Browse courses <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {enrollments.map((enrollment: any) => {
              const course = enrollment.courseId;
              if (!course) return null;
              return (
                <Link
                  key={enrollment._id.toString()}
                  href={`/courses/${course.slug}`}
                  className="group flex flex-col rounded-xl border border-slate-200 bg-white hover:shadow-sm hover:border-slate-300 transition-all overflow-hidden"
                >
                  <div className="h-1 bg-slate-900" />
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-300 text-slate-600 bg-slate-50">
                        Enrolled
                      </span>
                      <span className="text-xs text-slate-400">
                        {enrollment.progress}% complete
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1.5 flex-1">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">{course.tagline}</p>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1 mb-3">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{
                          width: `${enrollment.progress}%`,
                          backgroundColor: "#0a0a0a",
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {course.duration}
                      </span>
                      <span
                        className="font-bold text-slate-900 group-hover:underline"
                      >
                        Continue →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Browse more */}
        <div className="mt-12 pt-8 border-t border-slate-100 flex items-center justify-between">
          <p className="text-sm text-slate-500">Looking for more courses?</p>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Browse all courses <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
