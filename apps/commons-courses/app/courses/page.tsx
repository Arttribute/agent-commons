import { Nav } from "@/components/nav";
import { CourseCard } from "@/components/courses/course-card";
import { BookOpen } from "lucide-react";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import type { CourseCardData } from "@/types";

async function getCourses(): Promise<CourseCardData[]> {
  try {
    await connectDB();
    const courses = await Course.find({ published: true })
      .select("-modules -longDescription")
      .sort({ createdAt: -1 })
      .lean();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return courses.map((c: any) => ({
      _id: (c._id as { toString(): string }).toString(),
      title: c.title,
      slug: c.slug,
      tagline: c.tagline,
      description: c.description,
      price: c.price,
      isFree: c.isFree,
      level: c.level,
      duration: c.duration,
      lessonsCount: c.lessonsCount,
      modulesCount: c.modulesCount,
      instructor: c.instructor,
      tags: c.tags,
    }));
  } catch {
    // Fallback to static data if DB not yet connected
    return [
      {
        _id: "1",
        title: "Fundamentals of AI Agents",
        slug: "fundamentals-of-ai-agents",
        tagline: "Build intelligent, autonomous agents from the ground up.",
        description: "A comprehensive introduction to AI agents.",
        price: 99,
        isFree: false,
        level: "beginner",
        duration: "8 hours",
        lessonsCount: 28,
        modulesCount: 6,
        instructor: "Agent Commons",
        tags: ["AI Agents", "LLMs", "MCP"],
      },
    ];
  }
}

export default async function CoursesPage() {
  const courses = await getCourses();
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="pt-20">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-slate-100">
          <div className="max-w-5xl mx-auto px-6 lg:px-12 py-16">
            <p className="text-xs tracking-[0.2em] uppercase text-slate-400 mb-4">
              All courses
            </p>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">
              Learn AI Agents.
            </h1>
            <p className="text-sm text-slate-500 max-w-md">
              Structured courses built by practitioners. From agent fundamentals
              to production deployment and the agentic economy.
            </p>
          </div>
        </div>

        {/* Courses grid */}
        <div className="max-w-5xl mx-auto px-6 lg:px-12 pt-10 pb-24">
          {courses.length === 0 ? (
            <div className="text-center py-24">
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-4" />
              <p className="text-sm text-slate-400">
                No courses yet. Check back soon.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400 mb-6">
                {courses.length} course{courses.length !== 1 ? "s" : ""}{" "}
                available
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {courses.map((course) => (
                  <CourseCard key={course._id} course={course} />
                ))}
              </div>
            </>
          )}
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
        <a
          href="https://agentcommons.io"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-700 transition-colors"
        >
          Agent Commons
        </a>
      </footer>
    </div>
  );
}
