import { Nav } from "@/components/nav";
import { CourseCard } from "@/components/courses/course-card";
import { BookOpen, FlaskConical } from "lucide-react";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { CourseCardData } from "@/types";

async function getCourses(): Promise<CourseCardData[]> {
  try {
    const session = await auth();
    await connectDB();
    const courses = await Course.find({ published: true })
      .select("-modules -longDescription")
      .sort({ createdAt: -1 })
      .lean();
    const courseIds = courses.map((course) => course._id);
    const enrollments = session?.user?.id
      ? await Enrollment.find({
          userId: session.user.id,
          courseId: { $in: courseIds },
        })
          .select("courseId progress")
          .lean()
      : [];
    const progressByCourseId = new Map(
      enrollments.map((enrollment) => [
        enrollment.courseId.toString(),
        enrollment.progress ?? 0,
      ])
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return courses.map((c: any) => ({
      _id: (c._id as { toString(): string }).toString(),
      title: c.title,
      slug: c.slug,
      tagline: c.tagline,
      description: c.description,
      price: c.price,
      currency: c.currency,
      isFree: c.isFree,
      courseType: c.courseType,
      startDate: c.startDate ? String(c.startDate) : null,
      liveSchedule: c.liveSchedule,
      level: c.level,
      duration: c.duration,
      lessonsCount: c.lessonsCount,
      modulesCount: c.modulesCount,
      instructor: c.instructor,
      tags: c.tags,
      imageUrl: c.imageUrl,
      bannerImageUrl: c.bannerImageUrl,
      previewImageUrl: c.previewImageUrl,
      progress: progressByCourseId.get(c._id.toString()),
    }));
  } catch {
    return [];
  }
}

export default async function CoursesPage() {
  const courses = await getCourses();
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <div className="pt-20">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
            <p className="mb-3 text-sm font-semibold text-slate-600">
              CommonLab catalog
            </p>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
              Courses for learning by building.
            </h1>
            <p className="mt-4 max-w-2xl text-[17px] leading-8 text-slate-800">
              Courses are the structured home for deeper learning. Educators can
              attach daily skill badges for focused practice, and larger builder
              quests can link back to the courses that prepare learners to ship.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "AI agents",
                "LLMs",
                "Skill badges",
                "Builder quests",
                "MCP",
                "Tool calls",
                "Workflows",
              ].map((item, index) => (
                <span
                  key={item}
                  className={[
                    "rounded-md border px-2.5 py-1 text-sm font-semibold",
                    [
                      "border-[#A6E45E] bg-[#B8F56D] text-slate-950",
                      "border-[#5DCDD5] bg-[#71E0E7] text-slate-950",
                      "border-[#F3D05C] bg-[#FFE177] text-slate-950",
                      "border-[#D58DD0] bg-[#E5A3DF] text-slate-950",
                      "border-[#899CE8] bg-[#9FB0F4] text-slate-950",
                      "border-[#E88EA3] bg-[#F3A2B4] text-slate-950",
                      "border-slate-300 bg-slate-100 text-slate-950",
                    ][index],
                  ].join(" ")}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          {courses.length === 0 ? (
            <div className="text-center py-24">
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-4" />
              <p className="text-sm text-slate-600">
                No courses yet. Check back soon.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[15px] text-slate-700">
                  {courses.length} course{courses.length !== 1 ? "s" : ""}{" "}
                  available
                </p>
                <p className="inline-flex items-center gap-1.5 text-[15px] text-slate-700">
                  <FlaskConical className="h-3.5 w-3.5" />
                  Lab environments are being expanded across the catalog
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <CourseCard
                    key={course._id}
                    course={course}
                    enrolled={course.progress !== undefined}
                  />
                ))}
              </div>
            </>
          )}
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
        </div>
      </footer>
    </div>
  );
}
