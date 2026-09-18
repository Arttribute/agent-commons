import { Nav } from "@/components/nav";
import { CourseCard } from "@/components/courses/course-card";
import { BookOpen } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { auth } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Course from "@/models/Course";
import Enrollment from "@/models/Enrollment";
import type { CourseCardData } from "@/types";

async function getCourses(): Promise<CourseCardData[]> {
  try {
    const session = await auth();
    await connectDB();
    const courses = await Course.find({
      published: true,
      catalogVisibility: { $ne: "private" },
    })
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
      ]),
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
    <div className="min-h-screen bg-page">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-medium tracking-tight text-slate-950">Courses</h1>
          {courses.length ? (
            <p className="text-sm text-slate-500">
              {courses.length} course{courses.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white py-24 text-center">
            <BookOpen className="mx-auto mb-3 h-6 w-6 text-slate-300" strokeWidth={1.75} />
            <p className="text-sm text-slate-500">No courses yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course._id} course={course} enrolled={course.progress !== undefined} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
